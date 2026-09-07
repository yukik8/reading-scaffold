// chrome.scripting.executeScriptはESモジュールを直接注入できないため、
// このローダーだけをclassic scriptとして注入し、本体をモジュールとして読み込む。
// 二重注入(同じタブで開始を2回押す等)はここで止める。
(() => {
  // 二重注入の判定はバージョンで行う。単なる真偽値だと、拡張をリロードしても
  // 開いたままのタブに残った「幽霊」古スクリプトのフラグが残り、新コードが
  // 注入されない(タブ再読込を強いられる)。バージョンが変われば必ず入れ直す。
  const version = chrome.runtime.getManifest().version;
  if (window.__readingScaffoldLoaded === version) return; // 同一版の二重注入だけ止める
  window.__readingScaffoldLoaded = version;
  // クエリでモジュールキャッシュを割る: 同じページで2回目のセッションを始めたとき、
  // キャッシュ済みモジュールだとトップレベルが再実行されず計測が始まらない。
  import(chrome.runtime.getURL('src/content/main.js') + '?t=' + Date.now());
})();
