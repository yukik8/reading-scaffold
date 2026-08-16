// 玄人デモデータ(DEMOモード専用)。
// 「約10週間ドッグフーディングした茶帯の人」の履歴を一括投入する。
// 実運用のプロファイルでは使わないこと(実データに追記される)。

import { putState, putSession, putPage, addQuiz, addQuizAttempt } from '../background/store.js';

// 再現可能な疑似乱数(毎回同じ玄人ができる)
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAGES = [
  ['イシューからはじめよ ― 知的生産の「シンプルな本質」', 'diamond.jp', 'cjk', 5200],
  ['思考の整理学', 'chikumashobo.co.jp', 'cjk', 4100],
  ['Deep Work: Rules for Focused Success in a Distracted World', 'calnewport.com', 'latin', 6800],
  ['失敗の本質 ― 日本軍の組織論的研究', 'chuko.co.jp', 'cjk', 7300],
  ['The Shallows: What the Internet Is Doing to Our Brains', 'theatlantic.com', 'latin', 5900],
  ['知的生産の技術', 'iwanami.co.jp', 'cjk', 3800],
  ['読書について', 'kobunsha.com', 'cjk', 2900],
  ['暇と退屈の倫理学', 'shinchosha.co.jp', 'cjk', 8100],
  ['How to Read a Book: The Classic Guide', 'fs.blog', 'latin', 4400],
  ['学びとは何か ― 探究人になるために', 'iwanami.co.jp', 'cjk', 5100],
  ['Why We Sleep: Unlocking the Power of Sleep', 'penguin.co.uk', 'latin', 6200],
  ['ファスト&スロー ― あなたの意思はどのように決まるか?', 'hayakawa-online.co.jp', 'cjk', 9400],
  ['銃・病原菌・鉄 ― 一万三〇〇〇年にわたる人類史の謎', 'soshisha.com', 'cjk', 8800],
  ['Attention and Effort — Revisiting Kahneman', 'medium.com', 'latin', 3600],
  ['アイデアのつくり方', 'hanmoto.com', 'cjk', 2200],
];

const QUIZZES = [
  ['イシュー度と解の質、先に上げるべきとされたのはどちらか。', ['イシュー度', '解の質', '両方同時'], 0, 0, [[false, 20], [true, 13]]],
  ['「編集」に必要だと述べられた素材の状態は?', ['寝かせたもの', '集めた直後のもの', '他人のもの'], 0, 1, [[true, 55]]],
  ['Deep Workの対義語として置かれた概念は?', ['Shallow Work', 'Hard Work', 'Remote Work'], 0, 2, [[true, 48]]],
  ['日本軍の失敗の中核として挙げられたのは?', ['戦略の曖昧さ', '兵力不足', '補給の軽視'], 0, 3, [[false, 41], [true, 35]]],
  ['ネットが読解に与える影響として著者が示したのは?', ['深い読みの衰え', '語彙の減少', '視力の低下'], 0, 4, [[true, 33]]],
  ['カードに書くべきとされた単位は?', ['一枚一項目', '一枚一冊', '一枚一日'], 0, 5, [[true, 29]]],
  ['ショーペンハウアーが読書に対して促した態度は?', ['自分で考えること', '多読すること', '速読すること'], 0, 6, [[true, 26]]],
  ['「退屈の第二形式」に含まれるとされたものは?', ['気晴らしと絡み合った退屈', '純粋な退屈', '労働の退屈'], 0, 7, [[false, 22], [true, 16]]],
  ['点検読書(inspectional reading)の目的は?', ['短時間で全体を掴む', '一語ずつ精読する', '批評を書く'], 0, 8, [[true, 12]]],
  ['熟達者の学びの特徴として述べられたのは?', ['スキーマの再構造化', '暗記量の多さ', '学習時間の長さ'], 0, 9, [[true, 9]]],
  ['睡眠不足が最初に損なうと述べられた機能は?', ['集中の維持', '筋力', '食欲'], 0, 10, [[true, 5]]],
  ['システム1の特徴として正しいのは?', ['速く自動的', '遅く論理的', '常に正確'], 0, 11, [[true, 2]]],
];

