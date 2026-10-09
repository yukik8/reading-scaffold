# ストア用の素材を作る道具

Puppeteer で、拡張の実物(`extension/src/content/bear.js` のくま・ダッシュボード)から画像を描く。リポジトリには依存を置かないので、`puppeteer` の入った作業用フォルダを `S` で渡す。

```bash
S=/path/to/dir-with-node_modules            # npm i puppeteer したフォルダ
S=$S OUT=.. node promo.js                    # docs/store/promo-440x280.png(と 3 倍の promo-preview.png)
S=$S node dash.js ../screenshot-1-dashboard-1280x800.png 1280   # 見本データ入りのダッシュボード 2 枚
```

- **アイコン(2026-10-09〜):** `python3 -I tools/bear-sprites/icons.py docs/style/ref/icon-sheet.png` で、アイコンの1枚絵のサイズ別の絵から `extension/icons/icon-{16,32,48,128}.png` を作る(Puppeteer は要らない)。`icons.js`・`face.svg.js` は旧テーマの SVG のくま(`bearSVG`、もう無い)を描く道具で、もう動かない
- `promo.js` はくまの SVG を `OUT/icon.svg` から読む旧テーマのまま。プロモーション タイルとスクリーンショットは、新しいテイスト(docs/style.md)で作り直す
- Play ブックスで読んでいる最中のスクリーンショットは、本物の Play ブックスで撮る(本文が写るので、パブリックドメインの本で)
