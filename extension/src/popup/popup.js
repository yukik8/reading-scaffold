import { Msg } from '../shared/events.js';
import { THETA_MAX } from '../shared/config.js';

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

$('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

function thetaText(theta) {
  const note = theta === 0 ? '(補助なし)' : theta >= THETA_MAX ? '(補助が最大)' : '';
  return `θ=${theta.toFixed(1)}/1,000語${note}`;
}

$('theta').addEventListener('input', () => {
  $('theta-label').textContent = thetaText(Number($('theta').value));
});

$('theta').addEventListener('change', async () => {
  const res = await send(Msg.SET_THETA, { theta: Number($('theta').value) });
  if (res?.ok) $('theta-label').textContent = thetaText(res.theta);
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

function shortDate(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function drawLibrary(items) {
  const list = $('library');
  list.textContent = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.title = item.url;

    const title = document.createElement('span');
    title.className = 'lib-title';
    title.textContent = item.title || item.domain;

    const meta = document.createElement('span');
    meta.className = 'lib-meta';
    const parts = [shortDate(item.last_read_at), item.domain, `${item.total_read_min}分`];
    if (item.best_completion_pct > 0) parts.push(`${item.best_completion_pct}%`);
    if (item.quiz.total > 0) parts.push(`クイズ ${item.quiz.correct}/${item.quiz.total}`);
    meta.textContent = parts.filter(Boolean).join(' · ');

    li.append(title, meta);
    // 記録は資産: クリックで読み直せる
    li.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    list.append(li);
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

  const theta = status?.state?.theta ?? THETA_MAX;
  $('theta').value = String(theta);
  $('theta-label').textContent = thetaText(theta);

  const res = await send(Msg.GET_MIRROR);
  if (!res?.ok) return;
  const mirror = res.mirror;

  const hasData = mirror.total_sessions > 0;
  $('empty').hidden = hasData;
  $('chart').hidden = !hasData;
  if (hasData) drawChart(mirror.weeks);

  const lib = await send(Msg.GET_LIBRARY);
  const items = lib?.ok ? lib.library : [];
  $('library-sec').hidden = items.length === 0;
  if (items.length > 0) drawLibrary(items);

  $('sessions').textContent = String(mirror.this_week.sessions);
  $('read-min').textContent = `${mirror.this_week.read_min}分`;
  $('escape-rate').textContent =
    mirror.this_week.escape_rate === null
      ? '—'
      : `${Math.round(mirror.this_week.escape_rate * 100)}%`;
}

render();
