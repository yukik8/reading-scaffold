# ストア用の素材を作る道具

Puppeteer で、拡張の実物(`extension/src/content/bear.js` のくま・ダッシュボード)から画像を描く。リポジトリには依存を置かないので、`puppeteer` の入った作業用フォルダを `S` で渡す。

```bash
S=/path/to/dir-with-node_modules            # npm i puppeteer したフォルダ
S=$S node icons.js                           # extension/icons/icon-{16,32,48,128}.png と icon.svg・sheet.png(見比べ用。icons/ から消す)
S=$S OUT=.. node promo.js                    # docs/store/promo-440x280.png(と 3 倍の promo-preview.png)
S=$S node dash.js ../screenshot-1-dashboard-1280x800.png 1280   # 見本データ入りのダッシュボード 2 枚
```

- 128/48px はくまの peek(本から顔を出す)、32/16px は `face.svg.js` の顔だけ(小さいと本やリボンがつぶれる)
- `promo.js` はくまの SVG を `OUT/icon.svg` から読む。先に `icons.js` を回しておく
- Play ブックスで読んでいる最中のスクリーンショットは、本物の Play ブックスで撮る(本文が写るので、パブリックドメインの本で)
