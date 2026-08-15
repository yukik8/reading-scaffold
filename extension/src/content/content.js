// セッション中だけ注入されるcontent script。
//
// このファイルの制約:
//   - ページDOMを変更しない。追加してよいのは Shadow DOM に閉じたオーバーレイ要素だけ。
//   - 本文は読み取りのみ(Readability相当の抽出)。再構成・広告除去はしない。
//   - 本文テキストをservice workerへ送るのは、v0後半のLLMヒント経路だけに限る。

import { Msg, EventType } from '../shared/events.js';
import { SESSION } from '../shared/config.js';

let lastInteractionAt = 0;
let dwellTimer = null;

function report(type, payload) {
  chrome.runtime.sendMessage({ type: Msg.REPORT, event: type, payload });
}

function markInteraction() {
  lastInteractionAt = Date.now();
}

// 読書時間の操作的定義:
// 本文段落がIntersectionObserverで可視、かつ直近30秒以内にスクロールまたは操作がある時間。
function isReading(visibleParagraphs) {
  return visibleParagraphs > 0 && Date.now() - lastInteractionAt <= SESSION.activityWindowMs;
}

function start() {
  // TODO(W1):
  //   1. 本文抽出(失敗したら「このページでは補助なしで計測のみ」と表示して継続)
  //   2. 段落にIntersectionObserverを張り、可視段落レンジを保持
  //   3. scroll / keydown / click で markInteraction()、depth_pct を間引いて report(SCROLL)
  //   4. dwellTimer で30秒ごとに isReading() を判定し report(DWELL_TICK)
  addEventListener('scroll', markInteraction, { passive: true });
  addEventListener('keydown', markInteraction, { passive: true });
  addEventListener('click', markInteraction, { passive: true });
  markInteraction();

  dwellTimer = setInterval(() => {
    const visibleParagraphs = 0; // TODO(W1)
    if (isReading(visibleParagraphs)) report(EventType.DWELL_TICK, { visible_paragraph_range: null });
  }, SESSION.dwellTickMs);
}

function stop() {
  removeEventListener('scroll', markInteraction);
  removeEventListener('keydown', markInteraction);
  removeEventListener('click', markInteraction);
  if (dwellTimer) clearInterval(dwellTimer);
  dwellTimer = null;
  // TODO(W2): オーバーレイのShadow rootを撤去する
}

start();
addEventListener('pagehide', stop, { once: true });
