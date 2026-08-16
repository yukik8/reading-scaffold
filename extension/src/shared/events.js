// IndexedDBのeventsストアに入るイベント型。append-onlyで、消すのは全消去のときだけ。
//
// payloadの中身(設計ドキュメント §4):
//   SESSION_START  { url_domain, article_len_words, level, theta }
//   DWELL_TICK     { visible_paragraph_range }
//   SCROLL         { depth_pct }
//   TAB_ESCAPE     { to_domain }            // ドメインのみ。URL全体とタイトルは保存しない
//   TAB_RETURN     { away_ms }
//   HINT_SHOWN     { hint_id, kind }        // kind: canned | llm
//   HINT_CLICKED   { hint_id }
//   EFFECT_SHOWN   { effect_id }
//   SESSION_END    { reason, read_ms, completion_pct }
export const EventType = {
  SESSION_START: 'session_start',
  DWELL_TICK: 'dwell_tick',
  SCROLL: 'scroll',
  TAB_ESCAPE: 'tab_escape',
  TAB_RETURN: 'tab_return',
  HINT_SHOWN: 'hint_shown',
  HINT_CLICKED: 'hint_clicked',
  EFFECT_SHOWN: 'effect_shown',
  QUIZ_ANSWERED: 'quiz_answered', // { correct }
  SESSION_END: 'session_end',
  THETA_UPDATE: 'theta_update', // { from, to, reason } 制御器の動き(本人には通知しない・分析用)
};

export const SessionState = {
  IDLE: 'idle',
  ACTIVE: 'active',
  ESCAPED: 'escaped',
  ENDED: 'ended',
};

export const EndReason = {
  MANUAL: 'manual',
  CLOSE: 'close',
  IDLE: 'idle',
};

// content script ⇄ service worker のメッセージ種別。
export const Msg = {
  START_SESSION: 'start_session',
  END_SESSION: 'end_session',
  REPORT: 'report', // content scriptからの計測報告(EventTypeを載せる)
  GET_STATUS: 'get_status',
  GET_MIRROR: 'get_mirror',
  GET_LIBRARY: 'get_library', // 記録層の一覧(読んだもの+クイズ正答)
  SET_THETA: 'set_theta', // θ手動ダイヤル(連続値。ドッグフーディング用、W3で自動化)
  QUIZ_REQUEST: 'quiz_request', // content→SW: 段落テキストからクイズ生成(SWがサーバへfetch)
  WIPE_ALL: 'wipe_all',
};
