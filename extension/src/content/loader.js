// chrome.scripting.executeScriptはESモジュールを直接注入できないため、
// このローダーだけをclassic scriptとして注入し、本体をモジュールとして読み込む。
// 二重注入(同じタブで開始を2回押す等)はここで止める。
(() => {
  // 二重注入の判定はバージョンで行う。単なる真偽値だと、拡張をリロードしても
  // 開いたままのタブに残った「幽霊」古スクリプトのフラグが残り、新コードが
  // 注入されない(タブ再読込を強いられる)。バージョンが変われば必ず入れ直す。
  const version = chrome.runtime.getManifest().version;
  if (window.__readingScaffoldLoaded === version) return; // 同一版の二重注入だけ止める
  // Play ブックスは全フレームへ注入される。本体(main.js)は本文のある
  // books.googleusercontent.com のフレームでだけ動かす。ページ表示を読む見張り
  // (playbooks-pager.js)は Play ブックスのどのフレームでも動かす — ページ表示は最上位の
  // play.google.com には無く、どのフレームに来るかを決め打ちしない。
  const bookFrame = location.hostname === 'books.googleusercontent.com';
  const playBooks =
    bookFrame ||
    (location.hostname === 'play.google.com' && location.pathname.startsWith('/books/reader'));
  window.__readingScaffoldLoaded = version;
  // クエリでモジュールキャッシュを割る: 同じページで2回目のセッションを始めたとき、
  // キャッシュ済みモジュールだとトップレベルが再実行されず計測が始まらない。
  const bust = '?t=' + Date.now();
  const load = (entry) => import(chrome.runtime.getURL(entry) + bust);

  if (playBooks) load('src/content/playbooks-pager.js');
  if (!playBooks) {
    load('src/content/main.js');
    return;
  }
  if (!bookFrame) return;

  // 本体は本文がそろってから入れる。表紙・挿絵・章の扉で「読む」を押したときは本文がまだ無いか
  // 少なく、その時点で入れると本文を見つけられず計測だけのセッションになる。めくって本文の
  // ページが出てくるのを待つ(段落3つ・200語 — main.js の本文検出の下限 SESSION に合わせる。
  // 語はラテン文字なら単語、日本語なら文字で数える)。
  const PARAGRAPHS = 'reader-rendered-page .main_text > div';
  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g;
  const countWords = (t) => (t.match(/[A-Za-z0-9]+/g)?.length ?? 0) + (t.match(CJK)?.length ?? 0);
  const enoughText = () => {
    let n = 0;
    let words = 0;
    for (const p of document.querySelectorAll(PARAGRAPHS)) {
      const w = countWords(p.textContent ?? '');
      if (w === 0) continue;
      n += 1;
      words += w;
      if (n >= 3 && words >= 200) return true;
    }
    return false;
  };
  if (enoughText()) {
    load('src/content/main.js');
    return;
  }

  let timer = 0;
  const observer = new MutationObserver(() => {
    if (!timer) timer = setTimeout(check, 400);
  });
  const onMessage = (msg) => {
    if (msg?.type === 'rs_stop') giveUp();
  };
  function check() {
    timer = 0;
    if (!chrome.runtime?.id) {
      giveUp(); // 拡張が更新・再読み込みされた
      return;
    }
    if (!enoughText()) return;
    done();
    load('src/content/main.js');
  }
  function done() {
    observer.disconnect();
    clearTimeout(timer);
    removeEventListener('pagehide', giveUp);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      /* 拡張のコンテキストが消えている */
    }
  }
  // セッションが本文の前に終わった: 何も入れずに畳み、次の開始で入れ直せるようにする
  function giveUp() {
    done();
    window.__readingScaffoldLoaded = false;
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
  chrome.runtime.onMessage.addListener(onMessage);
  addEventListener('pagehide', giveUp, { once: true });
})();
