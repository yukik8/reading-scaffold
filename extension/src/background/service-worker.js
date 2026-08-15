// MV3 Service Worker。セッション状態機械・制御器・イベントログの入口。
// ここでは常時リスナーを張らない(runtime.onMessage を除く)。
// tabs系の観測はセッション中だけ session.js が登録・解除する。

import { Msg } from '../shared/events.js';
import { startSession, endSession, getCurrent } from './session.js';
import { wipeAll } from './store.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case Msg.START_SESSION:
        await startSession(msg.tabId ?? sender.tab?.id);
        sendResponse({ ok: true });
        break;

      case Msg.END_SESSION:
        await endSession(msg.reason);
        sendResponse({ ok: true });
        break;

      case Msg.REPORT:
        // TODO(W1): content scriptからの dwell_tick / scroll を events に追記する
        sendResponse({ ok: true });
        break;

      case Msg.GET_STATUS:
        sendResponse({ ok: true, session: getCurrent() });
        break;

      case Msg.GET_MIRROR:
        // TODO(W1): 週次の補助なし読書時間・セッション数・離脱率を返す
        sendResponse({ ok: true, mirror: null });
        break;

      case Msg.WIPE_ALL:
        await wipeAll();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // 非同期応答
});
