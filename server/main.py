# reading-scaffold バックエンド(v0後半)。
# 受け取るのは段落テキストのみ。保存もログ出力もしない(ローカルファースト原則)。

import hashlib
import json
import os
import random
import re
import traceback
from collections import OrderedDict

import anthropic
from fastapi import FastAPI
from pydantic import BaseModel


def _load_dotenv():
    """.env を読み、未設定の環境変数だけ埋める(依存なしの最小実装)。
    鍵をシェル履歴に残さず、`export` 無しで uvicorn を起動できるようにするため。
    探索順: server/.env(main.pyと同じ場所) → リポジトリ直下の .env。
    既に環境にある値は上書きしない(exportが優先)。"""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [os.path.join(here, ".env"), os.path.join(here, "..", ".env")]
    for path in candidates:
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value
        except FileNotFoundError:
            continue


_load_dotenv()

MODEL = os.environ.get("RS_QUIZ_MODEL", "claude-opus-5")

app = FastAPI()
# APIキーは環境変数 ANTHROPIC_API_KEY から解決される(未設定だと生成時にTypeError:
# "Could not resolve authentication method"。起動シェルで必ず export すること)。
client = anthropic.Anthropic()

SYSTEM = """あなたは読書支援ツール「reading-scaffold」の出題エンジンです。
与えられた本文の段落だけを根拠に、読者の理解を確かめる三択問題を1問だけ作ります。

原則:
- 問題文と選択肢は、段落本文と同じ言語で書く(英語の段落なら英語で、日本語なら日本語で)
- 段落に書かれている内容のみから出題する(外部知識やこの先の内容を要求しない)
- 読者を試すためではなく、理解を確かめて自信を持たせるための問題にする
- 責めない: ひっかけ・重箱の隅・曖昧な選択肢を作らない
- 教えない: 解説・教訓・褒め言葉は一切書かない。問題と選択肢だけで完結させる
- 簡潔に: 問題文は60字以内、選択肢は各30字以内を目安にする

出力は指定のJSONスキーマに従う。answer_index は正解の添字(0-2)。"""

QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "question": {"type": "string"},
        "choices": {"type": "array", "items": {"type": "string"}},
        "answer_index": {"type": "integer"},
    },
    "required": ["question", "choices", "answer_index"],
    "additionalProperties": False,
}

# 同一段落への再出題はキャッシュから(設計ドキュメント: キャッシュ必須)
_cache: OrderedDict[str, dict] = OrderedDict()
CACHE_MAX = 512


class QuizRequest(BaseModel):
    paragraph_text: str
    article_context: str | None = None


class AskContext(BaseModel):
    i: int
    text: str


class AskRequest(BaseModel):
    question: str
    selection: str | None = None
    context: list[AskContext] = []


ASK_SYSTEM = """あなたは読書支援ツール「reading-scaffold」の伴走者です。
読者が読書中に投げた問いに、渡された「読了済みの段落」だけを根拠に短く答えます。

原則(「照らす、答えない」):
- 必ず2〜3文で短く答える。長い説明・要約はしない
- 読者がまだ読んでいない先の内容には触れない(ネタバレ禁止)。渡された段落の範囲で答える
- 読書から連れ出さない: 雑談に応じない・話を広げない・次の問いを促さない
- 根拠になった段落があれば、その番号を source_index に返す(無ければ -1)
- 問いと同じ言語で答える

出力は指定のJSONスキーマに従う。"""

ASK_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "source_index": {"type": "integer"},
    },
    "required": ["answer", "source_index"],
    "additionalProperties": False,
}


@app.get("/healthz")
def healthz():
    return {"ok": True, "model": MODEL}


@app.post("/ask")
def ask(req: AskRequest):
    question = req.question.strip()[:300]
    if len(question) < 2:
        return {"ok": False, "error": "too_short"}

    ctx = "\n\n".join(f"[{c.i}] {c.text[:800]}" for c in req.context[:8])
    selection = (req.selection or "").strip()[:500]
    user = ""
    if selection:
        user += f"読者が選択している本文: {selection}\n\n"
    user += f"問い: {question}\n\n読了済みの段落:\n{ctx}"

    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=512,
            system=ASK_SYSTEM,
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default"},
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": ASK_SCHEMA},
            },
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.APIError as e:
        return {"ok": False, "error": type(e).__name__}
    except Exception as e:
        traceback.print_exc()
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

    answer = data.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return {"ok": False, "error": "empty_answer"}
    idx = data.get("source_index")
    if not isinstance(idx, int):
        idx = -1
    return {"ok": True, "answer": answer.strip(), "source_index": idx}


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
        traceback.print_exc()
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


