// chrome.scripting.executeScriptはESモジュールを直接注入できないため、
// このローダーだけをclassic scriptとして注入し、本体をモジュールとして読み込む。
// 二重注入(同じタブで開始を2回押す等)はここで止める。
(() => {
  if (window.__readingScaffoldLoaded) return;
  window.__readingScaffoldLoaded = true;
  // クエリでモジュールキャッシュを割る: 同じページで2回目のセッションを始めたとき、
  // キャッシュ済みモジュールだとトップレベルが再実行されず計測が始まらない。
  // main.jsから静的に読む先(shared/overlay/hints)は状態を持たないのでキャッシュのままでよい。
  import(chrome.runtime.getURL('src/content/main.js') + '?t=' + Date.now());
})();
