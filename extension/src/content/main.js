// セッション中だけ動くcontent scriptの本体(loader.js経由で注入される)。
//
// このファイルの制約:
//   - ページDOMを変更しない。追加してよいのはShadow DOMに閉じたオーバーレイだけ。
//   - 本文は読み取りのみ。再構成・広告除去はしない。
//   - service workerへ送るのは計測値だけ。本文テキストは送らない(LLM経路はv0後半)。

// loader.jsが付けたキャッシュ割りクエリ(?t=...)を配下のモジュールにも伝播させる。
// これがないと、拡張をリロードしても開きっぱなしのページでは古いモジュールが
// ページのモジュールキャッシュから使われ続ける(overlay/hintsだけ更新されない事故)。
const v = new URL(import.meta.url).search;
const mod = (path) => import(chrome.runtime.getURL(path) + v);

const { Msg, EventType } = await mod('src/shared/events.js');
const { SESSION, AMBIENT, THETA_MAX, EFFECT_TIERS, QUIZ, FORESHADOW, CEILING, readDemoFlag } =
  await mod('src/shared/config.js');
const { createOverlay, setTextColumn, setDemoTheta, setDemoEnabled } =
  await mod('src/content/overlay.js');

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

// Readability相当の簡易版: article/main配下を優先し、一定長以上の<p>を本文段落とみなす。
// 失敗したら「計測のみ」モード(段落可視の条件を外し、操作の有無だけで読書時間を数える)。
function detectParagraphs() {
  const root =
    document.querySelector('article') ?? document.querySelector('main') ?? document.body;
  const paragraphs = [...root.querySelectorAll('p')].filter(
    (p) => countWords(p.innerText ?? '') >= 20 && p.offsetParent !== null,
  );
  let latinTotal = 0;
  let cjkTotal = 0;
  for (const p of paragraphs) {
    const { latin, cjk } = countParts(p.innerText);
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

const { paragraphs, totalWords, isCJK, mode } = detectParagraphs();

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

// 本文カラムの位置をオーバーレイへ伝える(日常の星を余白に逃がすため)
function updateTextColumn() {
  let left = Infinity;
  let right = -Infinity;
  for (const p of paragraphs) {
    const r = p.getBoundingClientRect();
    if (r.width > 0) {
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
    }
  }
  setTextColumn(Number.isFinite(left) ? { left, right } : null);
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
let forewarnTicks = 0; // 先触れが続いたdwell tick数(発火保証用)
let readMsSinceStimulus = 0; // 最後の演出からの実読書時間(天井用)

const dwellTimer = setInterval(() => {
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
      context.push({ i, text: (paragraphs[i].innerText ?? '').slice(0, 800) });
    }
    let res = null;
    try {
      res = await chrome.runtime.sendMessage({ type: Msg.ASK_REQUEST, question, selection, context });
    } catch {
      /* SW不在 */
    }
    if (!res?.ok) {
      const known = {
        unavailable: 'この環境ではAIを呼び出せませんでした(内蔵AIが未対応・サーバ未起動)',
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
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const idx of candidates.slice(0, remaining)) {
    pendingHintAt.add(idx);
    pendingTierAt.set(idx, rollTier());
  }
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
      const t = paragraphs[i].innerText ?? '';
      if (idx < 0 || t.length > (paragraphs[idx].innerText ?? '').length) idx = i;
    }
    return idx;
  };
  let sourceIdx = pick(Math.max(0, end - 3));
  if ((paragraphs[sourceIdx]?.innerText ?? '').length < 80) sourceIdx = pick(0);
  const best = paragraphs[sourceIdx]?.innerText ?? '';
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
  // クイズに化けるのはnormal枠だけ。レア以上は先触れで「金/虹が来る」と
  // 予告済みなので、別物にすり替えない(予告を裏切らない)。
  if (tier === 'normal' && maybeQuizInsteadOfHint()) return;
  hintsShown += 1;
  const { hint_id, text } = pickHint({
    pct: completionPct(),
    min: Math.max(1, Math.round(localReadMs / 60_000)),
    cjk: isCJK,
  });
  report(EventType.HINT_SHOWN, { hint_id, kind: 'canned' });
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

// デモ: ヒント枠を待たず、開始直後からクイズを出しにいく(1問出たら止まる)。
// demoEnabledは起動時(GET_STATUS後)に確定するので、生成条件でなくtick内で判定する。
// これも初心者側(θ>=5)のみ — 玄人のクイズは通常経路の頻度に従う
const demoQuizTimer = QUIZ.enabled
  ? setInterval(() => {
        if (quizUsed) {
          clearInterval(demoQuizTimer);
          return;
        }
        if (!demoEnabled || theta < 5) return; // デモOFF or 玄人はデモ加速なし
        if (quizInFlight || mode !== 'full' || maxDepthIdx < 0) return;
        startQuiz();
      }, 3_000)
    : null;

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
          overlay.glint(3 + Math.floor(Math.random() * 5), fw.tier === 'epic' ? 'rainbow' : 'gold');
        }
        return;
      }
      // 日常: 銀の星。均等に湧かせず、たまに「キラッ」と固まって瞬く(予測不能性)
      const p =
        (theta / THETA_MAX) ** 2 *
        AMBIENT.maxClusterChance *
        (demoEnabled && theta >= 5 ? 2.2 : 1);
      if (Math.random() < Math.min(p, 0.9)) overlay.glint(3 + Math.floor(Math.random() * 5));
    }, AMBIENT.tickMs)
  : null;

// ---- 片付け ---------------------------------------------------------------

function stop({ celebrate = false, readMin = 0 } = {}) {
  clearInterval(dwellTimer);
  if (ambientTimer) clearInterval(ambientTimer);
  if (demoQuizTimer) clearInterval(demoQuizTimer);
  observer.disconnect();
  removeEventListener('resize', updateTextColumn);
  for (const [type, fn] of listeners) removeEventListener(type, fn);
  for (const p of paragraphs) delete p.dataset.rsIdx;
  window.__readingScaffoldLoaded = false;
  if (celebrate) {
    overlay.celebrate(readMin);
    setTimeout(() => overlay.destroy(), demoEnabled && theta >= 5 ? 7_500 : 2_800);
  } else {
    overlay.destroy();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'rs_stop') {
    stop({ celebrate: msg.celebrate === true, readMin: msg.read_min ?? 0 });
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
setDemoTheta(theta); // デモの増幅率もθ連動(玄人はほぼ通常=静か)
planHints();

// 開始の合図。無言だと動いているかどうかが本人に分からない(診断可能性)。
// Level/θ/バージョンを添えるのはドッグフーディング用: どの設定・どのコードで
// 動いているかを一目で判別する(θ=0でヒントが出ないのは仕様、が見えるように)。
if (mode === 'full') {
  const ver = chrome.runtime.getManifest?.().version ?? '?';
  const lv = sessionInfo ? `θ=${Number(theta).toFixed(1)}` : '設定未取得';
  overlay.showNotice(
    `計測をはじめました(本文 約${totalWords.toLocaleString()}語)· ${lv} · v${ver}`,
    4_000,
  );
} else {
  // 設計どおり: 本文検出に失敗したページは補助なしで計測のみ。
  overlay.showNotice('本文を検出できないため、このページでは計測のみ行います', 4_500);
}
