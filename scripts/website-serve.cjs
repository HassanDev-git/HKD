const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(process.env.HKD_WEBSITE_DIST || path.join(__dirname, "..", "website", "dist"));
const port = Number(process.env.PORT || 4173);
const types = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".svg", "image/svg+xml"], [".xml", "application/xml; charset=utf-8"], [".txt", "text/plain; charset=utf-8"]]);

http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  let filename = path.resolve(root, `.${pathname}`);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end("Forbidden"); return; }
  if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename, "index.html");
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404).end("Not found"); return; }
  response.writeHead(200, { "Content-Type": types.get(path.extname(filename)) || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
  fs.createReadStream(filename).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`HKD website preview at http://127.0.0.1:${port}/`));
