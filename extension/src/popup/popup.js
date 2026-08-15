import { Msg } from '../shared/events.js';

const $ = (id) => document.getElementById(id);

async function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

// 開始は必ずユーザージェスチャー。これがactiveTab権限の発動条件を兼ねる。
$('start').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await send(Msg.START_SESSION, { tabId: tab.id });
  window.close();
});

$('end').addEventListener('click', async () => {
  await send(Msg.END_SESSION, { reason: 'manual' });
  window.close();
});

$('wipe').addEventListener('click', async () => {
  if (!confirm('記録を全部消します。元に戻せません。')) return;
  await send(Msg.WIPE_ALL);
});

(async function render() {
  const status = await send(Msg.GET_STATUS);
  const active = Boolean(status?.session);
  $('start').hidden = active;
  $('end').hidden = !active;

  // TODO(W1): GET_MIRROR の結果で週次グラフとサブ表示を描く
})();