# くまのうんちく(拡張の ai.js の TRIVIA_SYSTEM と同じ指示。片方を変えたらもう片方も)
# 2026-10-07: 楽長の口ずさみ「トォテテ テテテイ」に意味をでっち上げたので、擬音・口ずさみ・名前・造語を禁止し、
# 辞書・事典で確かめられることだけに絞った。言い切れないもの(sure=false)と擬音らしい言葉は返さない。
TRIVIA_SYSTEM = (
    "あなたは読書アプリのマスコット「くま」。読者がさっき読んだ本文から、「へぇ」となるうんちくを1つだけ話す。"
    "話題にしてよいのは次のどちらかだけ: (1)本文に出てきた、国語辞典に載っている言葉のうち、今では見慣れない言葉・古い言い回し・難しい漢字の意味や読み、"
    "(2)本文に出てきた実在の物・場所・習慣について、百科事典で確かめられる事実。"
    "次のものは絶対に話題にしない: 擬音語・擬態語・鳴き声、歌やメロディーの口ずさみ(カタカナの音の並びなど)、人や動物の名前、作者の造語、"
    "本文の文脈から推測しないと意味が分からない言葉。辞書や事典で確かめられる意味でなければ、推測で意味を言わない。"
    "少しでも自信がなければ sure を false にし、text を空文字にする。黙るのは失敗ではない。"
    "本文の先の展開・結末・登場人物のその後には触れない。本文の要約・感想・教訓・読者を褒める言葉・アドバイスは書かない。"
    "くまの口調でやさしく短く、1〜2文・全体で60字以内(例:「〜なんだって!」「〜らしいよ」)。"
    "term には話題にした本文中の言葉をそのまま入れる(なければ空文字)。"
    "kind は word(言葉の意味)・reading(漢字の読み)・fact(事実)のどれか。sure は辞書・事典で確かめられると言い切れるときだけ true。"
)

TRIVIA_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "term": {"type": "string"},
        "kind": {"type": "string", "enum": ["word", "reading", "fact"]},
        "sure": {"type": "boolean"},
    },
    "required": ["text", "term", "kind", "sure"],
    "additionalProperties": False,
}

_KANA_ONLY = re.compile(r"^[\u3040-\u30ff\u30fc\s\u3000・]+$")
_SOUNDISH = re.compile(r"(.)\1|(..)\2|\s|[っッ]$")


def _looks_like_sound(term: str) -> bool:
    """擬音や口ずさみらしい言葉(カタカナ/ひらがなだけで、繰り返し・空白を含むか「っ」で終わる)。"""
    t = term.strip()
    return bool(t) and bool(_KANA_ONLY.match(t)) and bool(_SOUNDISH.search(t))


_trivia_cache: OrderedDict[str, dict] = OrderedDict()


@app.post("/trivia")
def trivia(req: QuizRequest):
    text = req.paragraph_text.strip()[:2000]
    if len(text) < 60:
        return {"ok": False, "error": "too_short"}

    key = hashlib.sha256(text.encode()).hexdigest()
    if key in _trivia_cache:
        _trivia_cache.move_to_end(key)
        return {"ok": True, "trivia": _trivia_cache[key], "cached": True}

    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=512,
            system=TRIVIA_SYSTEM,
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default"},
            output_config={
                "effort": "medium",
                "format": {"type": "json_schema", "schema": TRIVIA_SCHEMA},
            },
            messages=[{"role": "user", "content": f"さっき読んだ本文:\n---\n{text}"}],
        )
    except anthropic.APIError as e:
        return {"ok": False, "error": type(e).__name__}
    except Exception as e:  # 認証未設定等。拡張側はJSONを期待するので500にしない
        traceback.print_exc()
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

    said = str(data.get("text", "")).strip()
    term = str(data.get("term", "")).strip()
    if not said or data.get("sure") is not True:
        return {"ok": False, "error": "nothing_certain"}  # 自信がないときは黙る
    if _looks_like_sound(term):
        return {"ok": False, "error": "soundish_term"}  # 擬音・口ずさみには意味を付けない
    if len(said) > 90:
        return {"ok": False, "error": "too_long"}
    out = {"text": said, "term": term[:20]}

    _trivia_cache[key] = out
    if len(_trivia_cache) > CACHE_MAX:
        _trivia_cache.popitem(last=False)
    return {"ok": True, "trivia": out}
