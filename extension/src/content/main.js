// セッション中だけ動くcontent scriptの本体(loader.js経由で注入される)。
//
// このファイルの制約:
//   - ページDOMを変更しない。追加してよいのはShadow DOMに閉じたオーバーレイだけ。
//   - 本文は読み取りのみ。再構成・広告除去はしない。
//   - service workerへ送るのは計測値だけ。本文テキストは送らない(LLM経路はv0後半)。

const { Msg, EventType } = await import(chrome.runtime.getURL('src/shared/events.js'));
const { SESSION } = await import(chrome.runtime.getURL('src/shared/config.js'));
const { createOverlay } = await import(chrome.runtime.getURL('src/content/overlay.js'));
const { pickHint } = await import(chrome.runtime.getURL('src/content/hints.js'));

// ---- 本文検出(読み取り専用) --------------------------------------------

// 語数の見積もり: ラテン文字は空白区切り、CJKは文字数で数える。
function countWords(text) {
  const latin = text.match(/[A-Za-z0-9]+(?:[''-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const cjk = text.match(/[぀-ヿ㐀-鿿豈-﫿]/g)?.length ?? 0;
  return latin + cjk;
}

// Readability相当の簡易版: article/main配下を優先し、一定長以上の<p>を本文段落とみなす。
// 失敗したら「計測のみ」モード(段落可視の条件を外し、操作の有無だけで読書時間を数える)。
function detectParagraphs() {
  const root =
    document.querySelector('article') ?? document.querySelector('main') ?? document.body;
  const paragraphs = [...root.querySelectorAll('p')].filter(
    (p) => countWords(p.innerText ?? '') >= 20 && p.offsetParent !== null,
  );
  const totalWords = paragraphs.reduce((a, p) => a + countWords(p.innerText), 0);
  const ok = paragraphs.length >= SESSION.minParagraphs && totalWords >= SESSION.minWords;
  return { paragraphs: ok ? paragraphs : [], totalWords, mode: ok ? 'full' : 'measure-only' };
}

const { paragraphs, totalWords, mode } = detectParagraphs();

// ---- service workerへの報告 ----------------------------------------------

function report(event, payload) {
  try {
    chrome.runtime.sendMessage({ type: Msg.REPORT, event, payload });
  } catch {
    /* 拡張のリロード等でコンテキストが消えた場合。次のセッションで復活する */
  }
}

// ---- 可視段落の追跡 -------------------------------------------------------

const visible = new Set(); // 可視な段落index
let maxDepthIdx = -1; // これまでに可視になった最深段落(読了率用)

const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const idx = Number(e.target.dataset.rsIdx);
      if (e.isIntersecting) {
        visible.add(idx);
        if (idx > maxDepthIdx) maxDepthIdx = idx;
        maybeHint(idx);
      } else {
        visible.delete(idx);
      }
    }
  },
  { threshold: 0.1 },
);

paragraphs.forEach((p, i) => {
  // data属性は計測用の印。表示に影響しない(DOM改変はこの印までとする)。
  p.dataset.rsIdx = String(i);
  observer.observe(p);
});

function visibleRange() {
  if (visible.size === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const i of visible) {
    if (i < min) min = i;
    if (i > max) max = i;
  }
  return [min, max];
}

// 読了率: 最深可視段落 / 全段落(v0の定義。飛ばし読みと精読の区別は捨てる)。
function completionPct() {
  if (paragraphs.length === 0) return 0;
  return Math.round(((maxDepthIdx + 1) / paragraphs.length) * 100);
}

function depthPct() {
  const max = document.documentElement.scrollHeight - innerHeight;
  if (max <= 0) return 100;
  return Math.round((scrollY / max) * 100);
}

// ---- 操作の追跡 -----------------------------------------------------------

let lastInteractionAt = Date.now();
let lastScrollReportAt = 0;

function markInteraction() {
  lastInteractionAt = Date.now();
}

function onScroll() {
  markInteraction();
  const now = Date.now();
  if (now - lastScrollReportAt < 5_000) return; // 間引き
  lastScrollReportAt = now;
  report(EventType.SCROLL, { depth_pct: depthPct(), completion_pct: completionPct() });
}

const listeners = [
  ['scroll', onScroll, { passive: true }],
  ['wheel', markInteraction, { passive: true }],
  ['keydown', markInteraction, { passive: true }],
  ['pointerdown', markInteraction, { passive: true }],
  ['touchmove', markInteraction, { passive: true }],
];
for (const [type, fn, opts] of listeners) addEventListener(type, fn, opts);

// ---- dwell(読書時間の鼓動) ----------------------------------------------

// 読書時間の操作的定義:
// 本文段落が可視、かつ直近30秒以内にスクロールまたは操作がある時間。
// 本文検出に失敗したmeasure-onlyモードでは可視条件を外し、操作だけで数える。
function isReading() {
  const recentlyActive = Date.now() - lastInteractionAt <= SESSION.activityWindowMs;
  if (!recentlyActive) return false;
  if (mode === 'measure-only') return true;
  return visible.size > 0;
}

