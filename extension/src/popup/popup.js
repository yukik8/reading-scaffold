import { Msg } from '../shared/events.js';
import { THETA_BY_LEVEL, MAX_LEVEL } from '../shared/config.js';

const $ = (id) => document.getElementById(id);

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function showError(message) {
  $('error').textContent = message;
  $('error').hidden = false;
}

// 開始は必ずユーザージェスチャー。popupを開いた時点でactiveTabが付与されている。
$('start').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await send(Msg.START_SESSION, { tabId: tab.id });
  if (res?.ok) {
    window.close();
  } else {
    showError(res?.error ?? '開始できませんでした');
  }
});

$('end').addEventListener('click', async () => {
  const res = await send(Msg.END_SESSION, { reason: 'manual' });
  if (res?.ok) window.close();
  else showError(res?.error ?? '終了できませんでした');
});

$('wipe').addEventListener('click', async () => {
  if (!confirm('記録を全部消します。元に戻せません。')) return;
  await send(Msg.WIPE_ALL);
  await render();
});

function levelText(level) {
  const theta = THETA_BY_LEVEL[level];
  const note = level === 0 ? '(補助が最大)' : level === MAX_LEVEL ? '(補助なし)' : '';
  return `Level ${level}${note} — ヒント頻度 θ=${theta}/1,000語`;
}

$('level').addEventListener('input', () => {
  $('level-label').textContent = levelText(Number($('level').value));
});

$('level').addEventListener('change', async () => {
  const res = await send(Msg.SET_LEVEL, { level: Number($('level').value) });
  if (res?.ok) $('level-label').textContent = levelText(res.level);
});

function drawChart(weeks) {
  const chart = $('chart');
  chart.textContent = '';
  const peak = Math.max(...weeks.map((w) => w.unassisted_min + w.assisted_min), 1);
  for (const w of weeks) {
    const col = document.createElement('div');
    col.className = 'col';

    const bar = document.createElement('div');
    bar.className = 'bar';
    const un = document.createElement('div');
    un.className = 'unassisted';
    un.style.height = `${(w.unassisted_min / peak) * 100}%`;
    const as = document.createElement('div');
    as.className = 'assisted';
    as.style.height = `${(w.assisted_min / peak) * 100}%`;
    bar.append(as, un);

    const value = document.createElement('span');
    value.className = 'value';
    const total = w.unassisted_min + w.assisted_min;
    value.textContent = total > 0 ? `${w.unassisted_min}` : '';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = w.label;

    col.append(value, bar, label);
    chart.append(col);
  }
}

async function render() {
  const status = await send(Msg.GET_STATUS);
  const session = status?.session ?? null;
  $('start').hidden = Boolean(session);
  $('end').hidden = !session;
  $('status').hidden = !session;
  if (session) {
    const min = Math.round(session.read_ms / 60_000);
    $('status').textContent = `計測中: ${session.domain}(${min}分)`;
  }

  const level = status?.state?.level ?? 0;
  $('level').value = String(level);
  $('level-label').textContent = levelText(level);

  const res = await send(Msg.GET_MIRROR);
  if (!res?.ok) return;
  const mirror = res.mirror;

  const hasData = mirror.total_sessions > 0;
  $('empty').hidden = hasData;
  $('chart').hidden = !hasData;
  if (hasData) drawChart(mirror.weeks);

  $('sessions').textContent = String(mirror.this_week.sessions);
  $('read-min').textContent = `${mirror.this_week.read_min}分`;
  $('escape-rate').textContent =
    mirror.this_week.escape_rate === null
      ? '—'
      : `${Math.round(mirror.this_week.escape_rate * 100)}%`;
}

render();
