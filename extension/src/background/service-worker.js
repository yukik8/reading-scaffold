// MV3 Service Worker。
// リスナー登録はすべてこのファイルのトップレベルで同期的に行う(MV3の再起動要件)。
// tabs系のハンドラはsession.jsの中で必ずセッションの存在を確認し、
// セッションが無いときは何も読まず何も書かずに戻る — 「計測はセッション中のみ」。

import { Msg } from '../shared/events.js';
import {
  startSession,
  endSession,
  getCurrent,
  onReport,
  onTabActivated,
  onWindowFocusChanged,
  onTabRemoved,
  onTabUpdated,
  onWatchdog,
  setLevel,
  WATCHDOG_ALARM,
} from './session.js';
import { buildMirror } from './mirror.js';
import { wipeAll, getState } from './store.js';

chrome.tabs.onActivated.addListener((activeInfo) => {
  onTabActivated(activeInfo);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  onWindowFocusChanged(windowId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  onTabRemoved(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  onTabUpdated(tabId, changeInfo);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) onWatchdog();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case Msg.START_SESSION: {
        const session = await startSession(msg.tabId ?? sender.tab?.id);
        sendResponse({ ok: true, session });
        break;
      }
      case Msg.END_SESSION: {
        const ended = await endSession(msg.reason);
        sendResponse({ ok: true, session: ended });
        break;
      }
      case Msg.REPORT:
        await onReport(msg.event, msg.payload ?? {}, sender);
        sendResponse({ ok: true });
        break;

      case Msg.GET_STATUS:
        sendResponse({ ok: true, session: await getCurrent(), state: await getState() });
        break;

      case Msg.SET_LEVEL:
        sendResponse({ ok: true, ...(await setLevel(msg.level)) });
        break;

      case Msg.GET_MIRROR:
        sendResponse({ ok: true, mirror: await buildMirror() });
        break;

      case Msg.WIPE_ALL:
        await endSession('manual');
        await wipeAll();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })().catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true; // 非同期応答
});
