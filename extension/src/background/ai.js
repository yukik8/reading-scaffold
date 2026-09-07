// Chrome内蔵AI(Gemini Nano / Prompt API)のラッパー。
//
// 本文がデバイスの外に出ない生成基盤(docs/ask-and-nano-design.md §4)。
// 利用できなければnullを返し、呼び手がフォールバック(ローカルサーバ or 出さない)を選ぶ。
// API: グローバルの LanguageModel。availability() → 'unavailable' | 'downloadable' |
// 'downloading' | 'available'。構造化出力は responseConstraint(JSON Schema)。

const TIMEOUT_MS = 20_000;

// Prompt APIは出力品質と安全性の担保のため入出力言語の宣言を求める(未指定だと警告)。
// 読者が触れるのは日本語と英語の本文なので両方を宣言する(対応: de,en,es,fr,ja)。
const LANGS = ['ja', 'en'];
const CREATE_OPTS = {
  expectedInputs: [{ type: 'text', languages: LANGS }],
  expectedOutputs: [{ type: 'text', languages: LANGS }],
};

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('nano timeout')), ms)),
  ]);
}

/** 'no-api'(古いChrome等) または LanguageModel.availability() の値。 */
export async function nanoAvailability() {
  try {
    if (typeof LanguageModel === 'undefined') return 'no-api';
    return await LanguageModel.availability(CREATE_OPTS);
  } catch {
    return 'no-api';
  }
}

// モデルDLは数GB。'downloadable'のときは裏で1度だけDLを起こし、完了(=available)
// までは静かにnullを返す。DLの起動には初回ユーザージェスチャーが要ることがあるため、
// 確実な起動はダッシュボードの「内蔵AIを準備」ボタン(ページ文脈)から行う。
let downloadKicked = false;
function kickDownload() {
  if (downloadKicked) return;
  downloadKicked = true;
  (async () => {
    try {
      const s = await LanguageModel.create({
        ...CREATE_OPTS,
        monitor(m) {
          m.addEventListener('downloadprogress', () => {});
        },
      });
      s.destroy();
    } catch {
      downloadKicked = false; // 失敗したら次回また試せるように
    }
  })();
}

async function promptJson(systemPrompt, userPrompt, schema) {
  const availability = await nanoAvailability();
  if (availability === 'no-api' || availability === 'unavailable') return null;
  if (availability !== 'available') {
    // まだ使えない(downloadable/downloading)。DLを起こしておき、今回は諦める。
    kickDownload();
    return null;
  }
  let session = null;
  try {
    session = await withTimeout(LanguageModel.create(CREATE_OPTS));
    const raw = await withTimeout(
      session.prompt(`${systemPrompt}\n\n${userPrompt}`, { responseConstraint: schema }),
    );
    return JSON.parse(raw);
  } catch {
    return null;
  } finally {
    try {
      session?.destroy();
    } catch {
      /* 破棄失敗は無視 */
    }
  }
}

/**
 * 診断: 実機で内蔵AIがどの状態か。ダッシュボードのdev欄から呼ぶ(ページ文脈で
 * 実行するとユーザージェスチャーが保たれ、DL起動が確実になる)。
 * create()も試み、進捗・エラーメッセージまで返す。
 */
export async function nanoDiagnostics() {
  const out = { hasApi: typeof LanguageModel !== 'undefined' };
  if (!out.hasApi) return out;
  try {
    out.availability = await LanguageModel.availability(CREATE_OPTS);
  } catch (e) {
    out.availability = 'error';
    out.availabilityError = String(e?.message ?? e);
    return out;
  }
  if (out.availability === 'unavailable') return out;
  let progress = -1;
  try {
    const session = await withTimeout(
      LanguageModel.create({
        ...CREATE_OPTS,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            progress = Math.round((e.loaded ?? 0) * 100);
          });
        },
      }),
      120_000, // DLは長い。診断は待つ
    );
    out.downloadProgress = progress;
    try {
      out.sample = String(
        await withTimeout(session.prompt('日本語で「準備完了」とだけ返して'), 15_000),
      ).slice(0, 60);
      out.created = true;
    } catch (e) {
      out.promptError = String(e?.message ?? e);
    }
    session.destroy();
  } catch (e) {
    out.downloadProgress = progress;
    out.createError = String(e?.message ?? e);
  }
  return out;
}

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    answer_index: { type: 'integer', minimum: 0, maximum: 2 },
  },
  required: ['question', 'choices', 'answer_index'],
  additionalProperties: false,
};

/**
 * 段落から3択クイズを1問。生成できなければnull(呼び手がサーバへフォールバック)。
 * 言葉の原則: 出題のみ。解説・褒め・アドバイスは書かせない。
 */
export async function nanoQuiz(paragraphText) {
  const sys =
    'あなたは読解クイズの出題者。渡された段落の内容だけから、理解を確かめる3択クイズを1問作る。' +
    '本文と同じ言語で出題する。解説・褒め言葉・アドバイスは一切書かない。';
  const user = `次の段落から3択クイズを1問。正解は段落を読んでいれば分かるものにする。\n---\n${paragraphText}`;
  const out = await promptJson(sys, user, QUIZ_SCHEMA);
  if (!out || typeof out.question !== 'string' || !Array.isArray(out.choices)) return null;
  if (out.choices.length !== 3) return null;
  const idx = Number(out.answer_index);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) return null;
  return { question: out.question, choices: out.choices.map(String), answer_index: idx };
}

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    source_index: { type: 'integer' },
  },
  required: ['answer', 'source_index'],
  additionalProperties: false,
};

/**
 * 読書中の質問への短い回答。「照らす、答えない」:
 * 2〜3文まで・先回りの要約をしない・根拠段落の番号を返させて光で指す。
 * context = [{ i, text }](読了済み段落のみ。未読は渡さない=ネタバレ禁止は呼び手が守る)
 */
export async function nanoAnswer({ question, selection, context }) {
  const sys =
    '読書中の質問に答えるアシスタント。必ず2〜3文で短く答える。本文の要約や先の内容の紹介はしない。' +
    '根拠が渡された段落にあれば、その番号をsource_indexで返す(なければ-1)。本文と同じ言語で答える。';
  const ctx = context.map((c) => `[${c.i}] ${c.text}`).join('\n\n');
  const user = `${selection ? `読者が選択している本文: ${selection}\n\n` : ''}質問: ${question}\n\n読了済みの段落:\n${ctx}`;
  const out = await promptJson(sys, user, ANSWER_SCHEMA);
  if (!out || typeof out.answer !== 'string' || !out.answer.trim()) return null;
  return {
    answer: out.answer.trim(),
    source_index: Number.isInteger(out.source_index) ? out.source_index : -1,
  };
}
