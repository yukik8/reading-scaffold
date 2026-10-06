// タペリング制御器とセッションの設定。ドッグフーディング中は手で触る前提で1ファイルに集める。

// θ = ヒント・演出の頻度(本文1,000語あたりの表示回数)。[0, THETA_MAX]の連続値。
// 2026-08-16改訂: Level 5段階は廃止。段差は本人が気づく。
// Weber-Fechnerの法則(気づける最小変化=現在量の約10〜20%)に基づき、
// JND未満の乗算的漸減にする。目標値は常に0で、これは変えない。
export const THETA_MAX = 8;

export const CONTROLLER = {
  // W3で有効化(2026-08-16)。セッション終了ごとに基準θが自動で動く。
  enabled: true,

  // 成功セッションごとに θ ← θ×(1−alpha)。10%はJND未満(本人に通知しない)
  alpha: 0.1,
  // 失敗がこれだけ続いたら θ ← θ×(1+beta)。戻すときは大きめ(ヒステリシス)
  failStreakToRaise: 2,
  beta: 0.3,
  // 不変条件: 1日の総変化は±この率まで(急激な変化の禁止)
  maxDailyChangeRatio: 0.15,
  // 乗算は0に到達しないため、これ未満で0へスナップ(卒業)
  graduateBelow: 0.3,
  // ホメオスタットモード: 卒業後、補助なし読書時間の4週移動平均が
  // 卒業時ベースラインのdropRatioを切ったら一時的にθを再展開し、
  // recoverRatioまで戻ったら再び0へ(再展開中は漸減しない)。
  homeostatDropRatio: 0.5,
  homeostatRecoverRatio: 0.8,
  homeostatRedeployTheta: 1.5,
  homeostatWindowWeeks: 4,
};

// セッションごとの実効θ = θ × (1±この幅の乱数)。
// 日々±10%揺れる中を成功あたり10%下るので、下降トレンドがノイズに埋もれる(迷彩)。
export const THETA_NOISE = 0.1;

// デモモード: 演出だけを全体的に派手にする。計測・制御・記録には一切影響しない。
// ON/OFFはコード直書きをやめ、chrome.storage.local(プロフィールごとに独立)に置く。
// これで「本番プロフィール=常時OFFでクリーンな計測」と「デモプロフィール=ONで派手」を
// 同じコードのまま両立できる(フラグ書き換えの戻し忘れ事故が消える)。既定はOFF。
// ONの間: 読了お祝いは成功条件を待たず必ず出る / クイズは最初のヒント枠で必ず出て
// 正解は常に大当たり / レア演出の確率も大幅増。
export const DEMO = {
  boost: 3, // 星の数の倍率(サイズも1.25倍)。これは静的な調整値
};

const DEMO_KEY = 'demo_enabled';

/** デモモードの現在値(プロフィールごと)。既定OFF。読めなければOFF扱い。 */
export async function readDemoFlag() {
  try {
    const r = await chrome.storage.local.get(DEMO_KEY);
    return r[DEMO_KEY] === true;
  } catch {
    return false;
  }
}

export async function writeDemoFlag(value) {
  try {
    await chrome.storage.local.set({ [DEMO_KEY]: value === true });
  } catch {
    /* 失敗は無視(次回の読みでOFF扱い) */
  }
}

export const SESSION = {
  // 読書時間の操作的定義: 本文段落が可視、かつ直近このミリ秒以内に
  // スクロールまたは操作がある時間。
  activityWindowMs: 30_000,
  // ページ送りの本(Play ブックス)では、1ページを読む間(縦書き文庫で約60秒)は操作が無い。
  // 30秒だと1ページの後半が数えられないので、ページ送りを操作とみなしたうえで窓を広げる。
  pagedActivityWindowMs: 90_000,

  // dwellの積算粒度。設計ドキュメントは30秒だが20秒に落としている。
  // MV3のService Workerはメッセージが30秒途切れると停止しうるため、
  // 30秒ちょうどの間隔だと停止と再起動の境界に当たる。20秒なら鼓動が絶えない。
  dwellTickMs: 20_000,

  // 無操作・未復帰でセッションを自動終了するまでの時間。
  idleTimeoutMs: 3 * 60_000,

  // 本文検出の合格ライン。これを下回るページは「計測のみ」モードにする。
  minParagraphs: 3,
  minWords: 200,
};

