// Play ブックスのページ表示を読む小さな見張り(loader.js経由で、Play ブックスの全フレームに注入される)。
//
// リーダー下部のページ表示(例「11 / 17」、見開きは「4-5 / 17」)だけを読み、本の中での位置を報告する。
// ページ表示・スライダー・送りボタンは最上位(play.google.com)ではなく、その中の
// books.googleusercontent.com のフレームにある。どのフレームに来るかを決め打ちしないよう
// 全フレームで動かし、ページ表示が見つかったフレームだけが報告する。
// 本文の段落からは、ページ送りのたびに要素が作り直されるため位置を正しく出せない。
//
// このファイルの制約: ページを改変しない(読むだけ)。セッション中だけ注入され、rs_stop で止まる。

const { Msg } = await import(
  chrome.runtime.getURL('src/shared/events.js') + new URL(import.meta.url).search
);

const PAGE_LABEL = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*\/\s*(\d+)\s*$/;
const POLL_MS = 1_500;
// 「めくって進んだ」とみなす1回の見回りあたりの前進の上限(見開きは2ページずつ進む)。
// これより大きい前進はスライダーや目次で飛んだもので、読了の判定に使わない
const MAX_STEP = 4;
// 本文のページ。中の「1/2」などをページ表示と取り違えないよう、丸ごと見ない(走査も軽くなる)
const BOOK_PAGE = 'READER-RENDERED-PAGE';

/**
 * 画面に見えている文字。ページ表示は読み上げ用の「Page 17 of 17」と見た目の「17」「 / 17」
 * (aria-hidden)を同じ要素に持つので、aria-hidden の子があればそちらだけをつなぐ。
 */
function visibleText(el) {
  const shown = el.querySelectorAll('[aria-hidden="true"]');
  return shown.length ? [...shown].map((s) => s.textContent).join('') : el.textContent;
}

/**
 * 「数字 / 数字」だけのテキストを探す(クラス名に頼らない — 画面の作りが変わっても拾えるように)。
 * 文書順で後に来る一致(=より内側の要素)を採る。見つからなければスライダーの aria 値を使う。
 */
function readPosition() {
  let found = null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (el) =>
      el.tagName === BOOK_PAGE ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    const t = el.textContent;
    if (!t || t.length > 60) continue; // 読み上げ用の文言を含んでも短い
    const m = visibleText(el).match(PAGE_LABEL);
    if (m) found = { from: Number(m[1]), page: Number(m[2] ?? m[1]), total: Number(m[3]) }; // 見開きは後ろのページ
  }
  if (!found) {
    const slider = document.querySelector('[role="slider"][aria-valuemax]');
    const now = Number(slider?.getAttribute('aria-valuenow'));
    const max = Number(slider?.getAttribute('aria-valuemax'));
    if (Number.isFinite(now) && max > 0) found = { from: now, page: now, total: max };
  }
  if (!found || !(found.total > 0) || found.page < 0 || found.page > found.total) return null;
  return found;
}

function send(event, payload) {
  try {
    chrome.runtime.sendMessage({ type: Msg.REPORT, event, payload });
  } catch {
    /* 拡張のリロード等でコンテキストが消えた場合 */
  }
}

// 読了の判定: 最後のページに、めくって「進んで」着いた瞬間だけ1回報告する。
// ページ表示が総ページに届いたこと(page === total)を必須にし、直近の移動は小さな前進に限る —
// 戻ったとき・最後のページで開き直したとき・スライダーや目次で最後へ飛んだときは出さない。
// 読み終えた画面: 最後のページの次にある「You've just finished」の画面。見開きでは、ページ表示が
// 「17–20 / 20」(最後の見開き)から「20 / 20」に変わる。読了フィナーレはここで出す(book_end_screen)。
// 1ページずつの表示では表示が変わらないことがあるので、本文フレームは本文が画面から消えたことでも拾う。
let last = '';
let lastLabel = '';
let lastPage = null;
let movedForward = false;
let endReported = false;
let endScreenReported = false;

function check() {
  const pos = readPosition();
  if (pos) {
    const key = `${pos.page}/${pos.total}`;
    const label = `${pos.from}-${pos.page}/${pos.total}`;
    if (endReported && !endScreenReported && label !== lastLabel && lastPage >= pos.total && pos.page >= pos.total) {
      endScreenReported = true;
      send('book_end_screen', pos);
    }
    lastLabel = label;
    if (key !== last) {
      last = key;
      if (lastPage !== null) {
        const step = pos.page - lastPage;
        movedForward = step > 0 && step <= MAX_STEP;
      }
      lastPage = pos.page;
      send('book_progress', pos);
    }
  }
  if (!endReported && movedForward && pos && pos.page >= pos.total) {
    endReported = true;
    send('book_end', pos);
  }
}

const timer = setInterval(() => {
  // 拡張が更新・再読み込みされると SW と切れたまま残る。見張りを畳む
  if (!chrome.runtime?.id) {
    stop();
    return;
  }
  check();
}, POLL_MS);
check();

function onMessage(msg) {
  if (msg?.type === 'rs_stop') stop();
}

function stop() {
  clearInterval(timer);
  removeEventListener('pagehide', stop);
  try {
    chrome.runtime.onMessage.removeListener(onMessage);
  } catch {
    /* 拡張のコンテキストが消えている */
  }
  window.__readingScaffoldLoaded = false;
}

chrome.runtime.onMessage.addListener(onMessage);
addEventListener('pagehide', stop, { once: true });
