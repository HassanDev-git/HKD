const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function main() {
  const websiteRoot = path.resolve(__dirname, "..", "website");
  const outputRoot = path.join(websiteRoot, "dist");
  const { pages, examples } = await import(pathToFileURL(path.join(websiteRoot, "src", "pages.mjs")).href);
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(__dirname, "website-serve.cjs")], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", (data) => { logs += data.toString(); });
  server.stderr.on("data", (data) => { logs += data.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { ready = (await fetch(`${baseUrl}/`)).status === 200; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `preview server failed to start: ${logs}`);

    for (const page of pages) {
      const route = page.slug ? `/${page.slug}/` : "/";
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      assert.match(html, /<html lang="en">/);
      assert.match(html, /<main id="main"/);
      assert.match(html, /class="skip-link" href="#main"/);
      assert.match(html, /<link rel="canonical"/);
      assert.match(html, /property="og:title"/);
      assert.match(html, /property="og:image"/);
      assert.match(html, /name="twitter:card"/);
      assert.match(html, /<nav[^>]*aria-label="Main navigation"/);
      assert.match(html, /href="[^"]+\.css"/);
      assert.match(html, /src="[^"]+site\.js"/);
      const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
      for (const href of links) {
        if (/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(href)) continue;
        const url = new URL(href, `${baseUrl}${route}`);
        const targetPath = decodeURIComponent(url.pathname);
        let localPath = path.resolve(outputRoot, `.${targetPath}`);
        if (localPath !== outputRoot && !localPath.startsWith(`${outputRoot}${path.sep}`)) throw new Error(`Path escapes static output: ${href}`);
        if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) localPath = path.join(localPath, "index.html");
        assert.ok(fs.existsSync(localPath), `Broken local link on ${route}: ${href}`);
      }
    }

    assert.equal((await fetch(`${baseUrl}/robots.txt`)).status, 200);
    const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
    assert.equal((sitemap.match(/<url>/g) || []).length, pages.length);
    const cssResponse = await fetch(`${baseUrl}/assets/site.css`);
    assert.equal(cssResponse.status, 200);
    const css = await cssResponse.text();
    assert.match(css, /max-width:560px/);
    assert.match(css, /@media\(max-width:920px\)\{\.desktop-nav\{display:none\}\.mobile-menu\{display:block\}/);
    assert.match(css, /prefers-reduced-motion/);
    assert.ok(fs.existsSync(path.join(outputRoot, "assets", "og.svg")));

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-website-examples-"));
    try {
      const cli = path.resolve(__dirname, "..", "dist", "cli", "main.js");
      for (const example of examples) {
        const source = path.join(temp, "example.hkd");
        fs.writeFileSync(source, `${example.source}\n`, "utf8");
        const check = spawnSync(process.execPath, [cli, "check", source], { cwd: temp, encoding: "utf8", timeout: 30000 });
        assert.equal(check.status, 0, `Example typecheck failed: ${check.stdout}\n${check.stderr}`);
        const run = spawnSync(process.execPath, [cli, "run", source], { cwd: temp, encoding: "utf8", timeout: 30000 });
        assert.equal(run.status, 0, `Example execution failed: ${run.stdout}\n${run.stderr}`);
        assert.ok(`${run.stdout}${run.stderr}`.includes(example.output), `Expected output missing: ${example.output}`);
      }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
    console.log(`Website smoke passed: ${pages.length} pages, internal links, metadata, sitemap, static serving, and ${examples.length} compiler-executed examples.`);
  } finally {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
