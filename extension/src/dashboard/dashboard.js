// ダッシュボード(拡張内フルページ)。記録層・計測層の閲覧と、データ管理の置き場。
// 拡張ページはSWと同じIndexedDBを見られるので、集計は直接読む。
// θ変更と全消去だけはSW経由(進行中セッションへの反映・後片付けがSWの仕事なので)。

import { Msg } from '../shared/events.js';
import { THETA_MAX } from '../shared/config.js';
import { buildMirror } from '../background/mirror.js';
import { buildLibrary, buildQuizLog, buildTotals } from '../background/library.js';
import {
  getState,
  getAllSessions,
  getAllEvents,
  getAllPages,
  getAllQuizzes,
  getAllQuizAttempts,
} from '../background/store.js';

const $ = (id) => document.getElementById(id);

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function shortDate(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function thetaText(theta) {
  const note = theta === 0 ? '(補助なし)' : theta >= THETA_MAX ? '(補助が最大)' : '';
  return `θ=${theta.toFixed(1)}/1,000語${note}`;
}

// ---- θダイヤル ------------------------------------------------------------

$('theta').addEventListener('input', () => {
  $('theta-label').textContent = thetaText(Number($('theta').value));
});

$('theta').addEventListener('change', async () => {
  const res = await send(Msg.SET_THETA, { theta: Number($('theta').value) });
  if (res?.ok) $('theta-label').textContent = thetaText(res.theta);
});

// ---- 描画 -----------------------------------------------------------------

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
    value.textContent = w.unassisted_min + w.assisted_min > 0 ? `${w.unassisted_min}` : '';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = w.label;
    col.append(value, bar, label);
    chart.append(col);
  }
}

function drawLibrary(items) {
  const list = $('library');
  list.textContent = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'clickable';
    li.title = item.url;
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = item.title || item.domain;
    const meta = document.createElement('span');
    meta.className = 'row-meta';
    const parts = [
      shortDate(item.last_read_at),
      item.domain,
      `${item.total_read_min}分`,
      item.read_count > 1 ? `${item.read_count}回` : null,
    ];
    if (item.best_completion_pct > 0) parts.push(`${item.best_completion_pct}%`);
    if (item.quiz.total > 0) parts.push(`クイズ ${item.quiz.correct}/${item.quiz.total}`);
    meta.textContent = parts.filter(Boolean).join(' · ');
    li.append(title, meta);
    li.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    list.append(li);
  }
}

function drawQuizzes(items) {
  const list = $('quizzes');
  list.textContent = '';
  for (const q of items) {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = q.question;
    title.title = q.choices?.[q.answer_index]
      ? `正解: ${q.choices[q.answer_index]}`
      : q.question;
    const meta = document.createElement('span');
    meta.className = 'row-meta';
    const parts = [shortDate(q.created_at), q.page_title].filter(Boolean);
    meta.textContent = `${parts.join(' · ')} · `;
    // 回答履歴は ○× の並び(事実)。○=金、×=薄墨(責めない)
    const marks = document.createElement('span');
    marks.className = 'mk';
    if (q.attempts.length === 0) {
      marks.textContent = '未回答';
    } else {
      for (const a of q.attempts) {
        const m = document.createElement('span');
        m.className = a.correct ? 'mk-o' : 'mk-x';
        m.textContent = a.correct ? '○' : '×';
        marks.append(m);
      }
    }
    meta.append(marks);
    li.append(title, meta);
    list.append(li);
  }
}

function drawTotals(t) {
  const dl = $('totals');
  dl.textContent = '';
  const rows = [
    ['読んだページ', `${t.pages}`],
    ['セッション', `${t.sessions}`],
    ['読書時間', `${t.read_min}分`],
    ['うち補助なし', `${t.unassisted_min}分`],
    ['クイズ回答', `${t.quiz_total}`],
    ['クイズ正解', `${t.quiz_correct}`],
  ];
  for (const [k, v] of rows) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = k;
    const leader = document.createElement('span');
    leader.className = 'leader';
    const dd = document.createElement('dd');
    dd.textContent = v;
    div.append(dt, leader, dd);
    dl.append(div);
  }
}

// ---- データ管理 -----------------------------------------------------------

$('export').addEventListener('click', async () => {
  const [state, sessions, events, pages, quizzes, attempts] = await Promise.all([
    getState(),
    getAllSessions(),
    getAllEvents(),
    getAllPages(),
    getAllQuizzes(),
    getAllQuizAttempts(),
  ]);
  const data = {
    format: 'reading-scaffold-export',
    version: chrome.runtime.getManifest?.().version ?? null,
    exported_at: new Date().toISOString(),
    state,
    sessions,
    events,
    pages,
    quizzes,
    quiz_attempts: attempts,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `reading-scaffold-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('wipe').addEventListener('click', async () => {
  if (!confirm('計測・読書メモリ・クイズ・θの状態をすべて消します。元に戻せません。')) return;
  if (!confirm('本当に消しますか?(エクスポートしていない記録は失われます)')) return;
  await send(Msg.WIPE_ALL);
  await render();
});

// ---- 初期描画 -------------------------------------------------------------

function drawWeekLine(week) {
  const line = $('week-line');
  line.textContent = '';
  const add = (text, strong = false) => {
    if (strong) {
      const b = document.createElement('b');
      b.textContent = text;
      line.append(b);
    } else {
      line.append(document.createTextNode(text));
    }
  };
  add('今週 ');
  add(`${week.read_min}分`, true);
  add(' · ');
  add(`${week.sessions}`, true);
  add('セッション');
  if (week.escape_rate !== null) {
    add(' · 離脱率 ');
    add(`${Math.round(week.escape_rate * 100)}%`, true);
  }
}

async function render() {
  $('ver').textContent = `v${chrome.runtime.getManifest?.().version ?? '?'}`;

  const state = await getState();
  $('theta').value = String(state.theta);
  $('theta-label').textContent = thetaText(state.theta);

  const mirror = await buildMirror();
  const hasData = mirror.total_sessions > 0;
  $('chart-empty').hidden = hasData;
  $('chart').hidden = !hasData;
  if (hasData) drawChart(mirror.weeks);
  drawWeekLine(mirror.this_week);

  const library = await buildLibrary(200);
  $('library-empty').hidden = library.length > 0;
  drawLibrary(library);

  const quizzes = await buildQuizLog();
  $('quizzes-empty').hidden = quizzes.length > 0;
  drawQuizzes(quizzes);

  drawTotals(await buildTotals());
}

render();
