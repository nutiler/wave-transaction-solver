import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/core.js': ['core.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const extensionFiles = {'workspace-v1.js':'text/javascript','finance-home.js':'text/javascript','data-workspace.js':'text/javascript','finance.css':'text/css','data-index.js':'text/javascript','migration.js':'text/javascript','helper-launch.js':'text/javascript', 'helper-tabs.js':'text/javascript', 'paypal-download.js':'text/javascript', 'helper-bridge.js':'text/javascript', 'wave-download-fixture.html':'text/html','wave-download-fixture.js':'text/javascript', 'download-files.js':'text/javascript','download-pages.js':'text/javascript','download-app.js':'text/javascript','amazon-download.html':'text/html','wave-export.html':'text/html','download-fixture.html':'text/html','download-fixture.js':'text/javascript', 'paypal-csv.js':'text/javascript','paypal.js':'text/javascript','paypal-page.js':'text/javascript','paypal.html':'text/html','paypal-app.js':'text/javascript','paypal-fixture.html':'text/html','paypal-fixture.js':'text/javascript', 'live-records.js':'text/javascript', 'operator-fixture.html':'text/html','operator-fixture.js':'text/javascript','command-fixture.html':'text/html','command-fixture.js':'text/javascript','command-center.js':'text/javascript','command-view.js':'text/javascript','operator-decisions.js':'text/javascript','automation.js':'text/javascript','automation-view.js':'text/javascript', 'source-fixture.html':'text/html','source-fixture.js':'text/javascript', 'source-view.js':'text/javascript','source-files.js':'text/javascript','source-pdf.js':'text/javascript','service-solvers.js':'text/javascript','vendor/pdf.min.mjs':'text/javascript','vendor/pdf.worker.min.mjs':'text/javascript', 'venmo-fixture.html':'text/html','venmo-fixture.js':'text/javascript', 'venmo.js':'text/javascript','venmo-page.js':'text/javascript','venmo.html':'text/html','venmo-app.js':'text/javascript', 'remaining-groups.js':'text/javascript','remaining-view.js':'text/javascript', 'amazon.js':'text/javascript','amazon-view.js':'text/javascript','amazon-fixture.html':'text/html','amazon-fixture.js':'text/javascript', 'all-collection.js':'text/javascript', 'inspection.js':'text/javascript','inspection-view.js':'text/javascript', 'activity.js':'text/javascript','activity-fixture.html':'text/html','activity-fixture.js':'text/javascript', 'suggestions.js':'text/javascript','suggestion-fixture.html':'text/html','suggestion-fixture.js':'text/javascript', 'workspace-fixture.html':'text/html','workspace-fixture.js':'text/javascript', 'usage-flow.js':'text/javascript', 'workspace-ui.js':'text/javascript', 'list-scan.js':'text/javascript','list-view.js':'text/javascript','list-fixture.html':'text/html','list-fixture.js':'text/javascript', 'expense-batch.js':'text/javascript', 'transfer-menu-fixture.html':'text/html','transfer-menu-fixture.js':'text/javascript', 'transfer-menu.js':'text/javascript', 'transfers.js':'text/javascript','transfer-view.js':'text/javascript', 'integration-fixture.html':'text/html', 'integration-fixture.js':'text/javascript', 'rules.js':'text/javascript', 'analysis.js':'text/javascript', 'rule-pack.js':'text/javascript', 'proposal-view.js':'text/javascript', 'proposal-fixture.html':'text/html', 'proposal-fixture.js':'text/javascript', 'editor-fixture.html': 'text/html', 'editor-fixture.js': 'text/javascript', 'editor.js': 'text/javascript', 'app.html': 'text/html', 'app.js': 'text/javascript', 'app.css': 'text/css', 'model.js': 'text/javascript', 'csv.js': 'text/javascript', 'live-reader.js': 'text/javascript', 'chart-reader.js': 'text/javascript', 'catalog.js': 'text/javascript', 'session.js': 'text/javascript', 'workflow.js': 'text/javascript', 'history-view.js':'text/javascript', 'history-fixture.html':'text/html', 'history-fixture.js':'text/javascript', 'history.js': 'text/javascript', 'plan.js': 'text/javascript', 'reader-fixture.html': 'text/html', 'reader-fixture.js': 'text/javascript' };
extensionFiles['helper-status.js']='text/javascript';
for(const name of ['venmo-funding.js','venmo-funding-runner.js','venmo-funding-wave.js','venmo-funding-view.js','venmo-funding-fixture.js'])extensionFiles[name]='text/javascript';
extensionFiles['venmo-funding-fixture.html']='text/html';
for(const name of ['venmo-reconciliation.js','venmo-repair-runner.js','venmo-repair-page.js','venmo-repair-view.js','venmo-repair-diagnostics.js','venmo-repair-fixture.js','venmo-repair-fixture-data.js'])extensionFiles[name]='text/javascript';
extensionFiles['venmo-repair-fixture.html']='text/html';
extensionFiles['diagnostic-fixture.html']='text/html';
for(const name of ['diagnostic-log.js','diagnostic-console.js','diagnostic-fixture.js'])extensionFiles[name]='text/javascript';
extensionFiles['paypal-collection.js']='text/javascript';
extensionFiles['command-guidance.js']='text/javascript';
extensionFiles['saved-recovery.js']='text/javascript';
extensionFiles['collection-status.js']='text/javascript';
extensionFiles['venmo-empty.js']='text/javascript';
extensionFiles['venmo-empty-fixture.html']='text/html';
extensionFiles['venmo-empty-fixture.js']='text/javascript';
for(const name of ['subscriptions.js','subscription-view.js','subscription-worker.js','subscription-fixture.js'])extensionFiles[name]='text/javascript';
extensionFiles['subscription-fixture.html']='text/html';
for(const name of ['apple-card.js','apple-card-page.js','apple-card-wave.js','apple-card-runner.js','apple-card-app.js','apple-card-fixture.js'])extensionFiles[name]='text/javascript';
extensionFiles['apple-card.html']='text/html';extensionFiles['apple-card-fixture.html']='text/html';extensionFiles['apple-card.css']='text/css';
const port = Number(process.env.PORT || 4317);
http.createServer(async (req, res) => {
  const requestPath=new URL(req.url,'http://127.0.0.1').pathname;
  const extensionName = requestPath.startsWith('/extension/') ? requestPath.slice('/extension/'.length) : '';
  const isExtension = Object.hasOwn(extensionFiles, extensionName);
  const file = isExtension ? [extensionName, extensionFiles[extensionName]] : files[requestPath];
  if (req.method !== 'GET' || !file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(`./${isExtension ? 'extension' : 'public'}/${file[0]}`, import.meta.url));
    const framePolicy = isExtension && file[0] === 'integration-fixture.html' ? "'self'" : "'none'";
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors ${framePolicy}` });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load application'); }
}).listen(port, '127.0.0.1', () => console.log(`Transaction organizer: http://127.0.0.1:${port}`));
