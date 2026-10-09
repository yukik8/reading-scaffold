# ストア用の素材を作る道具

```bash
python3 -I tools/bear-sprites/icons.py docs/style/ref/icon-sheet.png   # extension/icons/icon-{16,32,48,128}.png(リポジトリの一番上で)
S=/path/to/dir-with-node_modules                                         # npm i puppeteer したフォルダ
S=$S node dash.js ../screenshot-1-dashboard-1280x800.png 1280             # 見本データ入りのダッシュボード 2 枚(このフォルダで)
```

- アイコンは、アイコンの1枚絵(`docs/style/ref/icon-sheet.png`)のサイズ別の絵から作る。16/32px は小さい用に描き分けた絵を使う
- `dash.js` は拡張の実物のダッシュボードを撮る(Puppeteer。リポジトリには依存を置かないので、`puppeteer` の入った作業用フォルダを `S` で渡す)
- プロモーション タイル 440×280 は、新しいテイスト(docs/style.md)で作り直す(旧テーマの `promo.js` と画像は 2026-10-09 に消した)
- Play ブックスで読んでいる最中のスクリーンショットは、本物の Play ブックスで撮る(本文が写るので、パブリックドメインの本で)
