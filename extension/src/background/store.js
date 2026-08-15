// IndexedDB。生イベントはここにしか置かない。
// events(append-only) / sessions(集計キャッシュ) / state(単一レコード) の3ストア。

import { THETA_BY_LEVEL } from '../shared/config.js';

const DB_NAME = 'reading-scaffold';
const DB_VERSION = 1;

let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
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
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** イベントを1件追記する。append-only。 */
export function appendEvent(sessionId, type, payload, t = Date.now()) {
  return run('events', 'readwrite', (s) => s.add({ session_id: sessionId, t, type, payload }));
}

/** セッションの集計キャッシュを書く。 */
export function putSession(session) {
  return run('sessions', 'readwrite', (s) => s.put(session));
}

export function getAllSessions() {
  return run('sessions', 'readonly', (s) => s.getAll()).then((rows) => rows ?? []);
}

const STATE_KEY = 'singleton';

const DEFAULT_STATE = {
  key: STATE_KEY,
  level: 0,
  theta: THETA_BY_LEVEL[0],
  success_streak: 0,
  fail_streak: 0,
  last_level_change_date: null,
  diag_answers: null,
  updated_at: null,
};

/** state(単一レコード)。無ければ初期値を返す。 */
export function getState() {
  return run('state', 'readonly', (s) => s.get(STATE_KEY)).then((row) => row ?? { ...DEFAULT_STATE });
}

export function putState(state) {
  return run('state', 'readwrite', (s) => s.put({ ...state, key: STATE_KEY, updated_at: Date.now() }));
}

/** データ削除。設定から1タップで呼ぶ。 */
export async function wipeAll() {
  await run('events', 'readwrite', (s) => s.clear());
  await run('sessions', 'readwrite', (s) => s.clear());
  await run('state', 'readwrite', (s) => s.clear());
  await chrome.storage.session.clear();
  await chrome.storage.local.clear();
}
