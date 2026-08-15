// chrome.scripting.executeScriptはESモジュールを直接注入できないため、
// このローダーだけをclassic scriptとして注入し、本体をモジュールとして読み込む。
// 二重注入(同じタブで開始を2回押す等)はここで止める。
(() => {
  if (window.__readingScaffoldLoaded) return;
  window.__readingScaffoldLoaded = true;
  import(chrome.runtime.getURL('src/content/main.js'));
})();
