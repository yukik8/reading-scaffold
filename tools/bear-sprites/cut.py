#!/usr/bin/env python3
"""ポーズ集の1枚絵から、くまを1体ずつ切り抜いて extension/assets/bear/<id>.webp に書き出す。

    python3 -I tools/bear-sprites/cut.py docs/style/ref/pose-sheet.png [--sheet out.png]

- 箱(POSES)は 1536×1024 の絵で測った座標。絵の大きさが違えば比例で直す
- 地(生成りの紙)は、箱の縁から塗りつぶして消す。線で囲まれた内側(本のページなど)は残す
- 箱の中の小さな飾り(「!」・効果線・きらきら)は、一番大きい塊から離れていれば捨てる
- 1体ずつの高解像度の絵が来たら、ここの箱を外して丸ごと同じ処理に通せばよい
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'extension' / 'assets' / 'bear'
REF = (1536, 1024)

# id: (x0, y0, x1, y1) か ((x0, y0, x1, y1), {'keep': 'all'})。ポーズ集の見出しの名前を添える。
# keep='all' は離れた部品(電球・虹など)も残す。ふだんは一番大きい塊とそれに触れるものだけ
POSES = {
    # 基本の姿
    'front': (22, 92, 172, 228),  # 正面
    'back-view': (296, 96, 410, 228),  # 後ろ
    # 表情(顔だけ・下が平ら。画面の下の縁から顔を出すのに使う)
    'head': (470, 52, 558, 118),  # 通常
    'head-blink': (574, 52, 662, 118),  # まばたき
    'head-smile': (780, 52, 870, 118),  # すこし嬉しい
    # 読書中のポーズ
    'read': (24, 282, 156, 398),  # 読む(正面)
    'read-side': (160, 282, 282, 398),  # 読む(横)
    'read-prone': (290, 282, 436, 398),  # うつぶせで読む
    'chin': (440, 282, 566, 398),  # 本に顎のせ
    'read-lying': (574, 282, 736, 398),  # ねそべって読む
    'focus': (740, 282, 866, 398),  # 集中中
    'turn-page': (874, 282, 990, 398),  # ページめくり
    'think-read': (994, 282, 1126, 398),  # 考えながら読む
    'sleep-book': (1132, 320, 1258, 390),  # 本の上で寝る
    'tower': (1272, 286, 1388, 390),  # 積読の上
    'turn': (1404, 282, 1504, 384),  # 振り向く
    # ちいさなリアクション
    'hyo': (52, 494, 124, 552),  # ひょっ(左の縁から)
    'ear': (140, 462, 238, 552),  # 耳ぴこ(左の縁から)
    'chira': (236, 484, 346, 552),  # ちらっ
    'idea': ((350, 450, 464, 556), {'keep': 'all'}),  # ひらめき(電球ごと)
    'hop': (484, 450, 586, 556),  # ぴょん
    'flat': (830, 450, 950, 556),  # べた
    'what': (1110, 450, 1220, 556),  # なにそれ?
    # フィーバー・読了時のアニメーション用ポーズ
    'wait': (30, 676, 136, 766),  # 待機
    'surprise': (146, 636, 262, 766),  # びっくり
    'jump': (276, 632, 400, 756),  # ジャンプ開始
    'launch': (404, 648, 522, 756),  # 射出
    'spin': (488, 612, 694, 774),  # 空中で回転(虹に乗る)
    'tumble': (696, 636, 866, 776),  # くるくる
    'fall': (1124, 664, 1206, 745),  # 落下
    'land': (1236, 676, 1376, 766),  # 着地
    'back': (1386, 662, 1514, 766),  # 元に戻る
    # 小物
    'mug': (30, 896, 104, 968),  # マグカップ
    'flag': (110, 846, 232, 1000),  # フラグ
    'stack': (194, 872, 290, 968),  # 積読
    'box': (504, 860, 612, 968),  # 箱に入る
    'nozoku': (622, 860, 706, 970),  # のぞく(左の縁から)
    # シルエット(先触れ)
    'sil-front': (884, 848, 932, 910),
    'sil-lie': (1058, 856, 1110, 906),
    'sil-sit': (884, 924, 932, 980),
    # エフェクト素材
    'book': (1424, 936, 1494, 986),  # 開いた本(卒業したら本だけが残る)
}

TOL = 30  # 地とみなす色の距離
EDGE = 110  # 縁の画素の不透明度: 地からの距離 / EDGE


def cut(sheet: np.ndarray, box, scale, keep_all=False):
    x0, y0, x1, y1 = (round(v * s) for v, s in zip(box, scale * 2))
    rgb = sheet[y0:y1, x0:x1, :3].astype(np.float32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))

    # 箱の縁につながる「地の色」の領域だけが地(線で囲まれた内側は残す)
    near = dist < TOL
    lab, _ = ndimage.label(near)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    ground = np.isin(lab, edge_labels[edge_labels > 0])
    fg = ~ground

    # 一番大きい塊と、それに触れる・十分大きい塊だけを残す(離れた飾りを捨てる)
    lab, n = ndimage.label(fg)
    if n == 0:
        raise SystemExit(f'empty crop {box}')
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    keep = lab == main
    near_main = ndimage.binary_dilation(keep, iterations=3)
    for i, size in enumerate(sizes, start=1):
        if i == main:
            continue
        if keep_all and size >= sizes[main - 1] * 0.01:
            keep |= lab == i
        elif size >= sizes[main - 1] * 0.06 and (near_main & (lab == i)).any():
            keep |= lab == i
    keep = ndimage.binary_fill_holes(keep)

    # 縁は地との混ざり具合で半透明に。色は地を差し引いて戻す(生成りのふちを残さない)
    band = keep & ndimage.binary_dilation(~keep, iterations=2)
    alpha = keep.astype(np.float32)
    alpha[band] = np.clip(dist[band] / EDGE, 0, 1)
    a = np.maximum(alpha, 1e-3)[..., None]
    color = np.where(band[..., None], np.clip(bg + (rgb - bg) / a, 0, 255), rgb)

    ys, xs = np.nonzero(alpha > 0.02)
    pad = 4
    t, b = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + pad + 1)
    l, r = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + pad + 1)
    out = np.dstack([color[t:b, l:r], alpha[t:b, l:r] * 255]).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def contact(images, path):
    """切り抜きの確認用: 濃い地と薄い地に並べる。"""
    cell = 180
    cols = 6
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell, rows * cell * 2), (60, 70, 90, 255))
    light = Image.new('RGBA', (cols * cell, rows * cell), (246, 240, 230, 255))
    sheet.paste(light, (0, rows * cell))
    for i, (name, im) in enumerate(images):
        k = min((cell - 20) / im.width, (cell - 20) / im.height, 2)
        big = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        x = (i % cols) * cell + (cell - big.width) // 2
        y = (i // cols) * cell + (cell - big.height) // 2
        sheet.alpha_composite(big, (x, y))
        sheet.alpha_composite(big, (x, y + rows * cell))
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--sheet', help='確認用の一覧画像の書き出し先')
    ap.add_argument('--only', nargs='*')
    args = ap.parse_args()
    img = Image.open(args.src).convert('RGBA')
    sheet = np.asarray(img)
    scale = (img.width / REF[0], img.height / REF[1])
    OUT.mkdir(parents=True, exist_ok=True)
    done = []
    for name, spec in POSES.items():
        if args.only and name not in args.only:
            continue
        box, opts = spec if isinstance(spec[0], tuple) else (spec, {})
        im = cut(sheet, box, scale, keep_all=opts.get('keep') == 'all')
        # 2倍に引き伸ばしておく(ブラウザの拡大より輪郭がにじみにくい)
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        im.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6)
        done.append((name, im))
        print(f'{name:12s} {im.width}x{im.height}')
    if args.sheet:
        contact(done, args.sheet)


if __name__ == '__main__':
    main()
