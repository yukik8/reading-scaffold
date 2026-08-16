// ライブラリ(読書メモリの一覧)。記録層だけを読む。
// これは「記録」カテゴリの表示: 事実の蓄積のみで、可変報酬・比較・警告は載せない。

import { getAllPages, getAllQuizAttempts } from './store.js';

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
