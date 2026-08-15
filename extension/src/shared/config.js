// タペリング制御器の設定。ドッグフーディング中は手で触る前提で1ファイルに集める。

// θ = ヒント・演出の頻度(本文1,000語あたりの表示回数)。
// 離散段階がそのままLevel 0〜5。目標値は常に配列の末尾(0)であり、これは変えない。
export const THETA_BY_LEVEL = [8, 5, 3, 1.5, 0.5, 0];

export const MAX_LEVEL = THETA_BY_LEVEL.length - 1;

export const CONTROLLER = {
  // 成功がK回続いたらLevelを1段上げる(θを下げる)。本人には通知しない。
  successStreakToPromote: 3,
  // 失敗がL回続いたらLevelを1段下げる(θを上げる)。本人には通知しない。
  failStreakToDemote: 2,
  // 不変条件: 1日に動かせるのは1段まで。
  maxLevelStepsPerDay: 1,
  // ホメオスタットモード: Level 5到達後、補助なし読書時間の4週移動平均が
  // このしきい値を超えて落ちたときだけ一時的にθを再展開する。
  homeostatDropRatio: 0.5,
  homeostatWindowWeeks: 4,
};

export const SESSION = {
  // 読書時間の操作的定義: 本文段落が可視、かつ直近このミリ秒以内に
  // スクロールまたは操作がある時間。
  activityWindowMs: 30_000,
  // dwellの積算粒度。
  dwellTickMs: 30_000,
  // 無操作・未復帰でセッションを自動終了するまでの時間。
  idleTimeoutMs: 3 * 60_000,
};

// success := read_ms >= 5分 かつ escapes <= 1
export const SUCCESS = {
  minReadMs: 5 * 60_000,
  maxEscapes: 1,
};
