// タペリング制御器 v0(連続θ版・2026-08-16改訂)。全部素朴な式で、機械学習はしない。
//
// Level 5段階は廃止した。段差(8→5は37%減)は本人が気づき得るため、
// Weber-Fechnerの法則(気づける最小変化=現在量の約10〜20%)に基づき、
// JND未満の乗算的漸減 θ←θ×(1−α) にする。
//
// 不変条件(このファイルの外から壊せないようにする):
//   1. θの目標値は常に0。エンゲージメント指標もクイズ正誤も入力にしない。
//   2. 1日の総変化は±maxDailyChangeRatioまで。
//   3. 卒業(θ=0)後は監視のみ。再展開はホメオスタットだけが行う。

import { THETA_MAX, CONTROLLER, SUCCESS, THETA_NOISE, STABILITY } from '../shared/config.js';

export function isSuccess(session) {
  return session.read_ms >= SUCCESS.minReadMs && session.escapes <= SUCCESS.maxEscapes;
}

/**
 * 読書安定度 S ∈ [0,1]。行動シグナルだけから計算する(理解・エンゲージメント指標は入れない)。
 * v0.14 は並走計測のみで、nextState はまだ isSuccess を使う。
 * @param {object} session - { read_ms, escapes, away_total_ms, quick_returns, completion_pct }
 * @param {string} reason - 終了理由 manual | close | idle
 */
export function stabilityScore(session, reason) {
  const w = STABILITY.weights;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const escapes = session.escapes ?? 0;

  const dur = clamp01((session.read_ms ?? 0) / 60_000 / STABILITY.durFullMin);
  const escapeTerm =
    clamp01(1 - escapes / STABILITY.escapeFullCount) *
    clamp01(1 - (session.away_total_ms ?? 0) / STABILITY.awayFullMs);
  const returnTerm = escapes > 0 ? clamp01((session.quick_returns ?? 0) / escapes) : 1;
  const completion = clamp01((session.completion_pct ?? 0) / 100);
  const ending = STABILITY.ending[reason] ?? STABILITY.ending.idle;

  const s =
    w.dur * dur +
    w.escape * escapeTerm +
    w.return * returnTerm +
    w.completion * completion +
    w.ending * ending;
  return Math.round(clamp01(s) * 1000) / 1000;
}

/**
 * セッション開始時の実効θ。基準θに±THETA_NOISEの揺らぎを乗せる。
 * 日々の揺らぎが漸減トレンドを隠す(迷彩)。手動設定直後もこの揺らぎは掛かる。
 */
export function effectiveTheta(base) {
  if (base <= 0) return 0;
  const jitter = 1 + (Math.random() * 2 - 1) * THETA_NOISE;
  return Math.min(THETA_MAX, base * jitter);
}

/**
 * セッション終了ごとに1回だけ呼ぶ(W3でCONTROLLER.enabled時に配線)。
 * 昇降は本人に通知しない(気づかれない速度で減らすため)。
 * @param {object} state - { theta, success_streak, fail_streak, day, day_start_theta, ... }
 * @param {object} session - 終了したセッション(read_ms, escapes)
 * @param {string} today - dateKey(例 '2026-08-16')。1日上限の判定に使う
 */
export function nextState(state, session, today) {
  let {
    theta,
    success_streak = 0,
    fail_streak = 0,
    day = null,
    day_start_theta = null,
  } = state;

  if (day !== today || day_start_theta === null) {
    day = today;
    day_start_theta = theta;
  }

  const success = isSuccess(session);
  if (success) {
    success_streak += 1;
    fail_streak = 0;
  } else {
    fail_streak += 1;
    success_streak = 0;
  }

  if (theta > 0) {
    if (success) {
      theta *= 1 - CONTROLLER.alpha;
    } else if (fail_streak >= CONTROLLER.failStreakToRaise) {
      theta = Math.min(THETA_MAX, theta * (1 + CONTROLLER.beta));
      fail_streak = 0;
    }
    // 不変条件: 1日の総変化は±maxDailyChangeRatioまで
    const lo = day_start_theta * (1 - CONTROLLER.maxDailyChangeRatio);
    const hi = Math.min(THETA_MAX, day_start_theta * (1 + CONTROLLER.maxDailyChangeRatio));
    theta = Math.min(hi, Math.max(lo, theta));
    // 乗算は0に到達しないため、十分小さくなったら卒業
    if (theta < CONTROLLER.graduateBelow) theta = 0;
  }

  return { ...state, theta, success_streak, fail_streak, day, day_start_theta };
}

/**
 * ホメオスタットモード(卒業後の見守り)。
 * state.homeostat = { baseline, active, graduated_at } は卒業の瞬間に記録される。
 * - 非展開中: 補助なし読書時間の週平均がベースライン×dropRatioを切ったら再展開
 * - 展開中: ベースライン×recoverRatioまで戻ったら再び0へ
 * 展開中の漸減は行わない(回復の判定は読書量だけで行う)。
 */
export function applyHomeostat(state, weeklyUnassistedMin) {
  const h = state.homeostat;
  if (!h?.baseline || h.baseline <= 0) return state; // 卒業前・記録なしは対象外
  if (!h.active && state.theta === 0) {
    if (weeklyUnassistedMin < h.baseline * CONTROLLER.homeostatDropRatio) {
      return {
        ...state,
        theta: CONTROLLER.homeostatRedeployTheta,
        homeostat: { ...h, active: true },
      };
    }
    return state;
  }
  if (h.active && weeklyUnassistedMin >= h.baseline * CONTROLLER.homeostatRecoverRatio) {
    return { ...state, theta: 0, homeostat: { ...h, active: false } };
  }
  return state;
}
