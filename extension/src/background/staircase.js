// 閾値推定の制御器(v0.22・適応的階段法)。
//
// その人の「θ がこれだけあれば読める」閾値 τ を、セッションの成否からベイズ推定する。
// 心理物理学の QUEST(Watson & Pelli 1983)と同じ考え方で、n=1・数十回で収束する。
//
//   P(成功 | θ, τ) = γ + (1 − γ − λ) · σ((log θ − τ) / w)
//     γ: 補助がなくても読める確率  λ: 生活のノイズ(θ に関係なく失敗する確率)  w: 閾値の鈍さ
//
// 成功のたびに 10% 下げるのは固定則と同じ(閾値から遠いあいだ、成功は「閾値はもっと下」としか
// 言わない — 下りてみないと分からない)。推定が効くのは次の3場面:
//   - 失敗したとき: ×1.3 ではなく、推定した閾値の余白ぶん上(= 最後に読めていた θ の記憶)に戻る。
//     閾値から遠い1回の失敗は生活のノイズとみなして動かない
//   - 閾値が分かってきたとき(事後分布が狭い): その余白ぶん上で下げるのを止める(据え置き)
//   - 推定は少しずつ忘れる(拡散)ので、習慣がついて閾値が下がれば、据え置きから再び下り始める
// 卒業の閾値(θ<0.3 → 0)は固定則と同じ。閾値の証拠がある人は据え置きで止まり、無い人は降りきる。
//
// 守るもの(controller.js と同じ不変条件):
//   1. 目標は常に 0。入力は成否だけ(エンゲージメント指標・クイズ正誤は入れない)
//   2. 1日の総変化は ±maxDailyChangeRatio まで。1セッションの下げ幅は alpha(JND 未満)まで
//   3. 中立セッション(ほぼ読まず離れてもいない)は数えない・学ばない
//
// 事後分布(τ のグリッド上の重み)を state.stair.post に持つ。グリッドは log θ の等間隔。

import { THETA_MAX, CONTROLLER, STAIRCASE } from '../shared/config.js';
import { outcomeOf } from './controller.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * log θ のグリッド(低 → 高)。state に持たず毎回作る(設定が真実)。
 * 上端は THETA_MAX より上まで伸ばす — 「最大量でも足りない」閾値を表せないと、
 * 最大量での失敗が上端に積み上がって「閾値が分かった」と誤る。
 */
export function thetaGrid() {
  const lo = Math.log(STAIRCASE.gridMin);
  const hi = Math.log(THETA_MAX) + STAIRCASE.gridAboveMax;
  const n = STAIRCASE.gridN;
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}
const gridStep = () => (Math.log(THETA_MAX) + STAIRCASE.gridAboveMax - Math.log(STAIRCASE.gridMin)) / (STAIRCASE.gridN - 1);

function pGiven(logTheta, tau) {
  return STAIRCASE.gamma + (1 - STAIRCASE.gamma - STAIRCASE.lambda) * sigmoid((logTheta - tau) / STAIRCASE.w);
}

function normalize(w) {
  const z = w.reduce((a, b) => a + b, 0);
  return z > 0 ? w.map((v) => v / z) : w.map(() => 1 / w.length);
}

/**
 * 閾値 τ から目標点までの余白(log θ)。目標の成功確率 p* を曲線上で与える点は
 * τ + w·logit((p* − γ) / (1 − γ − λ))。既定の設定では θ* ≈ 閾値 × 2。
 */
export function marginAboveThreshold() {
  const q = (STAIRCASE.target - STAIRCASE.gamma) / (1 - STAIRCASE.gamma - STAIRCASE.lambda);
  const clamped = Math.min(0.99, Math.max(0.01, q));
  return STAIRCASE.w * Math.log(clamped / (1 - clamped));
}

/**
 * 初期の事後分布は一様。診断の初期 θ は「最初の量」であって閾値の見込みではない。
 * 閾値についての知識は失敗から来る(成功は「閾値はもっと下」としか言わない)。
 */
export function initStaircase() {
  return { post: normalize(thetaGrid().map(() => 1)) };
}

/** 事後予測: その θ で成功する確率(τ の不確かさを含む)。ダッシュボードの表示用。 */
export function predict(stair, theta) {
  const grid = thetaGrid();
  const lt = Math.log(Math.max(theta, STAIRCASE.gridMin));
  let p = 0;
  for (let i = 0; i < grid.length; i += 1) p += stair.post[i] * pGiven(lt, grid[i]);
  return p;
}

