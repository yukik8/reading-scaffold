// 模擬の読者。「θ がこれだけあれば読める」という閾値 ν(log θ の尺度)を隠れて持ち、
// 読むたびに(習慣がつくにつれ)ν がゆっくり下がる。
//
//   P(成功 | θ) = γ + (1 − γ − λ) · σ((log θ − ν) / w)
//
//   γ: 補助がなくても読める確率(その人の素の力)。これが高い人は θ と無関係に成功する
//   λ: 生活のノイズ(忙しい・体調・本がつまらない)。θ がいくら高くても失敗する確率
//   w: 閾値の鈍さ。小さいほど「ν を切ると急に読めなくなる」
//
// 本物の人間がこの形で動く保証はない。ここでの比較は「このモデルの読者に対して
// 制御器がどう振る舞うか」であって、本物のデータでの検証(replay --export)の代わりではない。

import { THETA_MAX } from '../../../extension/src/shared/config.js';

const DAY = 86_400_000;

export const READER_PRESETS = {
  // 典型: 最初は θ≈2 を切ると読めない。12週で ν が log(0.5) 付近まで下がる
  typical: { nu0: Math.log(2), gamma: 0.25, lambda: 0.15, w: 0.5, habitPerSuccess: 0.06 },
  // 軽い: 素の力が高く、補助はほぼ要らない
  light: { nu0: Math.log(0.8), gamma: 0.6, lambda: 0.1, w: 0.5, habitPerSuccess: 0.06 },
  // 重い: 閾値が高く、習慣がつくのも遅い
  heavy: { nu0: Math.log(4), gamma: 0.1, lambda: 0.2, w: 0.4, habitPerSuccess: 0.03 },
  // 無反応: θ に関係なく成功率が一定(= 今の成功基準が緩いときに起きていること)
  flat: { nu0: Math.log(0.01), gamma: 0.9, lambda: 0.05, w: 0.5, habitPerSuccess: 0 },
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * @param {object} opts
 * @param {string} opts.preset READER_PRESETS のキー
 * @param {number} opts.sessionsPerWeek 週あたりのセッション数(平均)
 * @param {number} opts.weeks 何週ぶん生成するか
 * @param {object} rng makeRng()
 * @param {number} [opts.jitter] プリセットの ν0 に乗せる個人差(標準偏差・log θ 尺度)
 */
export function makeReader({ preset = 'typical', sessionsPerWeek = 4, weeks = 16, jitter = 0.3 }, rng) {
  const p = READER_PRESETS[preset];
  if (!p) throw new Error(`unknown preset: ${preset}`);
  let nu = p.nu0 + rng.normal() * jitter;

  // セッションの時刻: 各週に sessionsPerWeek 回を、曜日と時刻をばらして置く
  const start = new Date(2026, 0, 5, 20, 0, 0).getTime(); // 月曜 20:00
  const times = [];
  for (let wk = 0; wk < weeks; wk += 1) {
    const n = Math.max(0, Math.round(sessionsPerWeek + rng.normal() * 1));
    const days = new Set();
    while (days.size < Math.min(n, 7)) days.add(Math.floor(rng.uniform(0, 7)));
    for (const d of days) {
      times.push(start + wk * 7 * DAY + d * DAY + Math.floor(rng.uniform(-3, 3)) * 3_600_000);
    }
  }
  times.sort((a, b) => a - b);

  return {
    preset,
    times,
    /** 隠れ状態(検証用) */
    get nu() {
      return nu;
    },
    pSuccess(theta) {
      const logTheta = Math.log(Math.max(theta, 1e-6));
      return p.gamma + (1 - p.gamma - p.lambda) * sigmoid((logTheta - nu) / p.w);
    },
    /**
     * θ を与えて1セッション読む。controller.nextState が読む形(read_ms, escapes)で返す。
     * 成功なら習慣が少しつき、ν が下がる。
     */
    read(theta) {
      const success = rng.bernoulli(this.pSuccess(theta));
      if (success) nu -= p.habitPerSuccess;
      return success
        ? { read_ms: Math.round(rng.uniform(8, 30) * 60_000), escapes: rng.bernoulli(0.3) ? 1 : 0, success }
        : { read_ms: Math.round(rng.uniform(1.5, 4.5) * 60_000), escapes: 2 + Math.floor(rng.uniform(0, 3)), success };
    },
  };
}

export { THETA_MAX };