/** 約10週間の玄人履歴を投入する。 */
export async function seedDemoData() {
  const rand = mulberry32(20260816);
  const now = Date.now();
  const day = 86_400_000;
  const DAYS = 72;

  // θの軌跡: 8 → 0.7。序盤ゆるやか、3週目に一度つまずいて戻り、以後着実に漸減
  const thetaByDay = [];
  let theta = 8;
  for (let d = 0; d < DAYS; d += 1) {
    thetaByDay.push(theta);
    if (d === 20) theta = Math.min(8, theta * 1.3); // つまずき(ヒステリシス)
    else if (d % 7 === 6) theta = theta; // 週1休み(変化なし)
    else theta = Math.max(0.7, theta * (0.90 + rand() * 0.04));
  }

  // pages
  const pageIds = [];
  for (let i = 0; i < PAGES.length; i += 1) {
    const [title, domain, lang, words] = PAGES[i];
    const pageId = `demo-pro-${i}`;
    pageIds.push(pageId);
    await putPage({
      page_id: pageId,
      url: `https://${domain}/reading/${i}`,
      title,
      domain,
      lang,
      word_count: words,
      summary: null,
      first_read_at: now - (DAYS - i * 4) * day,
      last_read_at: now - Math.max(0, 10 - i) * day,
      read_count: 1 + Math.floor(rand() * 3),
      total_read_ms: (18 + Math.floor(rand() * 50)) * 60_000,
      best_completion_pct: 55 + Math.floor(rand() * 45),
    });
  }

  // sessions: 1日0〜2回。読書時間は8分→35分へ成長。終盤はヒントゼロ(補助なし)
  let n = 0;
  for (let d = DAYS - 1; d >= 0; d -= 1) {
    const count = rand() < 0.25 ? 0 : rand() < 0.75 ? 1 : 2;
    for (let k = 0; k < count; k += 1) {
      const progress = 1 - d / DAYS; // 0=昔 → 1=いま
      const readMin = Math.round(8 + progress * 24 + rand() * 8);
      const tb = thetaByDay[DAYS - 1 - d];
      const hints = tb > 1.5 ? Math.max(0, Math.round(tb * (0.6 + rand() * 0.5))) : 0;
      const escapes = rand() < (0.45 - progress * 0.35) ? 1 : 0;
      n += 1;
      await putSession({
        session_id: `demo-pro-s${n}`,
        date: 'demo',
        started_at: now - d * day - Math.floor(rand() * 8) * 3_600_000,
        domain: PAGES[n % PAGES.length][1],
        page_id: pageIds[n % pageIds.length],
        theta: tb * (0.9 + rand() * 0.2),
        theta_base: tb,
        read_ms: readMin * 60_000,
        escapes,
        completion_pct: 50 + Math.floor(rand() * 50),
        success: readMin >= 5 && escapes <= 1,
        hints_shown: hints,
        effects_shown: hints > 0 && rand() < 0.3 ? 1 : 0,
      });
    }
  }

  // quizzes + attempts(×→○の成長痕跡つき)
  for (const [question, choices, answerIndex, pageIdx, attempts] of QUIZZES) {
    const quizId = await addQuiz({
      page_id: pageIds[pageIdx],
      paragraph_hash: `demo-pro-h-${pageIdx}`,
      paragraph_excerpt: '',
      question,
      choices,
      answer_index: answerIndex,
      created_at: now - (attempts[0][1] + 0.2) * day,
    });
    for (const [correct, daysAgo] of attempts) {
      await addQuizAttempt({
        quiz_id: quizId,
        page_id: pageIds[pageIdx],
        session_id: 'demo-pro',
        answered_at: now - daysAgo * day,
        chosen_index: correct ? answerIndex : (answerIndex + 1) % 3,
        correct,
        latency_ms: 2_000 + Math.floor(rand() * 5_000),
      });
    }
  }

  // 制御状態: 茶帯(自立度91%)
  await putState({
    theta: 0.7,
    success_streak: 4,
    fail_streak: 0,
    day: null,
    day_start_theta: 0.7,
    diag_answers: null,
  });
}
