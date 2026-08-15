// セッション状態機械。
//
//   IDLE   --[読むボタン押下]--> ACTIVE
//   ACTIVE --[タブ切替/ウィンドウ非フォーカス]--> ESCAPED
//   ESCAPED--[復帰]--> ACTIVE
//   ACTIVE --[終了ボタン / タブclose]--> ENDED
//   ACTIVE --[無操作 3分]--> ENDED(auto)
//   ESCAPED--[復帰なし 3分]--> ENDED(auto)
//
// 離脱はセッションを終わらせない。離脱→復帰のパターンが制御器の主要シグナルであるため。

import { SessionState } from '../shared/events.js';

/**
 * 「計測はセッション中のみ」をここで構造的に保証する。
 * tabs系のリスナーは start() で登録し、end() で必ず解除する。
 * グローバルにリスナーを張らない — このファイルが唯一の登録箇所。
 */
let current = null; // { session_id, tab_id, state, started_at, read_ms, escapes, listeners }

export function getCurrent() {
  return current;
}

/** ユーザージェスチャー起点でのみ呼ばれる。activeTab権限の発動条件を兼ねる。 */
export async function startSession(tabId) {
  // TODO(W1):
  //   1. session_id採番、state = ACTIVE
  //   2. chrome.scripting.executeScript で content script を注入
  //   3. registerListeners() — tabs.onActivated / windows.onFocusChanged / tabs.onRemoved
  //   4. SESSION_START を追記(url_domainのみ。URL全体は保存しない)
  void tabId;
}

export async function endSession(reason) {
  // TODO(W1):
  //   1. unregisterListeners() — 例外が出ても必ず通す
  //   2. read_ms / escapes / completion_pct を確定して SESSION_END を追記
  //   3. sessions を書き、制御器の onSessionEnd を呼ぶ
  //   4. current = null
  void reason;
}

function registerListeners() {
  // TODO(W1): 離脱→ESCAPED、復帰→ACTIVE。離脱先はドメイン文字列のみ記録する。
}

function unregisterListeners() {
  // TODO(W1): 登録したものを1つ残らず removeListener する。
}

export { SessionState };
