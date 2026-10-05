import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/core.js': ['core.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const extensionFiles = { 'suggestions.js':'text/javascript','suggestion-fixture.html':'text/html','suggestion-fixture.js':'text/javascript', 'workspace-fixture.html':'text/html','workspace-fixture.js':'text/javascript', 'workspace-ui.js':'text/javascript', 'list-scan.js':'text/javascript','list-view.js':'text/javascript','list-fixture.html':'text/html','list-fixture.js':'text/javascript', 'expense-batch.js':'text/javascript', 'transfer-menu-fixture.html':'text/html','transfer-menu-fixture.js':'text/javascript', 'transfer-menu.js':'text/javascript', 'transfers.js':'text/javascript','transfer-view.js':'text/javascript', 'integration-fixture.html':'text/html', 'integration-fixture.js':'text/javascript', 'rules.js':'text/javascript', 'analysis.js':'text/javascript', 'rule-pack.js':'text/javascript', 'proposal-view.js':'text/javascript', 'proposal-fixture.html':'text/html', 'proposal-fixture.js':'text/javascript', 'editor-fixture.html': 'text/html', 'editor-fixture.js': 'text/javascript', 'editor.js': 'text/javascript', 'app.html': 'text/html', 'app.js': 'text/javascript', 'app.css': 'text/css', 'model.js': 'text/javascript', 'csv.js': 'text/javascript', 'live-reader.js': 'text/javascript', 'chart-reader.js': 'text/javascript', 'catalog.js': 'text/javascript', 'session.js': 'text/javascript', 'workflow.js': 'text/javascript', 'history-view.js':'text/javascript', 'history-fixture.html':'text/html', 'history-fixture.js':'text/javascript', 'history.js': 'text/javascript', 'plan.js': 'text/javascript', 'reader-fixture.html': 'text/html', 'reader-fixture.js': 'text/javascript' };
const port = Number(process.env.PORT || 4317);
http.createServer(async (req, res) => {
  const extensionName = req.url?.startsWith('/extension/') ? req.url.slice('/extension/'.length) : '';
  const isExtension = Object.hasOwn(extensionFiles, extensionName);
  const file = isExtension ? [extensionName, extensionFiles[extensionName]] : files[req.url];
  if (req.method !== 'GET' || !file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(`./${isExtension ? 'extension' : 'public'}/${file[0]}`, import.meta.url));
    const framePolicy = isExtension && file[0] === 'integration-fixture.html' ? "'self'" : "'none'";
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors ${framePolicy}` });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load application'); }
}).listen(port, '127.0.0.1', () => console.log(`Transaction organizer: http://127.0.0.1:${port}`));
