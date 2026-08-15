// タペリング制御器 v0。全部if文で、機械学習はしない。
//
// 不変条件(このファイルの外から壊せないようにする):
//   1. θの目標値は常に0。エンゲージメント指標(滞在時間・表示回数など)を入力にしない。
//   2. 1日に動かせるのは1段まで。
//   3. Level 5到達後は監視のみ。補助なし読書時間が落ちたときだけ一時的に再展開する。

import { THETA_BY_LEVEL, MAX_LEVEL, CONTROLLER, SUCCESS } from '../shared/config.js';

export function thetaFor(level) {
  return THETA_BY_LEVEL[Math.min(Math.max(level, 0), MAX_LEVEL)];
}

export function isSuccess(session) {
  return session.read_ms >= SUCCESS.minReadMs && session.escapes <= SUCCESS.maxEscapes;
}

/**
 * セッション終了ごとに1回だけ呼ぶ。
 * 昇降は本人に通知しない(気づかれない速度で減らすため)。
 * @returns {{ level: number, success_streak: number, fail_streak: number }}
 */
export function nextState(state, session, today) {
  let { level, success_streak, fail_streak, last_level_change_date } = state;

  if (isSuccess(session)) {
    success_streak += 1;
    fail_streak = 0;
  } else {
    fail_streak += 1;
    success_streak = 0;
  }

  const movedToday = last_level_change_date === today;
  if (!movedToday) {
    if (success_streak >= CONTROLLER.successStreakToPromote && level < MAX_LEVEL) {
      level += 1; // θを下げる
      success_streak = 0;
      last_level_change_date = today;
    } else if (fail_streak >= CONTROLLER.failStreakToDemote && level > 0) {
      level -= 1; // θを上げる
      fail_streak = 0;
      last_level_change_date = today;
    }
  }

  return { level, success_streak, fail_streak, last_level_change_date, theta: thetaFor(level) };
}

/**
 * ホメオスタットモード(Level 5到達後)。
 * TODO(W3): unassisted_read_min の4週移動平均が homeostatDropRatio を超えて落ちたら
 * 一時的にθを再展開し、回復したら再び0へ戻す。
 */
export function homeostat(weeklyUnassistedMin) {
  void weeklyUnassistedMin;
  return null;
}
