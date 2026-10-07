// セッション中だけ動くcontent scriptの本体(loader.js経由で注入される)。
//
// このファイルの制約:
//   - ページDOMを変更しない。追加してよいのはShadow DOMに閉じたオーバーレイだけ。
//   - 本文は読み取りのみ。再構成・広告除去はしない。
//   - service worker へ送るのは計測値と、クイズ・問い・うんちくの素材(読み終えた本文)。
//     本文は SW の中で端末内の Nano にだけ渡り、端末の外へは出ない(うんちくのサーバへ送るのは単語の候補だけ)。

// loader.jsが付けたキャッシュ割りクエリ(?t=...)を配下のモジュールにも伝播させる。
// これがないと、拡張をリロードしても開きっぱなしのページでは古いモジュールが
// ページのモジュールキャッシュから使われ続ける(overlay/hintsだけ更新されない事故)。
const v = new URL(import.meta.url).search;
const mod = (path) => import(chrome.runtime.getURL(path) + v);

const { Msg, EventType } = await mod('src/shared/events.js');
const {
  SESSION,
  AMBIENT,
  THETA_MAX,
  EFFECT_TIERS,
  QUIZ,
  PAGE_EVENTS,
  PAGE_SHOWER,
  FORESHADOW,
  CEILING,
  PAGE_CURL,
  IS_STORE_BUILD,
  readDemoFlag,
} = await mod('src/shared/config.js');
const { createOverlay, setTextColumn, setDemoTheta, setDemoEnabled } =
  await mod('src/content/overlay.js');
const { Paint } = await mod('src/content/paint.js');
const { bearSVG } = await mod('src/content/bear.js');
const { createStage } = await mod('src/content/stage.js');
const { createMargin } = await mod('src/content/margin.js');
const { createPageCurl } = await mod('src/content/pagecurl.js');

// デモモードの現在値(プロフィールごと・既定OFF)。セッション開始時にSWから受け取る。
// 演出の増幅にだけ効き、計測・制御・記録には一切影響しない。
let demoEnabled = false;
const { pickHint } = await mod('src/content/hints.js');

// ---- 本文検出(読み取り専用) --------------------------------------------