// 常時演出(ambient): 読んでいる間、θに比例した密度で小さな星を漂わせる。
// ヒント(離散的な報酬)と別系統の「地」の演出。θに比例するので、
// Level 0で最も濃く、Levelが上がると自然に薄まり、Level 5(θ=0)で消える。
export const AMBIENT = {
  enabled: true,
  tickMs: 1_500,
  // 1 tickあたりの「キラッ」発生確率 = (θ/θmax)² × maxClusterChance。
  // 均等に湧かせず、余白の一点に星が固まって瞬く(1回3〜7粒)。
  // 2乗カーブ: Level 0で約4.3秒に1回、中間は稀に、卒業間際はほぼ無音。
  maxClusterChance: 0.35,
};

// 紙のめくれ(ambient): 読んでいる間、ときどき風で左下の角がペラっとめくれて戻る。本文には重ねない。
// 頻度と大きさはθに比例し、θ=0で出ない。
// 2026-10-07: 読書中に邪魔だったので止めた(普段の演出は余白だけに描く margin.js に寄せた)
export const PAGE_CURL = {
  enabled: false,
  tickMs: 1_500,
  maxChance: 0.06, // θ=THETA_MAX のとき、1 tick あたりにめくれる確率(平均して約25秒に1回)
  minGapMs: 8_000, // 前のめくれからの最小間隔
  minSize: 36, // めくれの大きさ(角からの px)。θに比例して min〜max
  maxSize: 90,
};

// 先触れ(予期の設計・v0.11.0): レア以上はヒント計画時に事前ロールし、発火が近づくと
// 地のきらきらが金(激レアは虹)に変わる。ドーパミンは報酬でなくcueと予測誤差で出る
// (Schultz 1997)ため、予期の窓を作る。予告は必ず当たる(ニアミス禁止)。
export const FORESHADOW = {
  // 何段落先までを「近い」とみなして先触れを始めるか
  aheadParagraphs: 4,
  // 先触れ開始後、この回数のdwell tickまでに段落が来なければ発火を保証する
  // (予告を裏切らない: 約60秒で必ず本演出)
  guaranteeTicks: 3,
};

// 天井(下限保証・v0.11.0): θ>0なのに演出ゼロの実読書が続いたら、次の区切りで
// normal一回を確定させる。ハマリの演出化(残り時間の表示・示唆)は移植しない。
// 天井分数 = perThetaMinutes/θ を[min,max]に丸める(θが低いほど天井は遠い)。
export const CEILING = {
  enabled: true,
  perThetaMinutes: 12,
  minMinutes: 3,
  maxMinutes: 15,
};

// 演出のレア度。ヒント発火時にロールする(=頻度はθ配下のまま、大きさだけ可変)。
// ドーパミンは報酬の予測誤差で出るので、頻度の乱数に加えて大きさも予測不能にする。
// ルール: 予告(foreshadow)はレア以上が確定したときだけ出す。
// ニアミス(予告→ハズレ)は悔しさ駆動の技法なので構造的に作らない。
export const EFFECT_TIERS = {
  epic: { p: 0.025 }, // 激レア: 金の雨(濃)+縁光。約1/40
  rare: { p: 0.12 }, // レア: 金の雨。約1/8
};

