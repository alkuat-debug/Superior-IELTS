const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".css": "text/css; charset=utf-8", ".ico": "image/x-icon" };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400).end("Bad request"); return; }
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
  fs.stat(file, (err, info) => {
    if (err || !info.isFile()) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": path.basename(file) === "index.html" ? "no-cache" : "public, max-age=3600" });
    fs.createReadStream(file).pipe(res);
  });
}).listen(Number(process.env.PORT || 8000), "127.0.0.1", () => console.log("Superior IELTS: http://localhost:8000"));
