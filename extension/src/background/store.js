// IndexedDB。生イベントはここにしか置かない。
//
// 3層構造(docs/data-design.md):
//   計測層: events(append-only) / sessions(集計キャッシュ)
//   制御層: state(単一レコード・連続θ)
//   記録層: pages / quizzes / quiz_attempts(読書メモリ=本人の資産。ローカルのみ)

import { THETA_MAX } from '../shared/config.js';

const DB_NAME = 'reading-scaffold';
const DB_VERSION = 2;

let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1: 計測層+制御層
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
      // v2: 記録層(読書メモリ)
      if (!db.objectStoreNames.contains('pages')) {
        const pages = db.createObjectStore('pages', { keyPath: 'page_id' });
        pages.createIndex('by_last_read', 'last_read_at');
      }
      if (!db.objectStoreNames.contains('quizzes')) {
        const quizzes = db.createObjectStore('quizzes', { keyPath: 'quiz_id', autoIncrement: true });
        quizzes.createIndex('by_page', 'page_id');
        quizzes.createIndex('by_hash', 'paragraph_hash');
      }
      if (!db.objectStoreNames.contains('quiz_attempts')) {
        const attempts = db.createObjectStore('quiz_attempts', {
          keyPath: 'attempt_id',
          autoIncrement: true,
        });
        attempts.createIndex('by_quiz', 'quiz_id');
        attempts.createIndex('by_page', 'page_id');
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

function runIndex(storeName, indexName, key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, 'readonly');
        const req = t.objectStore(storeName).index(indexName).get(key);
        t.oncomplete = () => resolve(req.result ?? null);
        t.onerror = () => reject(t.error);
      }),
  );
}

/** SHA-256の16進文字列。page_id・段落ハッシュに使う。 */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- 計測層 ---------------------------------------------------------------

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

// ---- 制御層 ---------------------------------------------------------------

const STATE_KEY = 'singleton';

const DEFAULT_STATE = {
  key: STATE_KEY,
  theta: THETA_MAX, // 連続値[0, THETA_MAX]。Levelは廃止(2026-08-16)
  success_streak: 0,
  fail_streak: 0,
  day: null, // 1日の総変化上限の判定用
  day_start_theta: null,
  diag_answers: null,
  updated_at: null,
};

/** state(単一レコード)。無ければ初期値を返す。 */
export function getState() {
  return run('state', 'readonly', (s) => s.get(STATE_KEY)).then((row) => {
    if (!row) return { ...DEFAULT_STATE };
    // v1(Level制)からの移行: thetaはそのまま生かし、levelは無視する
    return { ...DEFAULT_STATE, ...row };
  });
}

export function putState(state) {
  return run('state', 'readwrite', (s) => s.put({ ...state, key: STATE_KEY, updated_at: Date.now() }));
}

// ---- 記録層(読書メモリ) -------------------------------------------------

export function getPage(pageId) {
  return run('pages', 'readonly', (s) => s.get(pageId)).then((row) => row ?? null);
}

export function putPage(page) {
  return run('pages', 'readwrite', (s) => s.put(page));
}

/** クイズを保存してquiz_idを返す。 */
export function addQuiz(quiz) {
  return run('quizzes', 'readwrite', (s) => s.add(quiz));
}

/** 同じ段落から生成済みのクイズがあれば返す(サーバキャッシュと対になる重複防止)。 */
export function getQuizByHash(paragraphHash) {
  return runIndex('quizzes', 'by_hash', paragraphHash);
}

export function addQuizAttempt(attempt) {
  return run('quiz_attempts', 'readwrite', (s) => s.add(attempt));
}

export function getAllPages() {
  return run('pages', 'readonly', (s) => s.getAll()).then((rows) => rows ?? []);
}

export function getAllQuizAttempts() {
  return run('quiz_attempts', 'readonly', (s) => s.getAll()).then((rows) => rows ?? []);
}

// ---- 削除 -----------------------------------------------------------------

/** データ削除。設定から1タップで呼ぶ。記録層(資産)も含めて全消去する。 */
export async function wipeAll() {
  for (const store of ['events', 'sessions', 'state', 'pages', 'quizzes', 'quiz_attempts']) {
    await run(store, 'readwrite', (s) => s.clear());
  }
  await chrome.storage.session.clear();
  await chrome.storage.local.clear();
}
