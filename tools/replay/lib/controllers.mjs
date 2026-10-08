// 再生ハーネスにかける制御器の一覧。拡張の controller.js をそのまま読む(写しを作らない)。
//
// 制御器の形:
//   init(theta0)                 → 状態
//   step(state, session, today)  → 次の状態。session は { read_ms, escapes, ... }、today は dateKey
//   theta(state)                 → いまの基準 θ
//
// ホメオスタット(卒業後の見守り)はここでは回さない。再生の対象は卒業までのタペリング。

import { nextState } from '../../../extension/src/background/controller.js';
import { initStaircase, nextStateStaircase } from '../../../extension/src/background/staircase.js';

export const CONTROLLERS = {
  // 閾値推定(v0.22 候補): その人の「読める最低の θ」を推定し、成功確率 0.8 を保てる最低点へ
  staircase: {
    name: 'staircase',
    init: (theta0) => ({
      theta: theta0,
      success_streak: 0,
      fail_streak: 0,
      day: null,
      day_start_theta: null,
      stair: initStaircase(),
    }),
    // 探索の保留は使わない(rand は常に 1 → 保留しない)
    step: (state, session, today) => nextStateStaircase(state, session, today, () => 1),
    theta: (state) => state.theta,
  },
  // 現物(v0.21): 成功 ×0.9、2連続失敗 ×1.3、1日 ±15%、0.3 未満で卒業
  fixed: {
    name: 'fixed',
    init: (theta0) => ({
      theta: theta0,
      success_streak: 0,
      fail_streak: 0,
      day: null,
      day_start_theta: null,
    }),
    step: (state, session, today) => nextState(state, session, today),
    theta: (state) => state.theta,
  },
};

export function pickControllers(names) {
  const list = names ? names.split(',') : Object.keys(CONTROLLERS);
  return list.map((n) => {
    const c = CONTROLLERS[n.trim()];
    if (!c) throw new Error(`unknown controller: ${n} (available: ${Object.keys(CONTROLLERS).join(', ')})`);
    return c;
  });
}
