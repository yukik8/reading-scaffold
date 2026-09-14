// ダッシュボード(拡張内フルページ)。記録層・計測層の閲覧と、データ管理の置き場。
// 拡張ページはSWと同じIndexedDBを見られるので、集計は直接読む。
// θ変更と全消去だけはSW経由(進行中セッションへの反映・後片付けがSWの仕事なので)。

import { Msg } from '../shared/events.js';
import { THETA_MAX, GOALS, readDemoFlag, writeDemoFlag } from '../shared/config.js';
import { seedDemoData } from './demo-seed.js';
import { buildMirror } from '../background/mirror.js';
import { buildKpi } from '../background/kpi.js';
import { nanoDiagnostics } from '../background/ai.js';
import {
  buildLibrary,
  buildQuizLog,
  buildTotals,
  buildThetaHistory,
  buildStabilityReport,
} from '../background/library.js';
import {
  getState,
  getAllSessions,
  getAllEvents,
  getAllPages,
  getAllQuizzes,
  getAllQuizAttempts,
  getAllQuestions,
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

// 自立度 = 1 − θ/θmax。帯は自立度の節目(白→黄→緑→茶、卒業=黒)。
// 言葉で褒めない — 色が段位を語る(武道の帯)。
function independence(theta) {
  return Math.min(1, Math.max(0, 1 - theta / THETA_MAX));
}

function rankFor(theta) {
  if (theta === 0) return { name: '黒', color: '#141210', edge: 'rgba(233,187,99,0.6)' };
  const i = independence(theta);
  if (i < 0.25) return { name: '白', color: '#ede6d8', edge: 'rgba(0,0,0,0.3)' };
  if (i < 0.5) return { name: '黄', color: '#d9b13b', edge: 'rgba(0,0,0,0.25)' };
  if (i < 0.75) return { name: '緑', color: '#4c7a4f', edge: 'rgba(0,0,0,0.25)' };
  return { name: '茶', color: '#7a5230', edge: 'rgba(0,0,0,0.25)' };
}

/** 帯セクションの表示をθから更新する(スライダー含む)。 */
function renderTheta(theta) {
  $('theta-label').textContent = thetaText(theta);
  $('theta').value = String(theta);
  const rank = rankFor(theta);
  const belt = $('belt');
  belt.style.background = rank.color;
  belt.style.boxShadow = `inset 0 0 0 1px ${rank.edge}`;
  belt.title = `帯: ${rank.name}`;
  $('indep-pct').textContent = `${Math.round(independence(theta) * 100)}%`;
  $('obi-ring').style.left = `${(theta / THETA_MAX) * 100}%`;
}

// ---- θダイヤル ------------------------------------------------------------

$('theta').addEventListener('input', () => {
  $('theta-label').textContent = thetaText(Number($('theta').value));
});

$('theta').addEventListener('change', async () => {
  const res = await send(Msg.SET_THETA, { theta: Number($('theta').value) });
  if (res?.ok) renderTheta(res.theta);
});

// ---- 週次目標(達成率×θ) ---------------------------------------------------

// 目標セレクタ。選択は評価レイヤーだけを変える(θの力学には影響しない)。
for (const [key, g] of Object.entries(GOALS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = `${g.name} — ${g.desc}`;
  $('goal').append(opt);
}

$('goal').addEventListener('change', async () => {
  await send(Msg.SET_GOAL, { goal: $('goal').value });
  drawKpi(await buildKpi());
});

/**
 * 達成率(棒・左軸0〜100%)とθ(金の線・右軸8〜0)の二軸グラフ。
 * 「棒が高いままで線が下がる」= 補助に依存せず読めている、が読み取りたい形。
 * 責めない: 未達の棒も色を変えない・警告を出さない。
 */
function drawKpi(kpi) {
  $('goal').value = kpi.goalKey;

  const hasData = kpi.weeks.some((w) => w.sessions > 0);
  $('kpi-empty').hidden = hasData;
  $('kpi-wrap').hidden = !hasData;
  $('kpi-line').hidden = !hasData;
  if (!hasData) return;

  const svg = $('kpi');
  svg.textContent = '';
  const ns = 'http://www.w3.org/2000/svg';
  const W = 600;
  const padX = 10;
  const top = 14;
  const bottom = 146;
  const n = kpi.weeks.length;
  const slot = (W - padX * 2) / n;

  for (const gy of [top, (top + bottom) / 2, bottom]) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', padX);
    line.setAttribute('x2', W - padX);
    line.setAttribute('y1', gy);
    line.setAttribute('y2', gy);
    line.setAttribute('class', 'growth-grid');
    svg.append(line);
  }

  // 達成率の棒
  kpi.weeks.forEach((w, i) => {
    if (w.sessions === 0) return;
    const h = w.achievement * (bottom - top);
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', padX + i * slot + slot * 0.18);
    rect.setAttribute('width', slot * 0.64);
    rect.setAttribute('y', bottom - h);
    rect.setAttribute('height', Math.max(h, w.achievement > 0 ? 2 : 0));
    rect.setAttribute('class', w.achievement >= 1 ? 'kpi-bar kpi-bar-full' : 'kpi-bar');
    svg.append(rect);
  });

  // θの線(データのある週だけ結ぶ)。右軸はθ8が上・0が下 — 卒業に向かって線が沈む
  const pts = kpi.weeks
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.theta_avg !== null)
    .map(({ w, i }) => ({
      x: padX + i * slot + slot / 2,
      y: top + (1 - w.theta_avg / THETA_MAX) * (bottom - top),
    }));
  if (pts.length >= 2) {
    const poly = document.createElementNS(ns, 'polyline');
    poly.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('class', 'growth-line');
    svg.append(poly);
  }
  for (const p of pts) {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', p.x);
    dot.setAttribute('cy', p.y);
    dot.setAttribute('r', 3);
    dot.setAttribute('class', 'growth-dot');
    svg.append(dot);
  }

  const xAxis = $('kpi-x');
  xAxis.textContent = '';
  for (const w of kpi.weeks) {
    const span = document.createElement('span');
    span.textContent = w.label;
    xAxis.append(span);
  }

  // 今週の事実(警告なし・比較は自分の全期間のみ)
  const thisWeek = kpi.weeks[kpi.weeks.length - 1];
  const line = $('kpi-line');
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
  add('今週 成功 ');
  add(`${thisWeek.success_count}回`, true);
  add(' · 連続の中央値 ');
  add(`${thisWeek.streak_median_min}分`, true);
  add(' · 補助なし ');
  add(`${thisWeek.unassisted_min}分`, true);
  if (kpi.quiz.week.total > 0) {
    add(' · クイズ ');
    add(`${kpi.quiz.week.correct}/${kpi.quiz.week.total}`, true);
    if (kpi.quiz.all.total > 0) {
      add(`(全期間 ${Math.round((kpi.quiz.all.correct / kpi.quiz.all.total) * 100)}%)`);
    }
  }
}

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
    ['自分からの問い', `${t.questions}`],
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
  const [state, sessions, events, pages, quizzes, attempts, questions] = await Promise.all([
    getState(),
    getAllSessions(),
    getAllEvents(),
    getAllPages(),
    getAllQuizzes(),
    getAllQuizAttempts(),
    getAllQuestions(),
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
    questions,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `reading-scaffold-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// デモモード(このプロフィール限定・storage.local)。切り替えると次のセッションから効く。
async function refreshDemoUI() {
  const on = await readDemoFlag();
  $('demo').checked = on;
  $('seed-demo').hidden = !on; // 玄人デモデータの投入はデモON時だけ見せる
}
$('demo').addEventListener('change', async () => {
  await writeDemoFlag($('demo').checked);
  await refreshDemoUI();
});
refreshDemoUI();

$('seed-demo').addEventListener('click', async () => {
  if (!confirm('約10週間分の玄人デモ履歴を投入します(既存データに追記されます)。')) return;
  $('seed-demo').disabled = true;
  await seedDemoData();
  await render();
  $('seed-demo').disabled = false;
});

// 内蔵AIの状態確認+DL起動。ページ文脈で実行(このクリックのジェスチャーで
// ダウンロード起動が通る)。結果を人が読める言葉に翻訳して出す。
$('ai-check').addEventListener('click', async () => {
  $('ai-check').disabled = true;
  $('ai-status').textContent = '確認中…(初回はモデルのダウンロードに数分かかることがあります)';
  const d = await nanoDiagnostics();
  let msg;
  if (!d.hasApi) {
    msg =
      'このChromeにPrompt APIがありません。Chrome 138以降に更新し、必要なら ' +
      'chrome://flags/#prompt-api-for-gemini-nano を有効化してください。';
  } else if (d.availability === 'unavailable') {
    msg =
      'この端末では内蔵AIを使えません(空きディスク約22GB・対応GPU/RAMが必要)。' +
      'クイズはローカルサーバがあればそちら経由で出ます。';
  } else if (d.created && d.sample) {
    msg = `内蔵AIの準備ができました(応答: ${d.sample})。クイズと問いがこの端末内で完結します。`;
  } else if (/space|disk|storage/i.test(d.createError ?? '')) {
    msg =
      'モデルのダウンロードに空き容量が足りません(約22GB必要)。この端末では内蔵AIを' +
      '使えないため、クイズと問いはローカルサーバ経由になります(server/.env に鍵を置いて起動)。' +
      '22GB空ければ将来この端末でも完全オンデバイスにできます。';
  } else if (d.createError || d.promptError) {
    msg = `準備中に問題: ${d.createError ?? d.promptError}` +
      (d.downloadProgress >= 0 ? `(DL ${d.downloadProgress}%)` : '');
  } else {
    msg = `状態: ${d.availability}` +
      (d.downloadProgress >= 0 ? `・DL ${d.downloadProgress}%` : '') +
      '。ダウンロード中の場合は完了後にもう一度お試しください。';
  }
  $('ai-status').textContent = msg;
  $('ai-check').disabled = false;
});

// 診断のやり直し(Recalibrate)。オンボーディングを再実行するが、SW側の
// COMPLETE_ONBOARDING はセッション実績があれば θ を上書きしない(目標と回答だけ更新)。
$('recalibrate').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
});

/** S の並走レポート(dev)。二値successと並べて閾値を決めるための数字。 */
function drawStabilityReport(r) {
  const el = $('s-report');
  if (!r || r.n === 0) {
    el.textContent = 'S(読書安定度)の並走計測: まだ記録がありません(v0.14以降のセッションから)。';
    return;
  }
  const f = (v) => (v === null ? '—' : v.toFixed(2));
  const pct = r.agreement === null ? '—' : `${Math.round(r.agreement * 100)}%`;
  el.textContent =
    `S並走 ${r.n}件: 成功セッションの平均S ${f(r.mean_success)}(${r.n_success}) · ` +
    `失敗の平均S ${f(r.mean_fail)}(${r.n_fail}) · 中間帯 ${r.n_mid}件 · ` +
    `二値との一致 ${pct}(判定${r.n_decided}件)`;
}

$('wipe').addEventListener('click', async () => {
  if (!confirm('計測・読書メモリ・クイズ・θの状態をすべて消します。元に戻せません。')) return;
  if (!confirm('本当に消しますか?(エクスポートしていない記録は失われます)')) return;
  await send(Msg.WIPE_ALL);
  await render();
});

// ---- 初期描画 -------------------------------------------------------------

/** 自立の推移。θ日次履歴から上昇曲線を描く(SVG折れ線・金)。目盛りはHTML側。 */
function drawGrowth(points) {
  const svg = $('growth');
  svg.textContent = '';
  const hasEnough = points.length >= 2;
  $('growth-empty').hidden = hasEnough;
  $('growth-wrap').hidden = !hasEnough;
  if (!hasEnough) return;

  const W = 600;
  const padX = 10;
  const top = 14;
  const bottom = 146;
  const x = (i) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (theta) => bottom - independence(theta) * (bottom - top);
  const ns = 'http://www.w3.org/2000/svg';

  // 基準線(100% / 50% / 0% — 左の目盛りと対応)
  for (const gy of [top, (top + bottom) / 2, bottom]) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', padX);
    line.setAttribute('x2', W - padX);
    line.setAttribute('y1', gy);
    line.setAttribute('y2', gy);
    line.setAttribute('class', 'growth-grid');
    svg.append(line);
  }

  // 横軸の目盛り(日付・最大5点を等間隔に)
  const xAxis = $('growth-x');
  xAxis.textContent = '';
  const labelCount = Math.min(5, points.length);
  for (let k = 0; k < labelCount; k += 1) {
    const idx = Math.round((k / (labelCount - 1)) * (points.length - 1));
    const span = document.createElement('span');
    span.textContent = shortDate(points[idx].t);
    xAxis.append(span);
  }

  const poly = document.createElementNS(ns, 'polyline');
  poly.setAttribute('points', points.map((p, i) => `${x(i)},${y(p.theta)}`).join(' '));
  poly.setAttribute('class', 'growth-line');
  svg.append(poly);

  points.forEach((p, i) => {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x(i));
    dot.setAttribute('cy', y(p.theta));
    dot.setAttribute('r', i === points.length - 1 ? 4.5 : 2.5);
    dot.setAttribute('class', 'growth-dot');
    svg.append(dot);
  });
}

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
  renderTheta(state.theta);
  drawGrowth(await buildThetaHistory());
  drawKpi(await buildKpi());

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
  drawStabilityReport(await buildStabilityReport());
}

render();