// クイズ(理解連動Micro Content)。ローカルのFastAPIサーバ経由でLLMが出題する。
// ヒント枠の一部がクイズに化ける形なので頻度はθ配下のまま。1セッション1問まで。
// サーバが落ちていれば静かに何も出さない(読書を壊さない)。
export const QUIZ = {
  enabled: true,
  // ヒント枠がクイズに化ける確率
  p: 0.3,
  // 読了済み段落がこれ未満なら出さない(素材不足)
  minParagraphsRead: 3,
  endpoint: 'http://127.0.0.1:8787/quiz',
  askEndpoint: 'http://127.0.0.1:8787/ask',
  triviaEndpoint: 'http://127.0.0.1:8787/trivia',
  timeoutMs: 12_000,
  // 正解時の演出の強さはθに連動(低Levelほど盛大に、卒業に向けて漸減):
  //   θ >= jackpotMinTheta → 大当たり(予告→縁光→特濃の雨+三波)
  //   θ >= rainMinTheta   → 金の雨
  //   それ未満            → 星の二波のみ
  jackpotMinTheta: 5, // Level 0-1
  rainMinTheta: 3, // Level 2
};

// めくった直後の「突然の出来事」(Play ブックス)。出たり出なかったりする(可変報酬)。
// 突然クイズと、くま(うんちく/顔を出すだけ)は別々に抽選する(同じ枠で取り合うとクイズがほぼ出なくなる)。
// 同じめくりで両方当たればクイズを優先。うんちくとクイズは生成に数秒かかるので、読み終えたページから
// 先に1つずつ作ってストックしておく。頻度も派手さもθに比例し、θ=0では何も起きない。
// Play ブックスでは通常のヒント→クイズ化は止め、クイズはこちらに一本化する。
export const PAGE_EVENTS = {
  enabled: true,
  minTurns: 2, // セッション開始後、この回数のページ送りまでは何も起きない
  delayMs: 600, // めくってから出すまでの間(突然感)
  // 突然クイズ: θ=THETA_MAX のとき1回のページ送りで出る確率と、クイズどうしの最小間隔
  quiz: { maxP: 0.25, minGapMs: 120_000 },
  // くま: 同上。weights はうんちく(作れていれば)と、顔を出すだけ の割合
  bear: { maxP: 0.35, minGapMs: 45_000, weights: { trivia: 0.65, peek: 0.35 } },
  afterQuizMs: 20_000, // クイズの直後はくまを出さない
  minTextChars: 120, // 出題・うんちくに使う読了済み本文の最低文字数
  maxTextChars: 1_500, // 渡す本文の上限(サーバ経路では外部へ出る量)
  // 正解・読了で「大当たり!!」「読了!!」の言葉を出す。言葉の原則(言葉で褒めない)を
  // この瞬間に限って緩める設定。false にすると光と動きだけになる。
  words: true,
};

// めくった瞬間の花びら(Play ブックス): ページを送るたびに、クイズ正解と同じ花びら・ことば吹雪・
// 星を上から数秒降らせる。読んでいる行に重ねないよう、視線が次のページへ移る切れ目に限る。
// 確率 = maxP × (θ/θmax)、量も Paint が θ で絞る — 最初の頃はほぼ毎回たっぷり、θ=0で出ない。
// 2026-10-07: 本文の上に毎回降って邪魔だったので止めた(大きく出すのはクイズ・読了だけ)
export const PAGE_SHOWER = {
  enabled: false,
  maxP: 1, // θ=THETA_MAX のとき、1回のページ送りで降る確率
};

// Play ブックスでも、Nano が使えなければローカルサーバ経由で Anthropic に生成させる。
// その場合、読み終えたページの本文の一部が外部へ出る(β では同意が前提・著作物の扱いを要決定)。
export const PLAY_BOOKS_SERVER = true;

// success := read_ms >= 5分 かつ escapes <= 1
export const SUCCESS = {
  minReadMs: 5 * 60_000,
  maxEscapes: 1,
};

