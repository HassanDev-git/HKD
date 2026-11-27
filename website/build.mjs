import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { navigation, pages } from "./src/pages.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "dist");
const siteUrl = new URL(process.env.HKD_SITE_URL || "https://hkd-lang.dev");
if (!/^https?:$/.test(siteUrl.protocol) || siteUrl.username || siteUrl.password) throw new Error("HKD_SITE_URL must be a public HTTP(S) origin without credentials");
const basePath = siteUrl.pathname.replace(/\/+$/, "");
siteUrl.pathname = basePath;
siteUrl.search = "";
siteUrl.hash = "";
const origin = siteUrl.origin;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function routePath(slug) { return slug ? `/${slug}/` : "/"; }
function routeHref(fromSlug, toSlug) {
  const base = fromSlug ? "../" : "";
  return `${base}${toSlug ? `${toSlug}/` : "./"}`;
}

function renderNav(page, mobile = false) {
  return navigation.map(([slug, label]) => {
    const current = page.nav === slug ? ' aria-current="page"' : "";
    return `<a href="${routeHref(page.slug, slug === "home" ? "" : slug)}"${current}>${label}</a>`;
  }).join("");
}

function render(page) {
  const depth = page.slug ? 1 : 0;
  const assetPrefix = depth ? "../assets/" : "assets/";
  const canonical = `${origin}${basePath}${routePath(page.slug)}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const content = page.html.replaceAll(/href="site:([a-z-]+)"/g, (_match, slug) => `href="${routeHref(page.slug, slug)}"`);
  const softwareData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "HKD Programming Language",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, Linux, macOS",
    softwareVersion: "1.1.1",
    codeRepository: "https://github.com/HassanDev-git/HKD",
    downloadUrl: "https://github.com/HassanDev-git/HKD/releases/latest",
  });
  const nav = renderNav(page);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#090b12">
  <meta name="description" content="${description}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="${assetPrefix}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${assetPrefix}site.css">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="HKD">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(`${origin}${basePath}/assets/og.svg`)}">
  <meta property="og:image:type" content="image/svg+xml">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:image" content="${escapeHtml(`${origin}${basePath}/assets/og.svg`)}">
  <title>${title} · HKD</title>
  <script type="application/ld+json">${softwareData}</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="${routeHref(page.slug, "")}" aria-label="HKD home"><span class="brand-mark" aria-hidden="true">H</span><span><span class="wordmark">HKD</span><small>LANGUAGE TOOLCHAIN</small></span></a>
    <nav class="desktop-nav" aria-label="Main navigation">${nav}</nav>
    <a class="header-cta" href="${routeHref(page.slug, "downloads")}">Download <span data-release-version>v1.1.1</span></a>
    <details class="mobile-menu"><summary aria-label="Open menu">Menu</summary><nav aria-label="Mobile navigation">${renderNav(page, true)}</nav></details>
  </div></header>
  <main id="main" class="page-shell">
    <section class="hero reveal"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.heading)}</h1><p class="lead">${escapeHtml(page.lead)}</p></section>
    <div class="page-content reveal">${content}</div>
  </main>
  <footer class="site-footer"><div class="footer-inner"><p>HKD · Open-source programming language · MIT License</p><nav class="footer-links" aria-label="Footer navigation"><a href="${routeHref(page.slug, "docs")}">Docs</a><a href="${routeHref(page.slug, "downloads")}">Downloads</a><a href="https://github.com/HassanDev-git/HKD">GitHub</a><a href="${routeHref(page.slug, "security")}">Security</a></nav></div></footer>
  <script type="module" src="${assetPrefix}site.js"></script>
</body>
</html>
`;
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "assets"), { recursive: true });
for (const asset of ["site.css", "site.js", "downloads.mjs"]) {
  await fs.copyFile(path.join(root, "src", asset), path.join(output, "assets", asset));
}
for (const asset of ["favicon.svg", "og.svg"]) {
  await fs.copyFile(path.join(root, "public", asset), path.join(output, "assets", asset));
}
for (const page of pages) {
  const directory = page.slug ? path.join(output, page.slug) : output;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "index.html"), render(page));
}
await fs.writeFile(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origin}${basePath}/sitemap.xml\n`);
const urls = pages.map((page) => `  <url><loc>${escapeHtml(origin + basePath + routePath(page.slug))}</loc></url>`).join("\n");
await fs.writeFile(path.join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`Built ${pages.length} static HKD pages at ${output} (canonical base ${origin || "/"}).`);
