# server(v0後半)

FastAPI。クイズ(理解連動Micro Content)と、自分からの問いへの回答をLLMに中継する。
APIキーはサーバのみが持ち、拡張には渡さない。第一候補はChrome内蔵AI(Gemini Nano・
完全オンデバイス)で、それが使えない環境のフォールバックがこのサーバ。

## 起動

```bash
cd server
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # 初回のみ
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env                             # 鍵はここに(初回のみ)
./.venv/bin/uvicorn main:app --port 8787
```

`ANTHROPIC_API_KEY` は必須。`server/.env`(KEY=VALUE 形式)に置けば起動時に自動で
読み込まれる — `export` は不要。`.env` は `.gitignore` 済みでコミットされない。
`export ANTHROPIC_API_KEY=...` でシェルに直接入れてもよい(その場合はexportが優先)。
未設定のままだと `/quiz`・`/ask` が `{"ok": false, "error": "TypeError"}`
(認証方法を解決できない)を返す。

モデルは既定で `claude-opus-5`(環境変数 `RS_QUIZ_MODEL` で変更可)。
分類器の誤検知に備えてサーバ側フォールバック(`fallbacks: "default"`)を有効化済み。

| エンドポイント | 役割 |
|---|---|
| `GET /healthz` | 生存確認 |
| `POST /quiz` | `{paragraph_text}` → 三択の理解問題(JSON)。同一段落はキャッシュから返す |
| `POST /ask` | `{question, selection?, context[]}` → 短い回答(2〜3文)+根拠段落番号。読了済み段落だけを根拠にする |

受け取らないもの: 生イベントログ、記事本文の保存(受けた段落は保存もログもしない)、
URL全体、ページタイトル、アカウント情報。

拡張側の挙動: サーバが落ちていても読書は壊れない(クイズ枠は静かに流れる)。
