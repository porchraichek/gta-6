// Headless Chrome driver over the DevTools protocol (Node 22+ standard library only).
// Starts a static server for game/, launches Chrome, and exposes eval / keys / screenshot helpers.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../game', import.meta.url)));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return new Promise((res) => {
    const srv = createServer(async (req, out) => {
      const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      const file = p.endsWith('\\') || p.endsWith('/') || p === ROOT ? join(p, 'index.html') : p;
      try {
        const body = await readFile(file);
        out.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        out.end(body);
      } catch { out.writeHead(404); out.end(); }
    });
    srv.listen(0, () => res(srv));
  });
}

export async function openGame(query = '', { width = 1280, height = 720 } = {}) {
  const srv = await serve();
  const port = srv.address().port;
  const dbg = 9300 + Math.floor(Math.random() * 600);
  const dir = await mkdtemp(join(tmpdir(), 'pn-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(150);
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) throw new Error('chrome did not start');
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [], logs = [], requests = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`${d.exception?.description || d.text} @${d.url}:${d.lineNumber}`);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (msg.params.type === 'error') errors.push('console.error: ' + text); else logs.push(text);
    } else if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url;
      if (!u.startsWith(`http://localhost:${port}`) && !u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith('data:')) requests.push(u);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('log: ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://localhost:${port}/index.html${query}` });

  const page = {
    errors, logs, requests, send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, ms = 60000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await page.eval(expr)) return true; } catch { /* page loading */ } await sleep(200); }
      throw new Error('timeout waiting for ' + expr);
    },
    async key(code, type = 'press') {
      const key = code.replace(/^Key|^Digit/, '');
      const kinds = type === 'press' ? ['keyDown', 'keyUp'] : [type === 'down' ? 'keyDown' : 'keyUp'];
      for (const t of kinds) await send('Input.dispatchKeyEvent', { type: t, code, key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 });
    },
    async click(x, y, button = 'left') {
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });
    },
    async screenshot(file, { format = 'jpeg', quality = 88 } = {}) {
      const r = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? quality : undefined });
      const buf = Buffer.from(r.data, 'base64');
      if (file) await writeFile(file, buf);
      return buf;
    },
    sleep,
    async close() { try { ws.close(); } catch { /* ignore */ } chrome.kill(); srv.close(); },
  };
  return page;
}

// CLI: node tools/browser.mjs "?query" script.js [shot.jpg]   — runs script.js's text as an async page expression after load.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [query = '', scriptFile, shot] = process.argv.slice(2);
  const page = await openGame(query);
  try {
    await page.waitFor('window.__game && window.__game.state !== "loading"');
    if (scriptFile) {
      const src = await readFile(scriptFile, 'utf8');
      const out = await page.eval(`(async () => { const G = window.__game; ${src} })()`);
      console.log('RESULT:', JSON.stringify(out, null, 1));
    }
    if (shot) await page.screenshot(shot);
  } catch (e) { console.log('FAIL:', e.message); }
  await page.sleep(300);
  console.log('ERRORS:', page.errors.length ? page.errors.join('\n') : 'none');
  console.log('EXTERNAL REQUESTS:', page.requests.length ? page.requests.join('\n') : 'none');
  await page.close();
  process.exit(0);
}
