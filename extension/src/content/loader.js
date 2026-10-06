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
  const playBooks =
    (location.hostname === 'play.google.com' && location.pathname.startsWith('/books/reader')) ||
    location.hostname === 'books.googleusercontent.com';
  const entries = playBooks ? ['src/content/playbooks-pager.js'] : [];
  if (!playBooks || document.querySelector('reader-rendered-page .main_text')) {
    entries.push('src/content/main.js');
  }
  window.__readingScaffoldLoaded = version;
  // クエリでモジュールキャッシュを割る: 同じページで2回目のセッションを始めたとき、
  // キャッシュ済みモジュールだとトップレベルが再実行されず計測が始まらない。
  const bust = '?t=' + Date.now();
  for (const entry of entries) import(chrome.runtime.getURL(entry) + bust);
})();
