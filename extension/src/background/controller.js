// タペリング制御器 v0(連続θ版・2026-08-16改訂)。全部素朴な式で、機械学習はしない。
//
// Level 5段階は廃止した。段差(8→5は37%減)は本人が気づき得るため、
// Weber-Fechnerの法則(気づける最小変化=現在量の約10〜20%)に基づき、
// JND未満の乗算的漸減 θ←θ×(1−α) にする。
//
// 不変条件(このファイルの外から壊せないようにする):
//   1. θの目標値は常に0。エンゲージメント指標もクイズ正誤も入力にしない。
//   2. 1日の総変化は±maxDailyChangeRatioまで。
//   3. 卒業(θ=0)後は監視のみ。再展開はホメオスタットだけが行う。再展開中も目標は0(漸減は続く)。

import { THETA_MAX, CONTROLLER, SUCCESS, THETA_NOISE, STABILITY, PACE } from '../shared/config.js';

export function isSuccess(session) {
  return session.read_ms >= SUCCESS.minReadMs && session.escapes <= SUCCESS.maxEscapes;
}

/**
 * 成否に数えないセッション: ほとんど読まず、離れてもいない(誤って開始した・本を切り替えた)。
 * 読み始めてすぐ離れたセッションは失敗のまま数える — それは読書が続かなかったという信号。
 */
export function isNeutral(session) {
  return (session.read_ms ?? 0) < CONTROLLER.neutralBelowMs && (session.escapes ?? 0) === 0;
}

/**
 * ページごとの速さの要約。standard の中身は { words, ms } の列(content が page_read で送る)。
 * 語数/分の中央値、変動係数、詰まった/流したページの数。標本が足りなければ null。
 * @returns {{ pages: number, wpm: number, cv: number, slow: number, fast: number } | null}
 */
export function paceSummary(samples) {
  const rates = (samples ?? [])
    .filter((s) => s.ms >= PACE.minPageMs && s.ms <= PACE.maxPageMs && s.words >= PACE.minPageWords)
    .map((s) => s.words / (s.ms / 60_000));
  if (rates.length < 3) return null;
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const sd = Math.sqrt(rates.reduce((a, r) => a + (r - mean) ** 2, 0) / rates.length);
  return {
    pages: rates.length,
    wpm: Math.round(median),
    cv: Math.round((sd / mean) * 1000) / 1000,
    slow: rates.filter((r) => r < median / PACE.slowRatio).length, // 遅い = 語数/分が小さい
    fast: rates.filter((r) => r > median / PACE.fastRatio).length,
  };
}

/**
 * 読む速さの持ち越し(state.pace)。前回までの値を priorWeight ページ分の標本として、
 * 今回のページ数と重み付き平均する。次のセッションの最初のページから、速さに合わせた出し方ができる。
 * @param {{ wpm, cv, pages } | null | undefined} prev
 * @param {{ wpm, cv, pages } | null} pace 今回の要約(paceSummary)
 * @returns {{ wpm, cv, pages, updated_at }}
 */
export function blendPace(prev, pace, priorWeight = 6, now = Date.now()) {
  if (!pace || !(pace.wpm > 0) || pace.pages < 1) return prev ?? null;
  const k = prev?.wpm > 0 ? Math.min(prev.pages ?? 0, priorWeight) : 0;
  const n = pace.pages;
  const cvPrev = prev?.cv ?? pace.cv ?? 0.5;
  return {
    wpm: Math.round(((prev?.wpm ?? 0) * k + pace.wpm * n) / (k + n)),
    cv: Math.round(((cvPrev * k + (pace.cv ?? cvPrev) * n) / (k + n)) * 100) / 100,
    pages: Math.min(k + n, priorWeight),
    updated_at: now,
  };
}

/**
 * 読書安定度 S ∈ [0,1]。行動シグナルだけから計算する(理解・エンゲージメント指標は入れない)。
 * SUCCESS.judge === 'stability' のとき outcomeOf がこれを3値に切って制御器へ渡す。
 * @param {object} session - { read_ms, escapes, away_total_ms, quick_returns, pace_cv }
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
  // 速さのばらつきが小さい = 一定の調子で読めた。標本が無い(短い・計れない)ときは中立
  const steady =
    typeof session.pace_cv === 'number' ? clamp01(1 - session.pace_cv / STABILITY.steadyCvFull) : 0.5;
  const ending = STABILITY.ending[reason] ?? STABILITY.ending.idle;

  const s =
    w.dur * dur +
    w.escape * escapeTerm +
    w.return * returnTerm +
    w.steady * steady +
    w.ending * ending;
  return Math.round(clamp01(s) * 1000) / 1000;
}

/**
 * 制御器へ渡す成否。'success' | 'fail' | 'neutral'。
 * binary: isSuccess / isNeutral(v0.21 と同じ)。
 * stability: S ≥ successAt → 成功、S ≤ failAt → 失敗、間は据え置き(学ばない)。
 *   中立セッション(ほぼ読まず離れてもいない)はどちらでも据え置き。
 */
export function outcomeOf(session) {
  if (isNeutral(session)) return 'neutral';
  if (SUCCESS.judge === 'stability' && typeof session.stability === 'number') {
    if (session.stability >= STABILITY.successAt) return 'success';
    if (session.stability <= STABILITY.failAt) return 'fail';
    return 'neutral';
  }
  return isSuccess(session) ? 'success' : 'fail';
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
  const outcome = outcomeOf(session);
  if (outcome === 'neutral') return { ...state, day, day_start_theta };

  const success = outcome === 'success';
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
 * - 卒業(再卒業)から窓の週数のあいだは見守るだけ(4週平均が卒業後の読書を映すまで待つ)
 * - ベースラインが0(卒業前の4週がほぼ補助ありだった)なら、窓が明けた時点の週平均を使う
 * - 非展開中: 補助なし読書時間の週平均がベースライン×dropRatioを切ったら再展開
 * - 展開中: ベースライン×recoverRatioまで戻ったら再び0へ。展開中も通常の漸減は続く
 *   (session.js が nextState を通す)ので、読めていれば漸減でも0に戻る — 目標は常に0
 */
export function applyHomeostat(state, weeklyUnassistedMin, now = Date.now()) {
  const h = state.homeostat;
  if (!h) return state; // 卒業前は対象外
  const windowMs = CONTROLLER.homeostatWindowWeeks * 7 * 86_400_000;
  const settled = now - (h.graduated_at ?? 0) >= windowMs;
  if (!(h.baseline > 0)) {
    if (settled && weeklyUnassistedMin > 0) {
      return { ...state, homeostat: { ...h, baseline: weeklyUnassistedMin } };
    }
    return state;
  }
  if (!h.active && state.theta === 0) {
    if (settled && weeklyUnassistedMin < h.baseline * CONTROLLER.homeostatDropRatio) {
      const theta = CONTROLLER.homeostatRedeployTheta;
      // 1日の変化幅の基準も再展開したθに置く(0のままだと次のセッションで0に戻される)
      return { ...state, theta, day_start_theta: theta, homeostat: { ...h, active: true } };
    }
    return state;
  }
  if (h.active && weeklyUnassistedMin >= h.baseline * CONTROLLER.homeostatRecoverRatio) {
    return { ...state, theta: 0, homeostat: { ...h, active: false, graduated_at: now } };
  }
  return state;
}