// 読書安定度 S ∈ [0,1](architecture-v1.md §4)。二値successの粗さ(20分読んで1回逸れた人と
// 5分ぎりぎりの人が同じ「成功」)を連続値に格上げする。
// v0.14: 並走計測のみ。sessions.stability に保存して二値と一致率を見る。制御には繋がない。
// 不変条件: 入力は行動シグナルだけ。ヒント数・演出数・クイズ正誤・問いの数・目標達成・
// 連続日数などエンゲージメント/理解の指標は入れない(自己目的化回路を作らない)。
export const STABILITY = {
  weights: { dur: 0.4, escape: 0.25, return: 0.15, completion: 0.1, ending: 0.1 },
  durFullMin: 20, // この分数で読書時間の項が満点
  escapeFullCount: 3, // この回数の離脱で離脱項が0
  awayFullMs: 3 * 60_000, // 累計でこれだけ離れていたら離脱項が0
  quickReturnMs: 60_000, // これ以内の復帰を「すぐ戻った」と数える
  ending: { manual: 1, close: 0.7, idle: 0.3 },
  // 制御接続時の閾値(並走中は未使用): S≥successAtで成功、S≤failAtで失敗、間は据え置き
  successAt: 0.7,
  failAt: 0.3,
};

// 週次目標(評価レイヤーのKPI)。ユーザーが自分で選ぶ。段階が上がると評価だけが厳しくなる。
// 制御器はこれを一切読まない(目標を制御に入れない — 不変条件)。SUCCESSの定義も動かさない。
// 達成率はダッシュボードにのみ事実として表示する(popupのMirrorには出さない — 責めない原則)。
// 閾値の根拠: docs/research/benchmark.md §3・§5(レベル2の10分はGloria Markの
// 「中断までのプロジェクト集中≈10.5分」、レベル3の週60分はATUSのintensive reader相当)。
export const GOALS = {
  level1: { name: 'まず読める', desc: '成功セッション 週3回', sessions: 3 },
  level2: { name: '続けて読める', desc: '成功セッション 週5回・10分続けて', sessions: 5, streakMin: 10 },
  level3: { name: '自分の力で読める', desc: '補助なしで 週60分', unassistedMin: 60 },
};
export const DEFAULT_GOAL = 'level1';

// 合格ライン(2026-09-14確定・architecture-v1.md §10)。「達成率を保ったままθが下がる」の
// 「保つ」を数値化したもの。評価レイヤー専用 — 制御器は読まない。
export const PASS = {
  achievementFloor: 0.8, // 週次達成率がこれ以上を「保った」と数える
  weeksRequired: 3, // 直近weeksWindow週のうちこれだけ保てば維持
  weeksWindow: 4,
  graduateWithinWeeks: 12, // 開始からこの週数以内に θ=0
  quizDropMaxPt: 10, // クイズ正答率が全期間平均よりこれ以上落ちたら理解の劣化
  // 卒業後の維持(50%割れで再展開)は CONTROLLER.homeostatDropRatio が担う
};

// 初回診断(オンボーディング)。4問×0〜2点の合計(0=軽い〜8=重い)を初期θに写す。
// スコア・θを本人に見せない(「中毒度」のラベリングをしない — PRD「診断と目標設定」)。
// 診断は内部でθの初期値としてだけ働き、以後のθは制御器だけが動かす。
export const DIAGNOSIS = {
  thetaByScore: [2, 3, 4, 5, 5.5, 6, 7, 7.5, 8],
  /** 目標のおすすめ。重いほど控えめな段階から(自己設定なので最終決定は本人)。 */
  recommendGoal(score) {
    if (score >= 5) return 'level1';
    if (score >= 2) return 'level2';
    return 'level3';
  },
};

export const MIRROR = {
  // 週次グラフに出す週数。
  weeks: 8,
  // 補助なし読書時間の定義: ヒントも演出も1回も出さなかったセッションのread_msの合計。
  // 設計ドキュメントは「Level 4以上のセッション」としているが、これは代理指標で、
  // Level 4(θ=0.5)でもヒントは出る。実際の表示回数で数えるほうが定義として正確で、
  // ヒントが未実装のW1でも意味のある数字になる。
  unassistedRequiresZeroHints: true,
};
