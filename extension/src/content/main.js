// セッション中だけ動くcontent scriptの本体(loader.js経由で注入される)。
//
// このファイルの制約:
//   - ページDOMを変更しない。追加してよいのはShadow DOMに閉じたオーバーレイだけ(W2)。
//   - 本文は読み取りのみ。再構成・広告除去はしない。
//   - service workerへ送るのは計測値だけ。本文テキストは送らない(LLM経路はv0後半)。

const { Msg, EventType } = await import(chrome.runtime.getURL('src/shared/events.js'));
const { SESSION } = await import(chrome.runtime.getURL('src/shared/config.js'));

// ---- 本文検出(読み取り専用) --------------------------------------------

// 語数の見積もり: ラテン文字は空白区切り、CJKは文字数で数える。
function countWords(text) {
  const latin = text.match(/[A-Za-z0-9]+(?:[''-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const cjk = text.match(/[぀-ヿ㐀-鿿豈-﫿]/g)?.length ?? 0;
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

const dwellTimer = setInterval(() => {
  if (document.hidden) return; // 非表示タブの鼓動はSW側の状態機械と二重計上になるため送らない
  if (!isReading()) return;
  report(EventType.DWELL_TICK, { visible_paragraph_range: visibleRange() });
}, SESSION.dwellTickMs);

// ---- 片付け ---------------------------------------------------------------

function stop() {
  clearInterval(dwellTimer);
  observer.disconnect();
  for (const [type, fn] of listeners) removeEventListener(type, fn);
  for (const p of paragraphs) delete p.dataset.rsIdx;
  window.__readingScaffoldLoaded = false;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'rs_stop') stop();
});
addEventListener('pagehide', stop, { once: true });

// ---- 開始報告 -------------------------------------------------------------

report('content_ready', {
  article_len_words: totalWords,
  paragraph_count: paragraphs.length,
  mode,
});
