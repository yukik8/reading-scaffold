# server(v0後半)

FastAPI。クイズ(理解連動Micro Content)の生成をLLMに中継する。
APIキーはサーバのみが持ち、拡張には渡さない。

## 起動

```bash
cd server
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # 初回のみ
export ANTHROPIC_API_KEY=sk-ant-...
./.venv/bin/uvicorn main:app --port 8787
```

モデルは既定で `claude-opus-5`(環境変数 `RS_QUIZ_MODEL` で変更可)。
分類器の誤検知に備えてサーバ側フォールバック(`fallbacks: "default"`)を有効化済み。

| エンドポイント | 役割 |
|---|---|
| `GET /healthz` | 生存確認 |
| `POST /quiz` | `{paragraph_text}` → 三択の理解問題(JSON)。同一段落はキャッシュから返す |

受け取らないもの: 生イベントログ、記事本文の保存(受けた段落は保存もログもしない)、
URL全体、ページタイトル、アカウント情報。

拡張側の挙動: サーバが落ちていても読書は壊れない(クイズ枠は静かに流れる)。
