// IndexedDB。生イベントはここにしか置かない。
// W1: events / sessions / state の3ストアを作り、append と全消去を通す。

const DB_NAME = 'reading-scaffold';
const DB_VERSION = 1;

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) {
        const events = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        events.createIndex('by_session', 'session_id');
        events.createIndex('by_t', 't');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'session_id' });
        sessions.createIndex('by_date', 'date');
      }
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** イベントを1件追記する。append-only。 */
export async function appendEvent(sessionId, type, payload, t) {
  // TODO(W1): openDb → transaction('events', 'readwrite') → add({ session_id, t, type, payload })
  void sessionId; void type; void payload; void t;
}

/** セッションの集計キャッシュを書く。 */
export async function putSession(session) {
  // TODO(W1): { session_id, date, domain, level, theta, read_ms, escapes, completion_pct, success }
  void session;
}

/** state(単一レコード)の読み書き。 */
export async function getState() {
  // TODO(W1): { level, theta, success_streak, fail_streak, diag_answers, updated_at }
}

export async function putState(state) {
  void state;
}

/** データ削除。設定から1タップで呼ぶ。サーバ送信の停止もここで立てる。 */
export async function wipeAll() {
  // TODO(W1): 全ストアclear + 送信フラグをoffに
}
