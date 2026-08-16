# reading-scaffold バックエンド(v0後半)。
# 受け取るのは段落テキストのみ。保存もログ出力もしない(ローカルファースト原則)。

import hashlib
import json
import os
import random
from collections import OrderedDict

import anthropic
from fastapi import FastAPI
from pydantic import BaseModel

MODEL = os.environ.get("RS_QUIZ_MODEL", "claude-opus-5")

app = FastAPI()
# APIキーは ANTHROPIC_API_KEY か `ant auth login` のプロファイルから解決される。
client = anthropic.Anthropic()

SYSTEM = """あなたは読書支援ツール「reading-scaffold」の出題エンジンです。
与えられた本文の段落だけを根拠に、読者の理解を確かめる三択問題を1問だけ作ります。

原則:
- 段落に書かれている内容のみから出題する(外部知識やこの先の内容を要求しない)
- 読者を試すためではなく、理解を確かめて自信を持たせるための問題にする
- 責めない: ひっかけ・重箱の隅・曖昧な選択肢を作らない
- 簡潔に: 問題文は60字以内、選択肢は各30字以内を目安にする
- comment には段落の要点を1文だけ添える。優しく、教訓めかさない

出力は指定のJSONスキーマに従う。answer_index は正解の添字(0-2)。"""

QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "question": {"type": "string"},
        "choices": {"type": "array", "items": {"type": "string"}},
        "answer_index": {"type": "integer"},
        "comment": {"type": "string"},
    },
    "required": ["question", "choices", "answer_index", "comment"],
    "additionalProperties": False,
}

# 同一段落への再出題はキャッシュから(設計ドキュメント: キャッシュ必須)
_cache: OrderedDict[str, dict] = OrderedDict()
CACHE_MAX = 512


class QuizRequest(BaseModel):
    paragraph_text: str
    article_context: str | None = None


@app.get("/healthz")
def healthz():
    return {"ok": True, "model": MODEL}


@app.post("/quiz")
def quiz(req: QuizRequest):
    text = req.paragraph_text.strip()[:2000]
    if len(text) < 60:
        return {"ok": False, "error": "too_short"}

    key = hashlib.sha256(text.encode()).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return {"ok": True, "quiz": _cache[key], "cached": True}

    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM,
            # 分類器がまれに拒否した場合もサーバ側で自動フォールバックさせる
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default"},
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": QUIZ_SCHEMA},
            },
            messages=[
                {
                    "role": "user",
                    "content": f"次の段落から三択問題を1問作ってください。\n\n{text}",
                }
            ],
        )
    except anthropic.APIError as e:
        return {"ok": False, "error": type(e).__name__}
    except Exception as e:  # 認証未設定等。拡張側はJSONを期待するので500にしない
        return {"ok": False, "error": type(e).__name__}

    if resp.stop_reason == "refusal":
        return {"ok": False, "error": "refusal"}

    block = next((b for b in resp.content if b.type == "text"), None)
    if block is None:
        return {"ok": False, "error": "empty"}
    try:
        data = json.loads(block.text)
    except json.JSONDecodeError:
        return {"ok": False, "error": "bad_json"}

    choices = data.get("choices")
    idx = data.get("answer_index")
    if not isinstance(choices, list) or len(choices) != 3:
        return {"ok": False, "error": "bad_choices"}
    if not isinstance(idx, int) or not 0 <= idx < 3:
        return {"ok": False, "error": "bad_answer_index"}

    # 正解の位置の偏りを消すため、サーバ側でシャッフルする
    order = [0, 1, 2]
    random.shuffle(order)
    data["choices"] = [choices[i] for i in order]
    data["answer_index"] = order.index(idx)

    _cache[key] = data
    if len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)
    return {"ok": True, "quiz": data}