let localReadMs = 0; // ヒント文面用のローカル概算(正はSW側)

const dwellTimer = setInterval(() => {
  if (document.hidden) return; // 非表示タブの鼓動はSW側の状態機械と二重計上になるため送らない
  if (!isReading()) return;
  localReadMs += SESSION.dwellTickMs;
  report(EventType.DWELL_TICK, { visible_paragraph_range: visibleRange() });
  // スクロールが起きないページ(短い記事・全段落が最初から画面内)のための
  // フォールバック: 読んでいる鼓動に合わせて、可視の候補段落からヒントを出す。
  fireHintFromVisible();
}, SESSION.dwellTickMs);

// ---- オーバーレイとヒント(θ駆動) ---------------------------------------
//
// θ = 本文1,000語あたりの表示回数。目標表示回数 = θ × totalWords / 1000。
// タイミングは「段落境界の候補点から乱数で選ぶ」折衷案(設計 Open Question #3):
// 未読の段落indexからランダムに選んだ集合に印を付け、その段落が初めて可視に
// なった瞬間に表示する。measure-onlyモード(本文検出失敗)ではヒントを出さない。

const overlay = createOverlay();
const overlayStartedAt = Date.now();
const HINT_GRACE_MS = 8_000; // 開いた瞬間に光らせない+開始通知と重ねない
let theta = 0;
let hintsShown = 0;
let pendingHintAt = new Set(); // ヒントを出す段落index

function planHints() {
  pendingHintAt = new Set();
  if (mode !== 'full' || theta <= 0) return;
  const target = Math.max(1, Math.round((theta * totalWords) / 1000));
  const remaining = Math.max(0, target - hintsShown);
  if (remaining === 0) return;
  // 未読の段落を優先候補にする。全段落が既に画面に入っていた場合(短い記事)は
  // 全段落を候補にする — でないとヒントの出る機会が永遠に来ない。
  let candidates = [];
  for (let i = Math.max(1, maxDepthIdx + 1); i < paragraphs.length; i += 1) candidates.push(i);
  if (candidates.length === 0) candidates = paragraphs.map((_, i) => i);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const idx of candidates.slice(0, remaining)) pendingHintAt.add(idx);
}

function showHint(idx) {
  pendingHintAt.delete(idx);
  hintsShown += 1;
  const { hint_id, text } = pickHint({
    pct: completionPct(),
    min: Math.max(1, Math.round(localReadMs / 60_000)),
  });
  report(EventType.HINT_SHOWN, { hint_id, kind: 'canned' });
  overlay.showHint(text, {
    onClick: () => report(EventType.HINT_CLICKED, { hint_id }),
  });
}

/** 主経路: 候補段落が新しく画面に入った瞬間(段落境界)。 */
function maybeHint(idx) {
  if (!pendingHintAt.has(idx)) return;
  if (Date.now() - overlayStartedAt < HINT_GRACE_MS) return; // 候補は残す(後で副経路が拾う)
  if (!isReading()) return; // 読んでいる最中にだけ出す
  showHint(idx);
}

/** 副経路: dwell tickに合わせて、いま画面内にある候補段落から1つ出す。 */
function fireHintFromVisible() {
  if (Date.now() - overlayStartedAt < HINT_GRACE_MS) return;
  for (const idx of pendingHintAt) {
    if (visible.has(idx)) {
      showHint(idx);
      return; // 1 tickに1枚まで
    }
  }
}

// ---- 片付け ---------------------------------------------------------------

function stop({ celebrate = false, readMin = 0 } = {}) {
  clearInterval(dwellTimer);
  observer.disconnect();
  for (const [type, fn] of listeners) removeEventListener(type, fn);
  for (const p of paragraphs) delete p.dataset.rsIdx;
  window.__readingScaffoldLoaded = false;
  if (celebrate) {
    overlay.celebrate(readMin);
    setTimeout(() => overlay.destroy(), 2_800);
  } else {
    overlay.destroy();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'rs_stop') {
    stop({ celebrate: msg.celebrate === true, readMin: msg.read_min ?? 0 });
  } else if (msg?.type === 'rs_theta') {
    // θ手動ダイヤル(popup)からの即時反映。
    theta = msg.theta ?? 0;
    planHints();
  }
});
addEventListener('pagehide', () => stop(), { once: true });

// ---- 開始報告 -------------------------------------------------------------

report('content_ready', {
  article_len_words: totalWords,
  paragraph_count: paragraphs.length,
  mode,
});

// 開始の合図。無言だと動いているかどうかが本人に分からない(診断可能性)。
if (mode === 'full') {
  overlay.showNotice(`計測をはじめました(本文 約${totalWords.toLocaleString()}語)`);
} else {
  // 設計どおり: 本文検出に失敗したページは補助なしで計測のみ。
  overlay.showNotice('本文を検出できないため、このページでは計測のみ行います', 4_500);
}

// θはSWが持っているセッションから受け取る。
try {
  const res = await chrome.runtime.sendMessage({ type: Msg.GET_STATUS });
  theta = res?.session?.theta ?? 0;
} catch {
  theta = 0;
}
planHints();
