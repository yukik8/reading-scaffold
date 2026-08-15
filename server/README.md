# server(v0後半)

FastAPI。v0前半はここを使わずに完結する(定型文ヒント+ローカル集計)。

| エンドポイント | 役割 |
|---|---|
| `POST /hint` | `{paragraph_text, article_context}` → 一行の理解フック。APIキーはサーバのみが持つ |
| `POST /metrics` | 週次の派生指標を匿名IDで受ける |

受け取らないもの: 生イベントログ、記事本文の保存、URL全体、ページタイトル、アカウント情報。
`/metrics` が受けるのは `{ week, unassisted_read_min, assisted_read_min, sessions, escape_rate, level }` だけ。