/** 閾値の推定値 { mean, sd }(log θ)。sd が小さいほど「閾値が分かっている」。 */
export function thresholdEstimate(stair) {
  const grid = thetaGrid();
  let mean = 0;
  for (let i = 0; i < grid.length; i += 1) mean += stair.post[i] * grid[i];
  let v = 0;
  for (let i = 0; i < grid.length; i += 1) v += stair.post[i] * (grid[i] - mean) ** 2;
  return { mean, sd: Math.sqrt(v) };
}

/** 目標点: 推定した閾値の余白ぶん上の θ。 */
export function targetTheta(stair) {
  return Math.min(THETA_MAX, Math.exp(thresholdEstimate(stair).mean + marginAboveThreshold()));
}

/** 成否で事後分布を更新し、少し拡散させる(閾値は動くものとして古い証拠を薄める)。 */
function update(stair, thetaExperienced, success) {
  const grid = thetaGrid();
  const lt = Math.log(Math.max(thetaExperienced, STAIRCASE.gridMin));
  let post = stair.post.map((w, i) => {
    const p = pGiven(lt, grid[i]);
    return w * (success ? p : 1 - p);
  });
  post = normalize(post);
  // 拡散: 閾値は1セッションに driftSd(log θ)ほど動きうるものとして、ガウス核でぼかす。
  // これが忘却 — 据え置きが続いても、失敗の記憶は薄れて再び下り始める
  const sd = STAIRCASE.driftSd / gridStep();
  if (sd > 0) {
    const r = Math.ceil(3 * sd);
    const kernel = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sd * sd)));
    const blurred = post.map((_, i) => {
      let acc = 0;
      let wsum = 0;
      for (let k = -r; k <= r; k += 1) {
        const j = i + k;
        if (j < 0 || j >= post.length) continue;
        acc += kernel[k + r] * post[j];
        wsum += kernel[k + r];
      }
      return acc / wsum;
    });
    post = normalize(blurred);
  }
  return { ...stair, post };
}

/**
 * セッション終了ごとに1回だけ呼ぶ(CONTROLLER.policy === 'staircase' のとき)。
 * 返り値の形は nextState と同じ(theta・day・day_start_theta・streak)に stair と last_decision を足したもの。
 * @param {object} state - { theta, stair?, day, day_start_theta, ... }
 * @param {object} session - 終了したセッション。theta(実効 θ)があればそれで学ぶ
 * @param {string} today - dateKey
 * @param {() => number} [rand] - 探索の保留(STAIRCASE.exploreHoldP)用。既定は Math.random
 */
export function nextStateStaircase(state, session, today, rand = Math.random) {
  let { theta, success_streak = 0, fail_streak = 0, day = null, day_start_theta = null } = state;
  let stair = state.stair ?? initStaircase();

  if (day !== today || day_start_theta === null) {
    day = today;
    day_start_theta = theta;
  }
  const outcome = outcomeOf(session);
  if (outcome === 'neutral') return { ...state, stair, day, day_start_theta };

  const success = outcome === 'success';
  if (success) {
    success_streak += 1;
    fail_streak = 0;
  } else {
    fail_streak += 1;
    success_streak = 0;
  }

  let decision = null;
  if (theta > 0) {
    stair = update(stair, session.theta ?? theta, success);
    const target = targetTheta(stair);
    const known = thresholdEstimate(stair).sd <= STAIRCASE.knownSd;

    if (success) {
      const candidate = theta * (1 - CONTROLLER.alpha);
      if (known && candidate < target) {
        decision = 'hold'; // 閾値が分かっていて、その余白の中。下げない
      } else if (STAIRCASE.exploreHoldP > 0 && rand() < STAIRCASE.exploreHoldP) {
        decision = 'explore_hold';
      } else {
        theta = candidate;
        decision = 'down';
      }
    } else if (target > theta * STAIRCASE.raiseHysteresis) {
      theta = Math.min(THETA_MAX, target); // 推定した閾値の余白ぶん上へ戻る(1日の上限は下で掛かる)
      decision = 'up';
    } else {
      decision = 'hold'; // 閾値から遠い失敗は生活のノイズ。動かない
    }
    // 不変条件: 1日の総変化は ±maxDailyChangeRatio まで
    const lo = day_start_theta * (1 - CONTROLLER.maxDailyChangeRatio);
    const hi = Math.min(THETA_MAX, day_start_theta * (1 + CONTROLLER.maxDailyChangeRatio));
    theta = Math.min(hi, Math.max(lo, theta));
    // 乗算は0に到達しないため、十分小さくなったら卒業(固定則と同じ)
    if (theta < CONTROLLER.graduateBelow) {
      theta = 0;
      decision = 'graduate';
    }
  }

  return { ...state, theta, success_streak, fail_streak, day, day_start_theta, stair, last_decision: decision };
}
