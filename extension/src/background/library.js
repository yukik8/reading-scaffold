// ライブラリ(読書メモリの一覧)。記録層だけを読む。
// これは「記録」カテゴリの表示: 事実の蓄積のみで、可変報酬・比較・警告は載せない。

import { getAllPages, getAllQuizAttempts, getAllQuizzes, getAllSessions } from './store.js';

/**
 * @returns {Promise<Array<{
 *   page_id, url, title, domain, last_read_at, read_count,
 *   total_read_min, best_completion_pct,
 *   quiz: { total: number, correct: number },
 * }>>}
 */
export async function buildLibrary(limit = 30) {
  const [pages, attempts] = await Promise.all([getAllPages(), getAllQuizAttempts()]);

  const quizByPage = new Map();
  for (const a of attempts) {
    if (!a.page_id) continue;
    const q = quizByPage.get(a.page_id) ?? { total: 0, correct: 0 };
    q.total += 1;
    if (a.correct) q.correct += 1;
    quizByPage.set(a.page_id, q);
  }

  return pages
    .sort((a, b) => (b.last_read_at ?? 0) - (a.last_read_at ?? 0))
    .slice(0, limit)
    .map((p) => ({
      page_id: p.page_id,
      url: p.url,
      title: p.title,
      domain: p.domain,
      last_read_at: p.last_read_at,
      read_count: p.read_count ?? 0,
      total_read_min: Math.round((p.total_read_ms ?? 0) / 60_000),
      best_completion_pct: p.best_completion_pct ?? 0,
      quiz: quizByPage.get(p.page_id) ?? { total: 0, correct: 0 },
    }));
}

/** クイズ履歴(ダッシュボード用)。問題+回答の時系列+出題元ページ名。 */
export async function buildQuizLog() {
  const [quizzes, attempts, pages] = await Promise.all([
    getAllQuizzes(),
    getAllQuizAttempts(),
    getAllPages(),
  ]);
  const titleByPage = new Map(pages.map((p) => [p.page_id, p.title || p.domain]));
  const byQuiz = new Map();
  for (const a of attempts) {
    const list = byQuiz.get(a.quiz_id) ?? [];
    list.push(a);
    byQuiz.set(a.quiz_id, list);
  }
  return quizzes
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .map((q) => ({
      quiz_id: q.quiz_id,
      question: q.question,
      choices: q.choices,
      answer_index: q.answer_index,
      page_title: titleByPage.get(q.page_id) ?? null,
      created_at: q.created_at,
      attempts: (byQuiz.get(q.quiz_id) ?? [])
        .sort((a, b) => (a.answered_at ?? 0) - (b.answered_at ?? 0))
        .map((a) => ({ correct: a.correct, answered_at: a.answered_at })),
    }));
}

/**
 * θの推移(日次平均・古い順)。自立の推移グラフの素材。
 * theta_base(制御器の基準値)を使う — 実効θのノイズを均して傾向だけを見る。
 */
export async function buildThetaHistory() {
  const sessions = await getAllSessions();
  const byDay = new Map();
  for (const s of sessions) {
    const t = s.theta_base ?? s.theta;
    if (typeof t !== 'number' || !s.started_at) continue;
    const d = new Date(s.started_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const b = byDay.get(key) ?? { sum: 0, n: 0, t: s.started_at };
    b.sum += t;
    b.n += 1;
    if (s.started_at < b.t) b.t = s.started_at;
    byDay.set(key, b);
  }
  return [...byDay.values()]
    .sort((a, b) => a.t - b.t)
    .map((b) => ({ t: b.t, theta: b.sum / b.n }));
}

/** 累計(ダッシュボード用)。 */
export async function buildTotals() {
  const [sessions, attempts, pages] = await Promise.all([
    getAllSessions(),
    getAllQuizAttempts(),
    getAllPages(),
  ]);
  let readMs = 0;
  let unassistedMs = 0;
  for (const s of sessions) {
    readMs += s.read_ms ?? 0;
    if ((s.hints_shown ?? 0) === 0 && (s.effects_shown ?? 0) === 0) unassistedMs += s.read_ms ?? 0;
  }
  return {
    sessions: sessions.length,
    pages: pages.length,
    read_min: Math.round(readMs / 60_000),
    unassisted_min: Math.round(unassistedMs / 60_000),
    quiz_total: attempts.length,
    quiz_correct: attempts.filter((a) => a.correct).length,
  };
}
