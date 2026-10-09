// 試写室を見えない Chrome で開き、JS で操作してから、決めた時間待って画面を撮る(DevTools のプロトコル)。
// 動きの途中を確かめる道具。窓が裏にあると Chrome がタイマーを間引くので、見える窓では時刻がずれる。
//
//   python3 -m http.server 8931 --bind 127.0.0.1                     # リポジトリの一番上で、別に立てておく
//   node tools/preview/capture.mjs out.png "theta=8" 2000 "document.getElementById('advance').click()"
//
//   引数: 書き出す PNG・試写室の URL の ?以降・JS を流してから撮るまでのミリ秒・流す JS(省略可)
//   コマ止め(試写室の ?freeze=ミリ秒&auto=ボタンの id)と組み合わせると、決まった瞬間を撮れる。
//   キャッシュは切ってある(古い margin.js などを読んでしまわないように)。Node 22 以上(組み込みの WebSocket)。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, query = '', wait = '1000', js = ''] = process.argv.slice(2);
if (!out) {
  console.error('usage: node capture.mjs out.png "theta=8" 2000 "<js>"');
  process.exit(1);
}
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'yomirin-capture-'));
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1000,680', '--hide-scrollbars', '--no-first-run', 'about:blank'],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i += 1) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    } else if (m.method) events.push(m);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq;
      waiting.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 680, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:8931/tools/preview/?${query}` });
  for (let i = 0; i < 50 && !events.some((e) => e.method === 'Page.loadEventFired'); i += 1) await sleep(100);
  await sleep(500);
  if (js) {
    const r = await send('Runtime.evaluate', { expression: js });
    if (r.result?.exceptionDetails) console.log('JS のエラー:', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  }
  await sleep(Number(wait));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') console.log('ページのエラー:', JSON.stringify(e.params).slice(0, 300));
  }
  console.log(out);
  ws.close();
} finally {
  chrome.kill();
}
