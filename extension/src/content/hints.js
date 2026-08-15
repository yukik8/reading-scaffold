// 定型文ヒント(canned)。進捗の相槌と区切りの声かけだけ。
//
// 言葉づかいの原則:
//   - 二人称の診断・因果断定をしない(「集中できてないね」等は禁止)
//   - 責めない。目標未達に触れない
//   - 外部リンクへ誘導しない。読書から連れ出さない
//
// ctx: { pct: 読了率%, min: このセッションの読書分数 }

export const CANNED_HINTS = [
  { id: 'pace-1', text: (ctx) => `ここまで${ctx.pct}%。いい進みかた。` },
  { id: 'pace-2', text: () => 'この調子。次の段落へそのまま。' },
  { id: 'pace-3', text: (ctx) => `${ctx.pct}%まで来た。` },
  { id: 'time-1', text: (ctx) => `${ctx.min}分、読む状態が続いてる。` },
  { id: 'break-1', text: () => 'ここが区切り。ひと息ついても、続けても。' },
  { id: 'accomp-1', text: () => '読んでる。それだけで十分。' },
];

export function pickHint(ctx) {
  const t = CANNED_HINTS[Math.floor(Math.random() * CANNED_HINTS.length)];
  return { hint_id: t.id, text: t.text(ctx) };
}
