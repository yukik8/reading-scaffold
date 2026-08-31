// 評価レイヤー: 週次目標の達成率 × θの推移。
//
// KPIの論理(docs/research/benchmark.md §5): 成功セッションは補助があっても増えるため
// 単独では証拠にならないが、「達成率を保ったままθが下がり続ける」ことは補助への
// 非依存の証拠になる。だから達成率とθは必ず対で見る。
//
// 線引き:
//   - 制御器はこのファイルを読まない。目標・達成率を制御に入れない(不変条件)
//   - 制御用のsuccess定義(SUCCESS)は固定。段階で厳しくなるのは評価用の目標だけ
//   - 表示はダッシュボードのみ。popupのMirrorには出さない(責めない原則)

import { GOALS, DEFAULT_GOAL, MIRROR } from '../shared/config.js';
import { recentWeeks, weekKey } from '../shared/time.js';
import { getAllSessions, getAllQuizAttempts, getState } from './store.js';

/** 最長連続読書(ms)。旧データにフィールドが無ければ「離脱で等分」で近似する。 */
function streakMsOf(s) {
  if (typeof s.longest_streak_ms === 'number') return s.longest_streak_ms;
  return (s.read_ms ?? 0) / ((s.escapes ?? 0) + 1);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 週の実績から、選択中の目標に対する達成率[0,1]。構成要素の最小値(全部満たして1)。 */
function achievementOf(goal, week) {
  const parts = [];
  if (goal.sessions) parts.push(week.success_count / goal.sessions);
  if (goal.streakMin) parts.push(week.streak_median_min / goal.streakMin);
  if (goal.unassistedMin) parts.push(week.unassisted_min / goal.unassistedMin);
  if (parts.length === 0) return 0;
  return Math.min(1, ...parts);
}

/**
 * @returns {Promise<{
 *   goalKey: string,
 *   goal: { name: string, desc: string },
 *   weeks: Array<{
 *     label: string, success_count: number, read_min: number, unassisted_min: number,
 *     streak_median_min: number, theta_avg: number|null, achievement: number, sessions: number,
 *   }>,
 *   quiz: { week: { total: number, correct: number }, all: { total: number, correct: number } },
 * }>}
 */
export async function buildKpi(now = Date.now()) {
  const [sessions, attempts, state] = await Promise.all([
    getAllSessions(),
    getAllQuizAttempts(),
    getState(),
  ]);
  const goalKey = state.goal && GOALS[state.goal] ? state.goal : DEFAULT_GOAL;
  const goal = GOALS[goalKey];

  const weeks = recentWeeks(MIRROR.weeks, now);
  const byWeek = new Map(
    weeks.map((w) => [w.key, { sessions: [], theta_sum: 0, theta_n: 0 }]),
  );
  for (const s of sessions) {
    const bucket = byWeek.get(weekKey(s.started_at));
    if (!bucket) continue;
    bucket.sessions.push(s);
    const t = s.theta_base ?? s.theta;
    if (typeof t === 'number') {
      bucket.theta_sum += t;
      bucket.theta_n += 1;
    }
  }

  const rows = weeks.map((w) => {
    const b = byWeek.get(w.key);
    const list = b.sessions;
    const week = {
      label: w.label,
      sessions: list.length,
      success_count: list.filter((s) => s.success).length,
      read_min: Math.round(list.reduce((a, s) => a + (s.read_ms ?? 0), 0) / 60_000),
      unassisted_min: Math.round(
        list
          .filter((s) => (s.hints_shown ?? 0) === 0 && (s.effects_shown ?? 0) === 0)
          .reduce((a, s) => a + (s.read_ms ?? 0), 0) / 60_000,
      ),
      streak_median_min: Math.round(median(list.map(streakMsOf)) / 60_000),
      theta_avg: b.theta_n > 0 ? b.theta_sum / b.theta_n : null,
    };
    week.achievement = achievementOf(goal, week);
    return week;
  });

  // クイズ正答率(理解のガードレール): 今週と全期間を並べて非劣化を確かめる
  const thisWeekKey = weeks[weeks.length - 1].key;
  const quizWeek = attempts.filter((a) => weekKey(a.answered_at) === thisWeekKey);
  const quiz = {
    week: { total: quizWeek.length, correct: quizWeek.filter((a) => a.correct).length },
    all: { total: attempts.length, correct: attempts.filter((a) => a.correct).length },
  };

  return { goalKey, goal: { name: goal.name, desc: goal.desc }, weeks: rows, quiz };
}
