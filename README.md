# reading-scaffold

Google Play ブックス(ウェブ版)で本を読む時間を支える Chrome 拡張(作業リポジトリ / 製品名は未定)。

読む力を意志力ではなく環境で支えて、その支え(ヒント・くまの演出・突然クイズ)を本人が気づかない速度で減らしていく。
効果は **「週次目標の達成率 × θ(補助量)の推移」** の対で測る — 達成を保ったまま補助が
減り続けなければ機構の失敗と判定する(KPIの経緯と根拠: [docs/research/benchmark.md](docs/research/benchmark.md) §5)。

- 全体像(最初に読む): [docs/overview.md](docs/overview.md)
- 設計(一次資料): [docs/architecture-v1.md](docs/architecture-v1.md) — 三分法(演出/記録/道具)・θ一本の漸減・不変条件
- データ設計: [docs/data-design.md](docs/data-design.md)
- プライバシーポリシー(公開用): [PRIVACY.md](PRIVACY.md)
- うんちくサーバと Vercel へのデプロイ: [server/README.md](server/README.md)
- ステータス: v0.21 / Play ブックス専用。Chrome ウェブストア公開の準備中

## 原則(コードで守るもの)

1. **ページを改変しない。** 追加するのは Shadow DOM 内のオーバーレイのみ。演出は本文の外(余白)に描き、文字の上に重ねない。
2. **計測はセッション中のみ。** 「読む」を押してから終えるまで。タブ観測の全ハンドラは最初にセッションの存在を確認し、無ければ何も読まず何も書かずに戻る(判断の詳細は [session.js](extension/src/background/session.js) 冒頭)。
3. **θの目標値は常に0。** エンゲージメント指標を制御器の入力にしない(スロットマシン化の構造的禁止)。演出の量と派手さはθに比例し、θ=0では何も出さない。
4. **本の本文は端末の外へ出さない。** Google Play の規約で購入した本の送信・再配布は禁止のため。クイズと問いへの答えは端末内の Gemini Nano だけで作る。うんちくのサーバへ送るのは、本人が同意したときに限り、端末で選んだ単語の候補だけ。
5. **記録はローカルのみ。** 計測・読書メモリは IndexedDB に留め、サーバへは出さない。

## 構成

```
extension/            Chrome 拡張(MV3・ビルド不要の ES モジュール)
  manifest.json       権限は scripting / storage / alarms と Play ブックスの2ホストだけ
  src/background/     Service Worker: セッション状態機械・制御器・IndexedDB・内蔵AI(ai.js)・うんちくサーバ(server.js)
  src/content/        セッション中だけ注入される content script(計測・余白の演出・くま・突然クイズ・読了フィナーレ)
  src/popup/          「読む」ボタンと今週の様子
  src/onboarding/     初回の診断・目標・うんちくのサーバの同意
  src/dashboard/      本棚・帯・推移・データ管理
  src/shared/         設定(config.js)とイベント型
server/               うんちくサーバ(FastAPI・Vercel)。単語の候補だけを受ける
docs/                 設計ドキュメント(古い版は docs/archive/)
```

## 動かす

ビルド工程は意図的に置いていない。`chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」で `extension/` を選べばそのまま動く。

- 開発中の拡張はローカルのうんちくサーバ(`http://127.0.0.1:8787`)を呼ぶ。起動は [server/README.md](server/README.md)。
- ストア版(manifest に `update_url` が付く)は本番のサーバを呼び、開発用の機能(θの手動上書き・デモ・デモデータ投入・開始通知のθ表示)を出さない。切り替えは `extension/src/shared/config.js` の `IS_STORE_BUILD`。
- クイズと問いには Chrome の内蔵AI(Gemini Nano・Chrome 138 以降)が要る。ダッシュボードの「内蔵AIを確認・準備」でダウンロードを始められる。

## ストアに出す zip

```bash
cd extension && zip -r ../reading-scaffold-$(node -p "require('./manifest.json').version").zip manifest.json src -x '*.DS_Store'
```

docs・server・.git は入れない。zip を展開したものを「パッケージ化されていない拡張機能」として読み込み、動作を確かめてから申請する。