// 語数の見積もり: ラテン文字は空白区切り、CJKは文字数で数える。
function countParts(text) {
  const latin = text.match(/[A-Za-z0-9]+(?:[''-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const cjk = text.match(/[぀-ヿ㐀-鿿豈-﫿]/g)?.length ?? 0;
  return { latin, cjk };
}

function countWords(text) {
  const { latin, cjk } = countParts(text);
  return latin + cjk;
}

// Google Play ブックス: 本文は books.googleusercontent.com のフレームの中にあり、
// ページは reader-rendered-page、段落は .main_text 直下の div(縦書き・ルビあり)。
const PLAY_BOOKS = location.hostname === 'books.googleusercontent.com';
const PLAY_BOOKS_PARAGRAPHS = 'reader-rendered-page .main_text > div';

// 段落の本文。Play ブックスはルビの振り仮名(rt)を除く — 除かないとクイズや問いに
// 「馬車屋ばしゃや」のような文が渡る。
function textOf(el) {
  if (!PLAY_BOOKS) return el.innerText ?? '';
  const clone = el.cloneNode(true);
  for (const n of clone.querySelectorAll('rt, rp')) n.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// Readability相当の簡易版: article/main配下を優先し、一定長以上の<p>を本文段落とみなす。
// 失敗したら「計測のみ」モード(段落可視の条件を外し、操作の有無だけで読書時間を数える)。
// Play ブックスは段落の構造が決まっているので、空でない段落をすべて本文とする
// (先読みされた画面外のページも含め、どれが見えているかは可視の監視で判定する)。
function detectParagraphs() {
  let paragraphs;
  if (PLAY_BOOKS) {
    // 同じページが作り直された要素で何度も DOM に残るので、本文の文字列で1回ずつに絞る
    const seen = new Set();
    paragraphs = [];
    for (const p of document.querySelectorAll(PLAY_BOOKS_PARAGRAPHS)) {
      const key = textOf(p);
      if (countWords(key) === 0 || seen.has(key)) continue;
      seen.add(key);
      paragraphs.push(p);
    }
  } else {
    const root =
      document.querySelector('article') ?? document.querySelector('main') ?? document.body;
    paragraphs = [...root.querySelectorAll('p')].filter(
      (p) => countWords(p.innerText ?? '') >= 20 && p.offsetParent !== null,
    );
  }
  let latinTotal = 0;
  let cjkTotal = 0;
  for (const p of paragraphs) {
    const { latin, cjk } = countParts(textOf(p));
    latinTotal += latin;
    cjkTotal += cjk;
  }
  const totalWords = latinTotal + cjkTotal;
  const ok = paragraphs.length >= SESSION.minParagraphs && totalWords >= SESSION.minWords;
  return {
    paragraphs: ok ? paragraphs : [],
    totalWords,
    isCJK: cjkTotal >= latinTotal, // 本文の言語判定(ヒントチップの単位に使う)
    mode: ok ? 'full' : 'measure-only',
  };
}

// paragraphs は Play ブックスで後から読み込まれたページの段落が足される(要素の追加のみ)
const detected = detectParagraphs();
const { paragraphs, isCJK, mode } = detected;
let { totalWords } = detected;
// 縦書きでは余白が上下にできるので、星を逃がす場所の計算を切り替える
const isVertical =
  paragraphs.length > 0 && getComputedStyle(paragraphs[0]).writingMode.startsWith('vertical');

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
// Play ブックスは同じ段落を表す要素が複数ある(ページ送りで作り直される)。出入りの通知の
// 順序が前後しても取りこぼさないよう、段落ごとに「いま見えている要素の数」で可視を判定する。
const visibleEls = new WeakSet();
const visibleCount = new Map(); // idx → 見えている要素の数
// 初めて見えた順の段落番号(突然クイズの素材=読み終えたページを遡るのに使う)
const seenOrder = [];
const seenSet = new Set();

const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const idx = Number(e.target.dataset.rsIdx);
      if (e.isIntersecting) {
        if (!visibleEls.has(e.target)) {
          visibleEls.add(e.target);
          visibleCount.set(idx, (visibleCount.get(idx) ?? 0) + 1);
        }
        visible.add(idx);
        if (!seenSet.has(idx)) {
          seenSet.add(idx);
          seenOrder.push(idx);
        }
        // 作り直された要素のうち、いま見えている方を段落の代表にする(光の枠・余白の計算用)
        if (PLAY_BOOKS) paragraphs[idx] = e.target;
        if (idx > maxDepthIdx) maxDepthIdx = idx;
        maybeHint(idx);
      } else if (visibleEls.has(e.target)) {
        visibleEls.delete(e.target);
        const n = (visibleCount.get(idx) ?? 1) - 1;
        if (n > 0) {
          visibleCount.set(idx, n);
        } else {
          visibleCount.delete(idx);
          visible.delete(idx);
        }
      }
    }
    // Play ブックスはページ送りで本文の位置が変わるので、見えている段落から余白を測り直す
    if (PLAY_BOOKS) scheduleTextColumn();
  },
  { threshold: 0.1 },
);

// Play ブックス: 本文の文字列 → 段落番号。ページ送りで作り直された要素も同じ番号で扱う。
// 要素ごとに番号を振ると、いま見えている段落がいつも最後の番号になり読了率が100%に張り付く。
const paragraphKeys = new Map();

paragraphs.forEach((p, i) => {
  if (PLAY_BOOKS) paragraphKeys.set(textOf(p), i);
  // data属性は計測用の印。表示に影響しない(DOM改変はこの印までとする)。
  p.dataset.rsIdx = String(i);
  observer.observe(p);
});

// Play ブックスの余白の小さな演出(margin.js)。オーバーレイの後で作る(下の「余白の演出」)
let margin = null;

// 本文カラムの位置をオーバーレイへ伝える(日常の星を余白に逃がすため)
// Play ブックスは先読みされた画面外のページも DOM にあるので、見えている段落だけで測る。
function updateTextColumn() {
  const els = PLAY_BOOKS ? [...visible].map((i) => paragraphs[i]) : paragraphs;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of els) {
    const r = p?.getBoundingClientRect();
    if (r && r.width > 0) {
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
  }
  const rect = Number.isFinite(left) ? { left, right, top, bottom, vertical: isVertical } : null;
  setTextColumn(rect);
  margin?.setText(rect);
}

let textColumnQueued = false;
function scheduleTextColumn() {
  if (textColumnQueued) return;
  textColumnQueued = true;
  requestAnimationFrame(() => {
    textColumnQueued = false;
    updateTextColumn();
  });
}
updateTextColumn();
addEventListener('resize', updateTextColumn, { passive: true });

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
// Play ブックスの本全体での位置(%)。リーダーのページ表示「11 / 17」から SW 経由で届く。
let bookPct = null;

function completionPct() {
  if (PLAY_BOOKS && bookPct !== null) return bookPct;
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
  const windowMs = PLAY_BOOKS ? SESSION.pagedActivityWindowMs : SESSION.activityWindowMs;
  const recentlyActive = Date.now() - lastInteractionAt <= windowMs;
  if (!recentlyActive) return false;
  if (mode === 'measure-only') return true;
  return visible.size > 0;
}

let localReadMs = 0; // ヒント文面用のローカル概算(正はSW側)
let forewarnTicks = 0; // 先触れが続いたdwell tick数(発火保証用)
let readMsSinceStimulus = 0; // 最後の演出からの実読書時間(天井用)

const dwellTimer = setInterval(() => {
  // 拡張が更新・再読み込みされると、このスクリプトは SW と切れたまま残る。演出や監視を残さず畳む
  if (!chrome.runtime?.id) {
    stop();
    return;
  }
  if (document.hidden) return; // 非表示タブの鼓動はSW側の状態機械と二重計上になるため送らない
  if (!isReading()) return;
  localReadMs += SESSION.dwellTickMs;
  readMsSinceStimulus += SESSION.dwellTickMs;
  report(EventType.DWELL_TICK, { visible_paragraph_range: visibleRange() });
  // スクロールが起きないページ(短い記事・全段落が最初から画面内)のための
  // フォールバック: 読んでいる鼓動に合わせて、可視の候補段落からヒントを出す。
  fireHintFromVisible();
  guaranteeForewarn();
  maybeCeilingHint();
}, SESSION.dwellTickMs);

/**
 * 先触れの保証: 金/虹の先触れを見せ始めたのに段落がなかなか来ない場合、
 * guaranteeTicks(約1分)で必ず本演出を出す。予告を裏切らない(ニアミス禁止)。
 */
function guaranteeForewarn() {
  const fw = approachingRare();
  if (!fw) {
    forewarnTicks = 0;
    return;
  }
  forewarnTicks += 1;
  if (forewarnTicks >= FORESHADOW.guaranteeTicks) showHint(fw.idx);
}

/**
 * 天井の一滴: θ>0なのに演出ゼロの実読書が続いたら、いま画面内の段落で
 * normal一回を確定させる(下限保証)。残り時間の表示・示唆はしない —
 * ハマリを期待に変える技法は滞在最大化の道具なので移植しない。
 */
function maybeCeilingHint() {
  if (!CEILING.enabled || mode !== 'full' || theta <= 0) return;
  const ceilingMin = Math.min(
    CEILING.maxMinutes,
    Math.max(CEILING.minMinutes, CEILING.perThetaMinutes / theta),
  );
  if (readMsSinceStimulus < ceilingMin * 60_000) return;
  const range = visibleRange();
  if (!range) return;
  const idx = range[1];
  pendingHintAt.add(idx);
  pendingTierAt.set(idx, 'normal');
  showHint(idx);
}

// ---- オーバーレイとヒント(θ駆動) ---------------------------------------
//
// θ = 本文1,000語あたりの表示回数。目標表示回数 = θ × totalWords / 1000。
// タイミングは「段落境界の候補点から乱数で選ぶ」折衷案(設計 Open Question #3):
// 未読の段落indexからランダムに選んだ集合に印を付け、その段落が初めて可視に
// なった瞬間に表示する。measure-onlyモード(本文検出失敗)ではヒントを出さない。

const overlay = createOverlay();
const overlayStartedAt = Date.now();

// ---- 余白の演出(Play ブックス) --------------------------------------------
// 普段の小さな演出(地のきらきら・ヒント・金/虹のレア)は、本文の枠の外にだけ描く。
if (PLAY_BOOKS && mode === 'full') {
  margin = createMargin(Paint);
  updateTextColumn();
}

// ---- 自分からの問い(道具カテゴリ・常設FAB) ------------------------------
//
// 卒業の定義「刺激の起点が自分になる」の実体化(docs/ask-and-nano-design.md)。
// θ配下に置かない(漸減しない)・回答に演出をつけない・1問1答。
// 文脈は読了済み段落のみ(未読は渡さない=ネタバレ禁止)。制御器には一切入れない。

if (mode === 'full') {
  overlay.mountAsk(async (question) => {
    markInteraction(); // 問うことは読書中の活動。セッションを放置終了させない
    const selection = String(getSelection() ?? '').slice(0, 500);
    const end = Math.min(maxDepthIdx, paragraphs.length - 1);
    const context = [];
    for (let i = Math.max(0, end - 5); i <= end; i += 1) {
      context.push({ i, text: textOf(paragraphs[i]).slice(0, 800) });
    }
    let res = null;
    try {
      res = await chrome.runtime.sendMessage({ type: Msg.ASK_REQUEST, question, selection, context });
    } catch {
      /* SW不在 */
    }
    if (!res?.ok) {
      const known = {
        unavailable: 'この端末では内蔵AI(Gemini Nano)が使えないため、答えられませんでした',
        'no-session': '計測セッションが見つかりませんでした',
        empty: '質問が空です',
      };
      overlay.showNotice(known[res?.error] ?? `回答できませんでした(${res?.error ?? 'no-response'})`, 4_000);
      return null;
    }
    const src = Number(res.source_index);
    const sourceEl =
      Number.isInteger(src) && src >= 0 && paragraphs[src]?.isConnected ? paragraphs[src] : null;
    overlay.showAnswer(res.answer, { sourceEl });
    return res;
  }, markInteraction);
}
const HINT_GRACE_MS = 8_000; // 開いた瞬間に光らせない+開始通知と重ねない
// ヒントどうしの最小間隔(Play ブックスのみ)。ページ送りの本では1ページ分の段落が一度に
// 見えるので、段落ごとの枠が同じページで続けて発火してしまう。間に合わなかった枠は残し、
// 間隔が空いた後もまだ見えていれば副経路が出す。先触れの保証(予告済みのレア)はこの対象外。
const MIN_HINT_GAP_MS = PLAY_BOOKS ? 30_000 : 0;
let lastHintAt = 0;

function hintCoolingDown() {
  return Date.now() - lastHintAt < MIN_HINT_GAP_MS;
}

/**
 * 通り過ぎた枠の持ち越し(Play ブックスのみ)。間隔待ちの間にページが進むと、枠のある段落が
 * 一度も出ないまま後ろへ流れて頻度が落ちる。そうした枠を、いま見えている段落 idx へ移す。
 * 戻り値: 移したら true。
 */
function carryOverPassedSlot(idx) {
  if (!PLAY_BOOKS || pendingHintAt.has(idx)) return false;
  for (const passed of pendingHintAt) {
    if (passed < idx && !visible.has(passed)) {
      const tier = pendingTierAt.get(passed);
      pendingHintAt.delete(passed);
      pendingTierAt.delete(passed);
      pendingHintAt.add(idx);
      if (tier) pendingTierAt.set(idx, tier);
      return true;
    }
  }
  return false;
}
let theta = 0;
let hintsShown = 0;
let pendingHintAt = new Set(); // ヒントを出す段落index
// レア度は計画時に事前ロールする(v0.11.0)。発火の瞬間ではなく前から決まっている
// ことで「先触れ」(予期の窓)が作れる。ドーパミンはcueで出る — 待ちを設計する。
let pendingTierAt = new Map(); // idx -> 'normal' | 'rare' | 'epic'

function planHints() {
  pendingHintAt = new Set();
  pendingTierAt = new Map();
  if (mode !== 'full' || theta <= 0) return;
  const target = Math.max(1, Math.round((theta * totalWords) / 1000));
  const remaining = Math.max(0, target - hintsShown);
  if (remaining === 0) return;
  // 未読の段落を優先候補にする。全段落が既に画面に入っていた場合(短い記事)は
  // 全段落を候補にする — でないとヒントの出る機会が永遠に来ない。
  let candidates = [];
  for (let i = Math.max(1, maxDepthIdx + 1); i < paragraphs.length; i += 1) candidates.push(i);
  if (candidates.length === 0) candidates = paragraphs.map((_, i) => i);
  for (const idx of shuffled(candidates).slice(0, remaining)) {
    pendingHintAt.add(idx);
    pendingTierAt.set(idx, rollTier());
  }
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 後から読み込まれた段落ぶんの枠(Play ブックス)。θ × 語数 / 1000 を、端数を持ち越しながら
// 新しい段落にだけ割り当てる。計画済みの枠(先触れ中のレアを含む)は触らない — 予告を裏切らない。
let hintCarry = 0;
function planHintsFor(idxs, words) {
  if (mode !== 'full' || theta <= 0) return;
  const exact = (theta * words) / 1000 + hintCarry;
  const n = Math.min(idxs.length, Math.floor(exact));
  hintCarry = Math.min(exact - n, 1);
  for (const idx of shuffled(idxs).slice(0, n)) {
    pendingHintAt.add(idx);
    pendingTierAt.set(idx, rollTier());
  }
}

// ---- Play ブックス: 後から読み込まれるページ -----------------------------
// 読み進めると先のページが DOM に足されるので、新しい段落にも印を付けて計測と演出の対象にする。
let pageWatcher = null;
let adoptTimer = null;

function adoptNewParagraphs() {
  adoptTimer = null;
  const added = [];
  let words = 0;
  for (const p of document.querySelectorAll(PLAY_BOOKS_PARAGRAPHS)) {
    if (p.dataset.rsIdx !== undefined) continue;
    const key = textOf(p);
    const w = countWords(key);
    if (w === 0) continue;
    let idx = paragraphKeys.get(key);
    if (idx === undefined) {
      // 初めて見る段落(先のページが読み込まれた)
      idx = paragraphs.length;
      paragraphs.push(p);
      paragraphKeys.set(key, idx);
      added.push(idx);
      words += w;
    }
    p.dataset.rsIdx = String(idx);
    observer.observe(p);
  }
  if (added.length === 0) return;
  totalWords += words;
  planHintsFor(added, words);
}

function watchNewPages() {
  if (!PLAY_BOOKS || mode !== 'full') return;
  pageWatcher = new MutationObserver(() => {
    if (!adoptTimer) adoptTimer = setTimeout(adoptNewParagraphs, 400);
  });
  pageWatcher.observe(document.querySelector('reader-pages') ?? document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * 先触れの対象: 未読の近い範囲(aheadParagraphs)にレア以上が待っているか。
 * あれば {idx, tier}。虹(epic)優先。
 */
function approachingRare() {
  let best = null;
  for (const idx of pendingHintAt) {
    const tier = pendingTierAt.get(idx);
    if (tier !== 'rare' && tier !== 'epic') continue;
    if (idx <= maxDepthIdx || idx > maxDepthIdx + FORESHADOW.aheadParagraphs) continue;
    if (tier === 'epic') return { idx, tier };
    best = { idx, tier };
  }
  return best;
}

// 演出のレア度ロール。頻度はθが決め、ここは「大きさ」だけを予測不能にする。
function rollTier() {
  const r = Math.random();
  if (demoEnabled && theta >= 5) {
    // デモ(高θ=初心者側のみ): レア演出をどんどん出す。玄人は通常確率
    if (r < 0.35) return 'epic';
    if (r < 0.8) return 'rare';
    return 'normal';
  }
  if (r < EFFECT_TIERS.epic.p) return 'epic';
  if (r < EFFECT_TIERS.epic.p + EFFECT_TIERS.rare.p) return 'rare';
  return 'normal';
}

// ---- クイズ(理解連動Micro Content・LLM経由) -----------------------------
//
// ヒント枠の一部が確率でクイズに化ける。素材は読了済み段落のみ(未読からは
// ネタバレになるので出さない)。1セッション1問。サーバ不在・生成失敗は
// 静かに諦める — クイズの都合で読書を止めない。

let quizUsed = false;
let quizInFlight = false;

function maybeQuizInsteadOfHint() {
  if (EVENTS_ON) return false; // Play ブックスは「めくった直後の突然クイズ」に一本化する
  if (!QUIZ.enabled || quizUsed || quizInFlight) return false;
  if (mode !== 'full') return false;
  if (maxDepthIdx + 1 < QUIZ.minParagraphsRead) return false;
  // デモでも頻度はθに従う: 初心者側(θ>=5)だけ確実に出し、玄人は通常の30%抽選
  if (!(demoEnabled && theta >= 5) && Math.random() >= QUIZ.p) return false;
  startQuiz();
  return true;
}

async function startQuiz() {
  quizInFlight = true;
  // 素材は「直近に読んだ段落」から選ぶ — いま頭に残っているものについて聞く。
  // 直近4段落のうち最長のもの。短すぎる場合だけ読了済み全体に広げる
  const end = Math.min(maxDepthIdx, paragraphs.length - 1);
  const pick = (from) => {
    let idx = -1;
    for (let i = from; i <= end; i += 1) {
      const t = textOf(paragraphs[i]);
      if (idx < 0 || t.length > textOf(paragraphs[idx]).length) idx = i;
    }
    return idx;
  };
  let sourceIdx = pick(Math.max(0, end - 3));
  if ((paragraphs[sourceIdx] ? textOf(paragraphs[sourceIdx]) : '').length < 80) sourceIdx = pick(0);
  const best = paragraphs[sourceIdx] ? textOf(paragraphs[sourceIdx]) : '';
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({
      type: Msg.QUIZ_REQUEST,
      paragraph_text: best.slice(0, 2000),
    });
  } catch {
    /* SW不在。諦める */
  }
  quizInFlight = false;
  if (!res?.ok || !res.quiz) return;
  if (quizUsed || !isReading()) return; // 生成中に状況が変わっていたら出さない
  quizUsed = true;
  hintsShown += 1;
  readMsSinceStimulus = 0;
  report(EventType.HINT_SHOWN, { hint_id: 'quiz_llm', kind: 'quiz' });
  // 正解時の演出の強さはθ連動: θが高いほど盛大に、卒業に向けて静かになる
  // デモでも強さはθに従う(初心者=大当たり、玄人=静かな二波)。
  const rewardTier =
    theta >= QUIZ.jackpotMinTheta ? 'jackpot' : theta >= QUIZ.rainMinTheta ? 'rain' : 'shower';
  overlay.showQuiz(res.quiz, {
    rewardTier,
    // 出題元の段落を光の枠で指す(言葉ではなく光で「この段落の話」と伝える)
    sourceEl: paragraphs[sourceIdx]?.isConnected ? paragraphs[sourceIdx] : null,
    onAnswer: (correct, chosenIndex, latencyMs) => {
      report(EventType.QUIZ_ANSWERED, {
        quiz_id: res.quiz_id ?? null,
        correct,
        chosen_index: chosenIndex,
        latency_ms: latencyMs,
      });
      if (correct && rewardTier !== 'shower') {
        report(EventType.EFFECT_SHOWN, { effect_id: `quiz_${rewardTier}` });
      }
    },
  });
}

function showHint(idx) {
  const tier = pendingTierAt.get(idx) ?? rollTier();
  pendingHintAt.delete(idx);
  pendingTierAt.delete(idx);
  forewarnTicks = 0;
  readMsSinceStimulus = 0;
  lastHintAt = Date.now();
  // クイズに化けるのはnormal枠だけ。レア以上は先触れで「金/虹が来る」と
  // 予告済みなので、別物にすり替えない(予告を裏切らない)。
  if (tier === 'normal' && maybeQuizInsteadOfHint()) return;
  hintsShown += 1;
  const { hint_id, text } = pickHint({
    min: Math.max(1, Math.round(localReadMs / 60_000)),
    cjk: isCJK,
  });
  report(EventType.HINT_SHOWN, { hint_id, kind: 'canned' });
  if (margin) {
    // Play ブックス: 文字のカードは出さず、余白で花が咲く(レアは金の花、激レアは虹の帯)
    margin.hint(tier, theta / THETA_MAX);
    if (tier !== 'normal') report(EventType.EFFECT_SHOWN, { effect_id: `margin_${tier}` });
    return;
  }
  const onClick = () => report(EventType.HINT_CLICKED, { hint_id });

  if (tier === 'normal') {
    overlay.showHint(text, { onClick });
    return;
  }
  // レア以上: 予告の光→約1秒後に雨(レア=金、激レア=虹)。予告は必ず当たる。
  // 激レアは予告が二度瞬く(擬似連の1.5秒版) — 二拍の待ちが期待の窓を広げる。
  overlay.showHint(text, { onClick, quiet: true });
  overlay.foreshadow(tier === 'epic' ? 2 : 1);
  setTimeout(
    () => {
      overlay.rain(tier);
      report(EventType.EFFECT_SHOWN, { effect_id: `rain_${tier}` });
    },
    tier === 'epic' ? 1_500 : 950,
  );
}

/** 主経路: 候補段落が新しく画面に入った瞬間(段落境界)。 */
function maybeHint(idx) {
  if (Date.now() - overlayStartedAt < HINT_GRACE_MS) return; // 候補は残す(後で副経路が拾う)
  if (hintCoolingDown()) return; // 候補は残す(間隔が空いたら副経路が拾う)
  if (!pendingHintAt.has(idx) && !carryOverPassedSlot(idx)) return;
  if (!isReading()) return; // 読んでいる最中にだけ出す
  showHint(idx);
}

/** 副経路: dwell tickに合わせて、いま画面内にある候補段落から1つ出す。 */
function fireHintFromVisible() {
  if (Date.now() - overlayStartedAt < HINT_GRACE_MS) return;
  if (hintCoolingDown()) return;
  for (const idx of pendingHintAt) {
    if (visible.has(idx)) {
      showHint(idx);
      return; // 1 tickに1枚まで
    }
  }
  // 見えている段落に枠が無ければ、通り過ぎた枠を持ち越して出す(Play ブックスのみ)
  for (const idx of visible) {
    if (carryOverPassedSlot(idx)) {
      showHint(idx);
      return;
    }
  }
}

// デモ: ヒント枠を待たず、開始直後からクイズを出しにいく(1問出たら止まる)。
// demoEnabledは起動時(GET_STATUS後)に確定するので、生成条件でなくtick内で判定する。
// これも初心者側(θ>=5)のみ — 玄人のクイズは通常経路の頻度に従う
const demoQuizTimer = QUIZ.enabled
  ? setInterval(() => {
        if (quizUsed) {
          clearInterval(demoQuizTimer);
          return;
        }
        if (EVENTS_ON || !demoEnabled || theta < 5) return; // デモOFF or 玄人はデモ加速なし
        if (quizInFlight || mode !== 'full' || maxDepthIdx < 0) return;
        startQuiz();
      }, 3_000)
    : null;

// ---- めくった直後の「突然の出来事」(Play ブックス) -------------------------
//
// くまのうんちく/くまが顔を出す/突然クイズ のどれかが、出たり出なかったりする(可変報酬)。
// うんちくとクイズは生成に数秒かかるので、読み終えたページ(既読で、いま見えていない段落)から
// 先に1つずつ作ってストックしておき、ページ送りのたびに抽選する。
// 頻度も派手さもθに比例し、θ=0では何も起きない。

const EVENTS_ON = PLAY_BOOKS && PAGE_EVENTS.enabled;
const stage = createStage({ Paint, bearSVG });
const stock = { quiz: null, trivia: null };
const inFlight = { quiz: false, trivia: false };
// 作れなかった後は数ページ空けてから作りに行く(Nano 不在・話せることが無いのに毎ページ頼まない)
const retryAt = { quiz: 0, trivia: 0 };
// ストックはこのページ送りの回数を過ぎたら古いとみなして捨てる(「さっきのページ」でなくなる)
const STALE_TURNS = { quiz: 6, trivia: 4 };
const shownTrivia = new Set(); // 同じうんちくを繰り返さない
let lastBearAt = 0;
let lastQuizAt = 0;
let pageTurns = 0;
let stopped = false;

/** 既読で、いま見えていない段落の本文。新しい方から遡って集め、読んだ順に並べる。 */
function readTextForEvents() {
  const picked = [];
  let chars = 0;
  for (let k = seenOrder.length - 1; k >= 0 && picked.length < 12; k -= 1) {
    const idx = seenOrder[k];
    if (visible.has(idx)) continue;
    const t = textOf(paragraphs[idx]);
    if (!t) continue;
    picked.unshift(t);
    chars += t.length;
    if (chars >= PAGE_EVENTS.maxTextChars) break;
  }
  return picked.join('\n').slice(-PAGE_EVENTS.maxTextChars);
}

/** ことば吹雪の文字: 読み終えたページから漢字を中心に拾う(小書きのかな・記号は除く)。 */
function glyphsFromReading() {
  const text = readTextForEvents();
  const kanji = [...new Set(text.match(/[一-鿿]/g) ?? [])];
  const small = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー';
  const kana = [...new Set(text.match(/[ぁ-んァ-ン]/g) ?? [])].filter((c) => !small.includes(c));
  const pool = kanji.length >= 6 ? kanji : kanji.concat(kana);
  return shuffled(pool).slice(0, 24);
}

/** 生成されたクイズの形を確かめる(問題文が文字列・選択肢3つ・正解の添字が 0〜2 の整数)。 */
function validQuiz(q) {
  return (
    typeof q?.question === 'string' &&
    q.question.trim() !== '' &&
    Array.isArray(q.choices) &&
    q.choices.length === 3 &&
    q.choices.every((c) => typeof c === 'string' && c.trim() !== '') &&
    Number.isInteger(q.answer_index) &&
    q.answer_index >= 0 &&
    q.answer_index < 3
  );
}

async function prefetch(kind) {
  if (!EVENTS_ON || stopped || theta <= 0 || stock[kind] || inFlight[kind]) return;
  if (pageTurns < retryAt[kind]) return;
  const text = readTextForEvents();
  if (text.length < PAGE_EVENTS.minTextChars) return;
  inFlight[kind] = true;
  const turn = pageTurns;
  try {
    if (kind === 'quiz') {
      const res = await chrome.runtime.sendMessage({ type: Msg.QUIZ_REQUEST, paragraph_text: text });
      if (res?.ok && validQuiz(res.quiz)) {
        stock.quiz = { quiz: res.quiz, quiz_id: res.quiz_id ?? null, turn };
      }
    } else {
      const res = await chrome.runtime.sendMessage({ type: Msg.TRIVIA_REQUEST, paragraph_text: text });
      if (res?.ok && res.trivia?.text && !shownTrivia.has(res.trivia.text)) {
        stock.trivia = { text: res.trivia.text, term: res.trivia.term ?? '', turn };
      }
    }
  } catch {
    /* SW不在・生成失敗は静かに諦める */
  }
  inFlight[kind] = false;
  if (!stock[kind]) retryAt[kind] = pageTurns + PAGE_EVENTS.retryAfterTurns;
}

/** 古くなったストックを捨てる(何ページも前に作ったものを「さっきのページ」として出さない)。 */
function dropStale() {
  for (const kind of ['quiz', 'trivia']) {
    if (stock[kind] && pageTurns - stock[kind].turn > STALE_TURNS[kind]) stock[kind] = null;
  }
}

/**
 * ページ送りのたびに抽選し、当たれば少し間を置いて出す。クイズとくまは別々に抽選し、
 * 同じめくりで両方当たればクイズを優先する。作れていないもの(ストックなし)は抽選しない。
 */
function maybePageEvent() {
  if (!EVENTS_ON || stopped || theta <= 0 || stage.modalOpen) return;
  dropStale();
  if (pageTurns <= PAGE_EVENTS.minTurns) return;
  const now = Date.now();
  const scale = Math.min(1, theta / THETA_MAX) * (demoEnabled ? 2 : 1);
  const later = (fn) => setTimeout(() => !stopped && fn(), PAGE_EVENTS.delayMs);

  const q = PAGE_EVENTS.quiz;
  if (stock.quiz && now - lastQuizAt >= q.minGapMs && Math.random() < q.maxP * scale) {
    const item = stock.quiz;
    stock.quiz = null;
    lastQuizAt = now;
    later(() => showQuiz(item));
    return;
  }

  const b = PAGE_EVENTS.bear;
  if (now - lastBearAt < b.minGapMs || now - lastQuizAt < PAGE_EVENTS.afterQuizMs) return;
  if (Math.random() >= b.maxP * scale) return;
  lastBearAt = now;
  const talk = stock.trivia && Math.random() < b.weights.trivia / (b.weights.trivia + b.weights.peek);
  if (talk) {
    const item = stock.trivia;
    stock.trivia = null;
    later(() => showTrivia(item));
  } else {
    later(showPeek);
  }
}

function noteStimulus(hintId, kind) {
  hintsShown += 1;
  readMsSinceStimulus = 0;
  lastHintAt = Date.now(); // 直後に通常のヒントを重ねない
  report(EventType.HINT_SHOWN, { hint_id: hintId, kind });
}

function showPeek() {
  noteStimulus('bear_peek', 'bear');
  stage.peek({ intensity: theta / THETA_MAX });
}

function showTrivia(item) {
  shownTrivia.add(item.text);
  noteStimulus('bear_trivia', 'trivia');
  stage.trivia(item, { intensity: theta / THETA_MAX, onClose: () => prefetch('trivia') });
}

function showQuiz({ quiz, quiz_id }) {
  noteStimulus('quiz_flash', 'quiz');
  stage.quiz(quiz, {
    intensity: theta / THETA_MAX,
    words: PAGE_EVENTS.words,
    glyphs: glyphsFromReading(),
    onFirstAnswer: (correct, chosenIndex, latencyMs) => {
      markInteraction();
      report(EventType.QUIZ_ANSWERED, {
        quiz_id,
        correct,
        chosen_index: chosenIndex,
        latency_ms: latencyMs,
      });
    },
    onCelebrate: () => report(EventType.EFFECT_SHOWN, { effect_id: 'quiz_flash' }),
    onClose: () => {
      markInteraction();
      prefetch('quiz');
    },
  });
}

// 最後のページに進んで着いた瞬間の読了フィナーレ(Play ブックス・1セッション1回)。
// 大きさはθに比例し、θ=0では出さない — 卒業後は静かに読み終える。
let finaleShown = false;
function showBookFinale() {
  if (!PLAY_BOOKS || stopped || finaleShown || theta <= 0) return;
  finaleShown = true;
  lastHintAt = Date.now();
  lastBearAt = Date.now();
  readMsSinceStimulus = 0;
  report(EventType.EFFECT_SHOWN, { effect_id: 'book_finale' });
  stage.finale({
    intensity: theta / THETA_MAX,
    words: PAGE_EVENTS.words,
    glyphs: glyphsFromReading(),
    onClose: markInteraction,
  });
}

// めくった瞬間の花びら(Play ブックス)。クイズ正解と同じ降り方を、めくるたびに数秒。
// 確率も量もθに比例し、θ=0では出ない。
function maybePageShower() {
  if (!PLAY_BOOKS || !PAGE_SHOWER.enabled || stopped || mode !== 'full' || theta <= 0) return;
  if (stage.modalOpen) return;
  const level = Math.min(1, theta / THETA_MAX);
  if (Math.random() >= PAGE_SHOWER.maxP * level * (demoEnabled ? 2 : 1)) return;
  stage.pageShower({ intensity: level, glyphs: glyphsFromReading() });
}

// ---- 常時演出(地のきらきら) ---------------------------------------------
//
// 読んでいる間だけ、θに比例した密度で小さな星が漂う。ヒント(離散報酬)とは
// 別系統の連続的な演出で、Level 0が最も濃く、θの減少とともに自然に薄まる。
// 「読んでいる状態そのものに薄い報酬が伴う」がこの補助輪の地の部分。

const ambientTimer = AMBIENT.enabled
  ? setInterval(() => {
      if (document.hidden || mode !== 'full' || theta <= 0) return;
      if (!isReading()) return; // 読む手が止まっているときに光らせない
      // 先触れ: 少し先の段落にレア以上が待っているとき、地のきらきらが
      // 金(激レアは虹)に変わる — 「もうすぐ来る」をcueで伝える予期の窓。
      // 外れ予告は存在しないので、この色替わりは必ず本演出で回収される。
      const fw = approachingRare();
      if (fw) {
        if (Math.random() < 0.45) {
          const palette = fw.tier === 'epic' ? 'rainbow' : 'gold';
          if (margin) margin.ambient(palette, 2 + Math.floor(Math.random() * 3));
          else overlay.glint(3 + Math.floor(Math.random() * 5), palette);
        }
        return;
      }
      // 日常: 銀の星。均等に湧かせず、たまに「キラッ」と固まって瞬く(予測不能性)
      const p =
        (theta / THETA_MAX) ** 2 *
        AMBIENT.maxClusterChance *
        (demoEnabled && theta >= 5 ? 2.2 : 1);
      if (Math.random() < Math.min(p, 0.9)) {
        if (margin) margin.ambient('silver', 2 + Math.floor(Math.random() * 3));
        else overlay.glint(3 + Math.floor(Math.random() * 5));
      }
    }, AMBIENT.tickMs)
  : null;

// ---- 常時演出(紙のめくれ) -----------------------------------------------
//
// 読んでいる間だけ、ときどき風で左下の角がペラっとめくれて戻る(本文には重ねない)。
// 頻度と大きさはθに比例する。

const pageCurl = PAGE_CURL.enabled ? createPageCurl(overlay.curlLayer()) : null;
let lastCurlAt = 0;
const curlTimer = pageCurl
  ? setInterval(() => {
      if (document.hidden || mode !== 'full' || theta <= 0) return;
      if (!isReading() || Date.now() - lastCurlAt < PAGE_CURL.minGapMs) return;
      const level = theta / THETA_MAX;
      if (Math.random() >= PAGE_CURL.maxChance * level) return;
      lastCurlAt = Date.now();
      pageCurl.flip(PAGE_CURL.minSize + (PAGE_CURL.maxSize - PAGE_CURL.minSize) * level);
    }, PAGE_CURL.tickMs)
  : null;

// ---- 片付け ---------------------------------------------------------------

function stop({ celebrate = false, readMin = 0 } = {}) {
  if (stopped) return; // 二重に畳まない(拡張の更新で切れた後に rs_stop が届く等)
  stopped = true;
  stage.close();
  clearInterval(dwellTimer);
  if (ambientTimer) clearInterval(ambientTimer);
  if (curlTimer) clearInterval(curlTimer);
  pageCurl?.destroy();
  if (demoQuizTimer) clearInterval(demoQuizTimer);
  observer.disconnect();
  pageWatcher?.disconnect();
  clearTimeout(adoptTimer);
  removeEventListener('resize', updateTextColumn);
  for (const [type, fn] of listeners) removeEventListener(type, fn);
  for (const el of document.querySelectorAll('[data-rs-idx]')) delete el.dataset.rsIdx;
  window.__readingScaffoldLoaded = false;
  if (celebrate) {
    if (margin) margin.hint('rare', theta / THETA_MAX);
    else overlay.celebrate(readMin);
    setTimeout(() => {
      overlay.destroy();
      margin?.destroy();
    }, demoEnabled && theta >= 5 ? 7_500 : 2_800);
  } else {
    overlay.destroy();
    margin?.destroy();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'rs_stop') {
    stop({ celebrate: msg.celebrate === true, readMin: msg.read_min ?? 0 });
  } else if (msg?.type === 'rs_progress') {
    bookPct = Number.isFinite(msg.pct) ? msg.pct : bookPct;
  } else if (msg?.type === 'rs_page_turn') {
    // Play ブックスのページ送り。送りボタンは最上位のフレームにあり、ここでは操作が見えない
    markInteraction();
    scheduleTextColumn();
    pageTurns += 1;
    stage.dismissCorner(); // さっきのページのうんちくは引っ込める
    maybePageShower();
    maybePageEvent();
    // めくった直後はまだ前のページが「見えている」扱いなので、可視が更新されてから素材を集めて作る
    setTimeout(() => {
      prefetch('trivia');
      prefetch('quiz');
    }, 900);
  } else if (msg?.type === 'rs_book_end') {
    showBookFinale();
  } else if (msg?.type === 'rs_theta') {
    // θ手動ダイヤル(ダッシュボード)からの即時反映。
    theta = msg.theta ?? 0;
    setDemoTheta(theta);
    planHints();
  }
});
addEventListener('pagehide', () => stop(), { once: true });

// ---- 開始報告 -------------------------------------------------------------

report('content_ready', {
  article_len_words: totalWords,
  paragraph_count: paragraphs.length,
  lang: isCJK ? 'cjk' : 'latin',
  mode,
});

// θはSWが持っているセッションから受け取る。SW側の保存処理と競走になっても
// 取りこぼさないよう、セッションが見えるまで少し待って再試行する。
let sessionInfo = null;
for (let i = 0; i < 6 && !sessionInfo; i += 1) {
  try {
    const res = await chrome.runtime.sendMessage({ type: Msg.GET_STATUS });
    sessionInfo = res?.session ?? null;
  } catch {
    /* SW再起動中など。次の試行に任せる */
  }
  if (!sessionInfo) await new Promise((r) => setTimeout(r, 250));
}
// デモモード(プロフィールごと・既定OFF)を読み、演出系に反映してから計画する。
demoEnabled = await readDemoFlag();
setDemoEnabled(demoEnabled);
theta = sessionInfo?.theta ?? 0;
if (PLAY_BOOKS && Number.isFinite(sessionInfo?.book_pct)) bookPct = sessionInfo.book_pct;
setDemoTheta(theta); // デモの増幅率もθ連動(玄人はほぼ通常=静か)
planHints();
if (PLAY_BOOKS && mode === 'full') adoptNewParagraphs(); // 重複して残っている要素(見えている方を含む)も監視する
watchNewPages();

// 開始の合図。無言だと動いているかどうかが本人に分からない(診断可能性)。
// Level/θ/バージョンを添えるのはドッグフーディング用: どの設定・どのコードで
// 動いているかを一目で判別する(θ=0でヒントが出ないのは仕様、が見えるように)。
if (mode === 'full') {
  // θと版はストア版では出さない(補助の量は本人に見せない — 気づかない速さで減らす設計)
  let dev = '';
  if (!IS_STORE_BUILD) {
    const ver = chrome.runtime.getManifest?.().version ?? '?';
    dev = ` · ${sessionInfo ? `θ=${Number(theta).toFixed(1)}` : '設定未取得'} · v${ver}`;
  }
  overlay.showNotice(`計測をはじめました(本文 約${totalWords.toLocaleString()}語)${dev}`, 4_000);
} else {
  // 設計どおり: 本文検出に失敗したページは補助なしで計測のみ。
  overlay.showNotice('本文を検出できないため、このページでは計測のみ行います', 4_500);
}
