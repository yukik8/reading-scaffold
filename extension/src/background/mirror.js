// Mirror用の集計。sessionsストアだけを読む(生イベントには触らない)。

import { MIRROR } from '../shared/config.js';
import { recentWeeks, weekKey } from '../shared/time.js';
import { getAllSessions } from './store.js';

/**
 * @returns {Promise<{
 *   weeks: { label: string, unassisted_min: number, assisted_min: number }[],
 *   this_week: { sessions: number, escape_rate: number|null, read_min: number },
 *   total_sessions: number,
 * }>}
 */
export async function buildMirror(now = Date.now()) {
  const sessions = await getAllSessions();
  const weeks = recentWeeks(MIRROR.weeks, now);
  const byWeek = new Map(weeks.map((w) => [w.key, { label: w.label, unassisted_ms: 0, assisted_ms: 0 }]));

  for (const s of sessions) {
    const bucket = byWeek.get(weekKey(s.started_at));
    if (!bucket) continue; // 表示範囲より古い
    // 補助なし = ヒントも演出も1回も出なかったセッション(W1では全部これ)。
    const unassisted = MIRROR.unassistedRequiresZeroHints
      ? (s.hints_shown ?? 0) === 0 && (s.effects_shown ?? 0) === 0
      : false;
    if (unassisted) bucket.unassisted_ms += s.read_ms;
    else bucket.assisted_ms += s.read_ms;
  }

  const thisWeekKey = weeks[weeks.length - 1].key;
  const thisWeekSessions = sessions.filter((s) => weekKey(s.started_at) === thisWeekKey);
  const escaped = thisWeekSessions.filter((s) => s.escapes > 0).length;

  return {
    weeks: weeks.map((w) => {
      const b = byWeek.get(w.key);
      return {
        label: w.label,
        unassisted_min: Math.round(b.unassisted_ms / 60_000),
        assisted_min: Math.round(b.assisted_ms / 60_000),
      };
    }),
    this_week: {
      sessions: thisWeekSessions.length,
      escape_rate: thisWeekSessions.length ? escaped / thisWeekSessions.length : null,
      read_min: Math.round(thisWeekSessions.reduce((a, s) => a + s.read_ms, 0) / 60_000),
    },
    total_sessions: sessions.length,
  };
}
