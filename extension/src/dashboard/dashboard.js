// ダッシュボード(拡張内フルページ)。記録層・計測層の閲覧と、データ管理の置き場。
// 拡張ページはSWと同じIndexedDBを見られるので、集計は直接読む。
// θ変更と全消去だけはSW経由(進行中セッションへの反映・後片付けがSWの仕事なので)。

import { Msg } from '../shared/events.js';
import { THETA_MAX, GOALS, PASS, readDemoFlag, writeDemoFlag } from '../shared/config.js';
import { seedDemoData } from './demo-seed.js';
import { bearSVG } from '../content/bear.js';
import { buildMirror } from '../background/mirror.js';
import { buildKpi } from '../background/kpi.js';
import { nanoDiagnostics } from '../background/ai.js';
import {
  buildBookshelf,
  isBookPage,
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
  getAllReadings,
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

// 色は演出と同じ水彩の色。edge は帯の内側の光(黒帯だけ金の縁)
function rankFor(theta) {
  if (theta === 0) return { name: '黒', color: '#4a2f24', edge: '#ffd23f' };
  const i = independence(theta);
  if (i < 0.25) return { name: '白', color: '#fffaf0', edge: 'rgba(255,255,255,0.7)' };
  if (i < 0.5) return { name: '黄', color: '#ffd23f', edge: 'rgba(255,255,255,0.55)' };
  if (i < 0.75) return { name: '緑', color: '#4cc9a3', edge: 'rgba(255,255,255,0.45)' };
  return { name: '茶', color: '#c8864a', edge: 'rgba(255,255,255,0.4)' };
}

/** 帯セクションの表示をθから更新する(スライダー含む)。 */
function renderTheta(theta) {
  $('theta-label').textContent = thetaText(theta);
  $('theta').value = String(theta);
  const rank = rankFor(theta);
  const belt = $('belt');
  belt.style.background = rank.color;
  belt.style.boxShadow = `inset 0 0 0 2px ${rank.edge}`;
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
 * 達成率(棒・左軸0〜100%)とθ(オレンジの線・右軸8〜0)の二軸グラフ。
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

  // 合格ライン(達成率80%)。事実として引くだけで、下回っても色は変えない(責めない)
  const passY = bottom - PASS.achievementFloor * (bottom - top);
  const passLine = document.createElementNS(ns, 'line');
  passLine.setAttribute('x1', padX);
  passLine.setAttribute('x2', W - padX);
  passLine.setAttribute('y1', passY);
  passLine.setAttribute('y2', passY);
  passLine.setAttribute('class', 'kpi-pass');
  svg.append(passLine);

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
  // 合格ラインの維持: 直近4週のうち達成率80%以上だった週数(目標は3週)
  const recent = kpi.weeks.slice(-PASS.weeksWindow);
  const kept = recent.filter((w) => w.achievement >= PASS.achievementFloor).length;
  add(` · 直近${PASS.weeksWindow}週で${Math.round(PASS.achievementFloor * 100)}%以上 `);
  add(`${kept}週`, true);
  if (kpi.quiz.week.total > 0) {
    add(' · クイズ ');
    add(`${kpi.quiz.week.correct}/${kpi.quiz.week.total}`, true);
    if (kpi.quiz.all.total > 0) {
      add(`(全期間 ${Math.round((kpi.quiz.all.correct / kpi.quiz.all.total) * 100)}%)`);
    }
  }
}

// ---- 本棚 -----------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function durationText(min) {
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}時間${min % 60}分` : `${h}時間`;
}

/** 本の中の位置(ページ境界)を帯の左端からの割合に。 */
function at(page, total) {
  return `${(page / total) * 100}%`;
}

const pageRange = (from, to) => (from === to ? `p.${from}` : `p.${from}–${to}`);
const attemptMarks = (attempts) => attempts.map((c) => (c ? '○' : '×')).join('');

/** 余白1件の一行説明(帯の点のツールチップ)。 */
function markLine(m) {
  if (m.kind === 'question') {
    return `p.${m.page} 問い: ${m.text}${m.selection ? `\n  「${m.selection}」` : ''}`;
  }
  return `p.${m.page} クイズ: ${m.text}${m.attempts.length ? ` ${attemptMarks(m.attempts)}` : ''}`;
}

/**
 * 帯: 本の長さを横棒にし、読んだ所を読んだ回数の濃淡で塗る(1回・2回・3回以上)。
 * 上の2段に問い(輪)とクイズ(点)、横棒の上にしおり(今の位置)。数字はツールチップに任せる。
 */
function bookBand(book) {
  const { total } = book;
  const band = el('div', 'band');
  const placed = book.marks.filter((m) => m.page !== null && m.page >= 1 && m.page <= total);

  for (const kind of ['question', 'quiz']) {
    const groups = new Map();
    for (const m of placed.filter((x) => x.kind === kind)) {
      groups.set(m.page, [...(groups.get(m.page) ?? []), m]);
    }
    if (groups.size === 0) continue;
    const lane = el('div', 'band-lane');
    for (const [page, items] of groups) {
      const dot = el('span', `band-mark mk-${kind}`);
      dot.style.left = at(page - 0.5, total); // ページの真ん中
      dot.title = items.map(markLine).join('\n');
      lane.append(dot);
    }
    band.append(lane);
  }

  const track = el('div', 'band-track');
  for (const r of book.runs) {
    const run = el('span', `band-run band-run-${Math.min(r.count, 3)}`);
    run.style.left = at(r.from - 1, total);
    run.style.width = at(r.to - r.from + 1, total);
    run.title = `${pageRange(r.from, r.to)} · ${r.count}回`;
    track.append(run);
  }
  if (book.position !== null) {
    const mark = el('span', 'band-bookmark');
    mark.style.left = at(book.position, total);
    mark.title = `しおり p.${book.position}`;
    track.append(mark);
  }
  band.append(track);

  const ends = el('div', 'band-ends');
  ends.append(el('span', null, '1'), el('span', null, `${total}`));
  band.append(ends);

  const read = book.runs.map((r) => pageRange(r.from, r.to)).join('、');
  const nq = placed.filter((m) => m.kind === 'question').length;
  band.setAttribute('role', 'img');
  band.setAttribute(
    'aria-label',
    `全${total}ページ。読んだ所 ${read || 'なし'}。` +
      (book.position !== null ? `しおり p.${book.position}。` : '') +
      `問い${nq}・クイズ${placed.length - nq}`,
  );
  return band;
}

/** 余白: 問いとクイズを本の中の位置順に。本人の問いを地の色、クイズは薄墨(責めない)。 */
function marginalia(marks) {
  const list = el('ol', 'marginalia');
  for (const m of marks) {
    const li = el('li', `mg mg-${m.kind}`);
    li.append(el('span', 'mg-page', m.page !== null ? `p.${m.page}` : '—'));
    li.append(el('span', `mg-glyph mk-${m.kind}`));
    const body = el('div', 'mg-body');
    const text = el('span', 'mg-text', m.text);
    body.append(text);
    if (m.kind === 'question') {
      if (m.selection) body.append(el('span', 'mg-sel', `「${m.selection}」`));
      if (m.answer) body.append(el('span', 'mg-ans', m.answer));
    } else {
      if (m.answer) text.title = `正解: ${m.answer}`;
      const marks = el('span', 'mk');
      if (m.attempts.length === 0) marks.textContent = ' 未回答';
      for (const c of m.attempts) marks.append(el('span', c ? 'mk-o' : 'mk-x', c ? '○' : '×'));
      body.append(marks);
    }
    li.append(body);
    list.append(li);
  }
  return list;
}

/** 読んだ日: 区間ごとに一行(新しい順)。帯と同じ横軸の細い棒で、どこを読んだかを並べる。 */
function readingDays(book) {
  const list = el('ol', 'days');
  for (const r of book.readings) {
    const li = el('li');
    li.append(el('span', 'day-date', shortDate(r.started_at)));
    const track = el('span', 'day-track');
    const seg = el('i');
    seg.style.left = at(r.from - 1, book.total);
    seg.style.width = at(r.to - r.from + 1, book.total);
    track.append(seg);
    li.append(track);
    li.append(el('span', 'day-meta', `${pageRange(r.from, r.to)} · ${r.read_min}分`));
    list.append(li);
  }
  return list;
}

function drawShelf(books) {
  const list = $('shelf');
  list.textContent = '';
  for (const book of books) {
    const li = el('li', 'book');
    const title = el('a', 'row-title', book.title || '(書名なし)');
    title.href = book.url;
    title.target = '_blank';
    title.rel = 'noopener';

    const parts = [shortDate(book.last_read_at)];
    if (book.finished) {
      parts.push(book.finished_at ? `読了 ${shortDate(book.finished_at)}` : '読了');
    } else if (book.position !== null && book.total) {
      parts.push(`p.${book.position} / ${book.total}`);
    }
    if (book.remaining_min !== null) {
      // 見積もりなので1時間を超えたら10分単位に丸める(「3時間1分」のような細かさを出さない)
      const m = book.remaining_min;
      parts.push(`あと約${durationText(m >= 60 ? Math.round(m / 10) * 10 : m)}`);
    }
    parts.push(`計${durationText(book.total_read_min)}`);
    li.append(title, el('span', 'row-meta', parts.filter(Boolean).join(' · ')));

    if (book.total) li.append(bookBand(book));

    if (book.marks.length > 0 || book.readings.length > 0) {
      const details = el('details', 'margin');
      details.append(
        el('summary', null, `余白 ${book.marks.length} · 読んだ日 ${book.readings.length}`),
      );
      if (book.marks.length > 0) {
        details.append(el('span', 'sub', '余白'), marginalia(book.marks));
      }
      if (book.readings.length > 0 && book.total) {
        details.append(el('span', 'sub', '読んだ日'), readingDays(book));
      }
      li.append(details);
    }
    list.append(li);
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
    // 回答履歴は ○× の並び(事実)。○=はなまるの赤、×=薄墨(責めない)
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
    ['読んだ本', `${t.books}冊`],
    ['読み終えた本', `${t.books_finished}冊`],
    ...(t.articles > 0 ? [['読んだ記事', `${t.articles}`]] : []),
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
  const [state, sessions, events, pages, readings, quizzes, attempts, questions] =
    await Promise.all([
      getState(),
      getAllSessions(),
      getAllEvents(),
      getAllPages(),
      getAllReadings(),
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
    readings,
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

/** 自立の推移。θ日次履歴から上昇曲線を描く(SVG折れ線+下に水彩の塗り)。目盛りはHTML側。 */
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

  const linePts = points.map((p, i) => `${x(i)},${y(p.theta)}`).join(' ');
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `${x(0)},${bottom} ${linePts} ${x(points.length - 1)},${bottom}`);
  area.setAttribute('class', 'growth-area');
  svg.append(area);

  const poly = document.createElementNS(ns, 'polyline');
  poly.setAttribute('points', linePts);
  poly.setAttribute('class', 'growth-line');
  svg.append(poly);

  points.forEach((p, i) => {
    const last = i === points.length - 1;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x(i));
    dot.setAttribute('cy', y(p.theta));
    dot.setAttribute('r', last ? 5.5 : 2.5);
    dot.setAttribute('class', last ? 'growth-dot growth-dot-now' : 'growth-dot');
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

// ヘッダのくま(読書中に顔を出すのと同じ子)。飾りなので一度描くだけ
$('mascot').innerHTML = bearSVG('peek');

async function render() {
  $('ver').textContent = `v${chrome.runtime.getManifest?.().version ?? '?'}`;

  const shelf = await buildBookshelf();
  $('shelf-empty').hidden = shelf.length > 0;
  $('shelf-legend').hidden = !shelf.some((b) => b.total);
  drawShelf(shelf);

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

  // 本以外(Web記事)と、そのクイズ。本のクイズは本棚の余白に出ている
  const articles = (await buildLibrary(200)).filter((p) => !isBookPage(p));
  $('library-sec').hidden = articles.length === 0;
  drawLibrary(articles);

  const bookIds = new Set(shelf.map((b) => b.page_id));
  const quizzes = (await buildQuizLog()).filter((q) => !bookIds.has(q.page_id));
  $('quizzes-sec').hidden = quizzes.length === 0;
  drawQuizzes(quizzes);

  drawTotals(await buildTotals());
  drawStabilityReport(await buildStabilityReport());
}

render();
