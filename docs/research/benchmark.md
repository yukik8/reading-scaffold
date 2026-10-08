# リサーチノート: 「補助なし読書時間」KPIの学術的妥当性とベンチマーク

> 調査時点のノート。現行の設計と数値は [../design.md](../design.md) を正とする。

作成: 2026-08-26 / 対象: reading-scaffold(補助が自動で減っていく読書用Chrome拡張)

---

## 1. 問い

自作KPI「補助なし読書時間」(= ヒント・演出が1回も出なかったセッションの読書時間の週次合計。読書時間は「本文段落が可視 かつ 直近30秒以内に操作あり」で操作的定義)は、
持続的注意・読書研究の既存測定法と照らして妥当か。どこに位置づき、「読む力が回復した」と言える数値基準は文献から引けるか。

サブクエスチョン:
1. 持続的注意の標準測定(SART/CPT)は何をどう測り、健常成人の典型値は?
2. Gloria Markの「2.5分→47秒」の原典・方法・正しい引用条件は?
3. 読書中mind-wandering(MW)の典型率と読解成績との関係は?
4. dwell time・スクロールは「実際に読んでいる」ことの代理指標としてどこまで妥当か?
5. 成人が連続して読める時間の正常値データは存在するか?
6. media multitaskingが注意を壊すという知見(Ophir et al. 2009)は再現されているか?

---

## 2. エビデンス

### 2.1 持続的注意の標準測定(SART・CPT/vigilance)

- **SARTの原典**: Robertson, Manly, Andrade, Baddeley & Yiend (1997) "'Oops!': Performance correlates of everyday attentional failures in traumatic brain injured and normal subjects." *Neuropsychologia*, 35(6), 747–758。数字1〜9を計225回連続提示(提示250ms+マスク900ms、課題全体で約4.3分)し、「3」(25回、全体の11%)のときだけキー押下を我慢させる Go/No-Go 課題。指標は**コミッションエラー**(No-Goで押してしまった率)= 注意の途切れの行動指標。
- **健常成人の典型値**: SARTではコミッションエラーが**No-Go試行の30〜50%**、オミッションエラーは5〜10%程度が通例(Carter et al. 2013; Head & Helton 2012 のレビュー的整理。Wilson, Finkbeiner, de Joux, Russell & Helton 2016, 大学生n=30 の再確認研究より)。つまり**健常者でも数分の課題で3〜5割は反応を止め損ねる**のが正常範囲。
- **Vigilance(警戒課題)**: Mackworth (1948) の時計課題以来、「**vigilance decrement**」= 検出成績が課題開始後30分で10〜15%低下、が古典的知見。近年の整理では**低下は最初の15分以内**(Teichner 1974)、負荷の高い課題では**5分以内**にも生じる(Helton et al. 2007)。
- **KPIへの含意**: 標準測定はいずれも「**数分〜数十分の実験課題でのエラー率**」であり、「連続して読める時間の長さ」を直接測る標準検査は**存在しない**。「補助なし読書時間」は既存の標準測定の代替ではなく、生態学的(実生活文脈)な行動指標という別カテゴリに属する。SART的な発想(=失敗イベントの頻度)をアプリ内では「離脱・タブ切替の頻度」として写像するのが対応関係として正しい。

### 2.2 Gloria Mark の「2.5分 → 47秒」

- **2004年の原典**: González & Mark (2004) "'Constant, constant, multi-tasking craziness': Managing multiple working spheres." *Proc. CHI 2004*, 113–120。**情報労働者24名**(アナリスト・開発者・マネージャ)を**ストップウォッチ持参のシャドーイング**で観察。結果: **1つのイベント(作業単位)平均約3分**、**1つのツール/文書は平均約2分強**で切替、テーマ単位の「working sphere」でも**約12分**で切替。※「2.5分」はMarkが講演・書籍で使う丸め値で、原論文の表現は「約3分/イベント」系の数値。
- **47秒/中央値40秒の原典**: コンピュータログ研究群。Mark, Iqbal, Czerwinski & Johns (2015) "Focused, Aroused, but so Distractible." *Proc. CSCW 2015*、および Mark et al. (2016) "Neurotics Can't Focus: An in situ Study of Online Multitasking in the Workplace." *Proc. CHI 2016*(**情報労働者40名を2週間ログ計測**)で、**1画面への注視持続の中央値40秒**。「平均47秒」は近年の複数研究をまとめた彼女の著書 *Attention Span* (2023) とインタビュー(APA Speaking of Psychology、Univ. of California News)での数値。経過は **2004年: 約2.5分 → 2012年: 75秒 → 2016年以降: 平均47秒(中央値40秒)**。
- **この数字の正体(引用時の注意書き)**:
  1. 測っているのは「**1つのスクリーン/ウィンドウに注意を向け続けてから切り替えるまでの時間**」であり、**読書時間でも注意力の容量でもない**。Mark自身これを "kinetic attention"(行動としての切替)と呼び、注意「能力」の低下の直接証拠ではないと明言。
  2. 対象は**職場の情報労働者**(2004年は24名、2016年は40名)。一般人口の代表標本ではない。
  3. **同一コホートの縦断ではない**。年代ごとに別サンプル・別手法(ストップウォッチ→PCログ)で、厳密な経年比較には限界がある。
  4. 同じ研究群で、**中断されるまで1つのプロジェクトに約10.5分**は集中できることも報告されている。「人間は47秒しか集中できない」という通俗的要約は誤読。

### 2.3 読書中のmind-wandering測定(Smallwood & Schooler系)

- **手法の原典**: Schooler, Reichle & Halpern (2004)(『戦争と平和』を読ませるzone-outパラダイム)。**self-caught**(気づいたら自己報告)と**probe-caught**(ランダムに問い掛けて捕捉)の2手法。総説は Smallwood & Schooler (2015) "The Science of Mind Wandering." *Annual Review of Psychology*, 66, 487–518。
- **典型率**: 読書などの教育的課題中、**プローブの20〜40%でMWが報告される**のが通例(Schooler et al. 2004; Smallwood & Schooler 2015)。日常生活全般では Killingsworth & Gilbert (2010, *Science*) の経験サンプリング(成人2,250名)で**起きている時間の46.9%**がMW。つまり**「読んでいる時間の2〜4割は上の空」が健常成人のベースライン**。
- **読解との相関(メタ分析)**: Bonifacci, Viroli, Vassura, Colombini & Desideri (2022) *Psychonomic Bulletin & Review*。25論文・73相関・N=3,926 のメタ分析で、**MWと読解成績の相関 r = −0.21**(probe型に限ると r = −0.23)。特性質問紙(trait型)で測るとほぼ無相関になる(+0.305の減衰)ため、**「その場でのprobe測定」だけが読解を予測する**。
- **KPIへの含意**: MW率は「読めているか」の**妥当性が確立した唯一のオンライン主観指標**。ただし効果量は中程度以下(r≈−0.2)なので、MW率単独でも読解単独でも不十分。行動ログ+軽量probe+理解チェックの三角測量が文献の標準。

### 2.4 行動ログ(dwell time・スクロール)の代理指標としての妥当性

- **Claypool, Le, Waseda & Brown (2001)** *Proc. IUI 2001*: カスタムブラウザで暗黙指標を収集。**滞在時間とスクロール量(とその組合せ)は明示的な興味評定と正の相関**。行動ログを興味・関与の代理にする研究系譜の出発点。
- **Guo & Agichtein (2012)** *Proc. SIGIR*: **dwell time単独は不十分**——ページを開いたまま見ていないケースを弁別できない。**カーソル移動・スクロールを併用**すると関連性推定が有意に改善。
- **Liu et al. (2014)** "From Skimming to Reading: A Two-stage Examination Model for Web Search." *Proc. CIKM 2014*: 閲覧行動は**スキミング段階と読み込み段階の2段階**でモデル化でき、dwellパターンから区別可能。
- **カーソル≒視線**: Leiva & Arapakis (2020, The Attentive Cursor Dataset, *Frontiers in Human Neuroscience*)ほか、マウスカーソルは視線の低コスト代理として一定の妥当性(特に検索結果ページ)。
- **KPIへの含意**: 本製品の操作的定義(段落可視+直近30秒以内の操作)は、**「dwellだけでなく操作の近接性を要求する」点でGuo & Agichtein以降のベストプラクティスに合致**する。残る弱点は (a) スクロールしながら読んでいない「機械的スクロール」、(b) 画面は見ているが理解していない状態。文献上の解は理解チェック/probeの併用のみ。

### 2.5 連続読書時間の「正常値」

- **結論を先に**: **「健常成人が一度に連続して読める時間」の分布を直接報告した学術データは、今回の調査では見つからなかった**。実験研究は課題時間を固定し(10〜40分)、時間そのものを従属変数にしない。e-リーダーのセッション長データはAmazon等の内部データで非公開。→ **KPIの絶対値を比較できる外部ゴールドスタンダードは存在しない**。これはKPIの弱点であると同時に、自前で分布を取る価値がある空白でもある。
- **近い代替データ(1日あたり読書時間)**: 米国 American Time Use Survey (BLS, 2023年調査): 15歳以上の**余暇読書は平均0.26時間/日(約16分)**。15–19歳は0.13時間(約8分)。75歳以上は0.76時間。American Academy of Arts & Sciences の分析では、**「1日20分超読む人」は2003年22.3% → 2023年14.6%に減少**、**84%は1日5分以下**。
- **深い読み vs スキミング**: Delgado, Vargas, Ackerman & Salmerón (2018) "Don't throw away your printed books." *Educational Research Review*: 54研究のメタ分析で**画面読解は紙より劣る(Hedges' g = −0.21)**。効果は説明文で顕著、時間制限下で拡大、**出版年が新しいほど拡大**——画面での浅い処理(shallowing)仮説を支持。Maryanne Wolf (*Reader, Come Home*, 2018) のdeep reading論はこの現象の理論的・啓蒙的枠組みだが、定量基準は提供しない。
- **KPIへの含意**: 「1セッション5分以上」という成功基準は、**平均的アメリカ人の1日の総読書量(16分)の1/3、84%の人の1日総量(≤5分)と同等**であり、初期目標として現実的。「回復」の絶対基準は文献から引けないため、**自前コホートの分布(中央値・p90)+外部の1日あたり統計**をアンカーにするしかない。

### 2.6 media multitaskingと持続的注意(再現性論争)

- **原典**: Ophir, Nass & Wagner (2009) "Cognitive control in media multitaskers." *PNAS*, 106(37)。質問紙で重度メディアマルチタスカー(HMM)と軽度(LMM)を極端群比較し、**HMMは妨害刺激のフィルタリングが劣る**と報告。
- **追試**: Wiradhany & Nieuwenstein (2017) *Attention, Perception, & Psychophysics*: 直接追試2件は「**方向は同じだが効果は著しく小さく、概ね非有意**」。同論文の39効果量のメタ分析で**d = 0.17(小)**。
- **Uncapher & Wagner (2018)** *PNAS* レビュー(原著者自身): 知見は混在、効果は小さく、**因果方向(マルチタスクが注意を壊すのか、注意散漫な人がマルチタスクするのか)は未確定**。
- **Wiradhany & Koerts (2021)** "'Cognitive Control in Media Multitaskers' Ten Years On: A Meta-Analysis." *Cyberpsychology*: 10年分を集約しても関連は小さく頑健でない。
- **KPIへの含意**: 「SNS・ショート動画で読む力が衰えた」という製品の前提は、**相関としては弱く支持、因果としては未証明**。プロダクト説明・発表では「注意が壊された証拠がある」ではなく「**切替行動が増えた観察(Mark)+読書時間の減少(ATUS)+画面読解の浅さ(Delgado)**」の組合せとして語るのが誠実で、反論にも強い。

---

## 3. 製品への反映

### ① KPI「補助なし読書時間」は守るべきか

**推奨: 骨格は守る。ただし2点を修正する。**

妥当性の根拠:
- 操作的定義(可視性+直近30秒の操作)は行動ログ研究のベストプラクティス(dwell単独を避け操作近接を要求)に合致(§2.4)。
- 「補助なし」= 外部足場なしの自立遂行、という構成は教育心理学のscaffolding fading(足場の漸減)と整合し、既存の標準検査が測っていない生態学的アウトカムを埋める(§2.1, §2.5)。

修正点:
1. **計測の交絡を除く**: 「ヒントが出なかったセッション」は、ユーザーの実力だけでなく**システム側の提示ポリシーにも依存**する(補助を減らせばKPIは自動的に上がる)。KPIを守るには「**補助が出る条件はユーザー行動のみで決まる(離脱・停滞で発火)**」ことを仕様として固定し、θ(習熟度)による提示頻度の操作分とは分離して集計すること。さもないと自作自演の指標になる。
2. **理解のガードレールを付ける**: 時間指標は「開いたまま」「機械的スクロール」に脆弱(Guo & Agichtein)。読書時間の一部サンプルに1問マイクロクイズ or MWプローブを重ね、**「補助なし読書時間 × 理解正答率」を対で報告**する。時間だけの最大化はMW率46.9%の世界では意味を持たない(§2.3)。

### ② 副次指標の推奨

採るべき(優先順):
1. **probe型MW率**(セッション中1回だけ「今、内容に集中してた?」)— 読解を予測する唯一のオンライン主観指標(r≈−0.23)。低頻度なら体験を壊さない。
2. **マイクロ理解チェック正答率** — 時間指標のゲーミング検出と「深い読み」の直接証拠。
3. **タブ切替・離脱回数/分** — Markの切替研究と直接比較可能な、SARTのエラー率に相当する失敗イベント頻度。既存の成功セッション定義(離脱≤1)とも連続。
4. **最長連続読書ストリーク(中央値とp90)** — 「連続で読める時間」の外部データ空白(§2.5)を自前で埋める。発表映えもする。
採らなくてよい: 特性質問紙型の集中度自己評価(オンライン成績と相関しない、§2.3)、スクロール深度単独(読了の証拠にならない、§2.4)。

### ③ 発表で使える比較基準と正確な但し書き

| 数字 | 出典 | 必須の但し書き |
|---|---|---|
| 画面上の注意持続 平均47秒/中央値40秒 | Mark et al. 2016 (CHI); Mark 2023 *Attention Span* | 情報労働者n=40の**1画面滞在時間**。読書時間でも注意容量でもない。同じ人がプロジェクト単位なら約10.5分持続 |
| 2004年は約3分/イベント | González & Mark 2004 (CHI) | n=24、ストップウォッチ・シャドーイング。別サンプル・別手法なので厳密な縦断比較ではない |
| 読書中のMWはプローブの20〜40% | Schooler et al. 2004; Smallwood & Schooler 2015 | 健常成人のベースライン。ゼロにはならない |
| MWと読解の相関 r = −0.21 | Bonifacci et al. 2022 メタ分析 | probe測定時のみ。効果量は中程度以下 |
| 余暇読書 平均16分/日、84%は5分以下 | 米BLS ATUS 2023 | 米国データ。1日総量であり連続時間ではない |
| 健常者でもSARTのNo-Go失敗30〜50% | Robertson et al. 1997系 | 数分の実験課題。注意の途切れは正常でも高頻度 |
| 画面読解は紙より g=−0.21 劣る | Delgado et al. 2018 メタ分析 | 説明文・時間制限下で顕著。物語文では差が出ない |

**「回復した」の数値基準(文献に外部基準はないため、製品定義として提案)**:
- レベル1(成立): 週の成功セッション(≥5分・離脱≤1)が安定して出る — ATUSの「大多数の1日総量≤5分」を1セッションで超える水準。
- レベル2(自立): 補助なしセッションが読書時間の80%以上を4週継続、かつ連続ストリーク中央値 ≥10分 — Markの「中断までのプロジェクト集中≈10.5分」をアンカーにした水準。
- レベル3(回復): 補助なし読書 週60分以上(= ATUS「intensive reader」の20分/日×3日相当)+ 理解チェック正答率がベースライン比で非劣化。
- 但し書きテンプレ: 「これらの閾値は外部規準が存在しないため当プロダクトの操作的定義であり、Mark(切替行動)・ATUS(日次総量)の公表値をアンカーとして設定した」。

---

## 4. 引用元

### 持続的注意
- Robertson, I. H., Manly, T., Andrade, J., Baddeley, B. T., & Yiend, J. (1997). 'Oops!': Performance correlates of everyday attentional failures. *Neuropsychologia*, 35(6), 747–758. https://www.sciencedirect.com/science/article/abs/pii/S0028393297000158
- Wilson, K. M., et al. (2016). Go-stimuli proportion influences response strategy in the SART. https://pmc.ncbi.nlm.nih.gov/articles/PMC5025487/ (典型エラー率30–50%の整理を含む)
- Mackworth Clock / vigilance decrement 概説: https://en.wikipedia.org/wiki/Mackworth_Clock / https://en.wikipedia.org/wiki/Vigilance_Theory

### Gloria Mark
- González, V. M., & Mark, G. (2004). "Constant, constant, multi-tasking craziness." *Proc. CHI 2004*. https://dl.acm.org/doi/10.1145/985692.985707 / PDF: https://ics.uci.edu/~gmark/CHI2004.pdf
- Mark, G., Iqbal, S., Czerwinski, M., & Johns, P. (2015). Focused, Aroused, but so Distractible. *Proc. CSCW 2015*. https://dl.acm.org/doi/10.1145/2675133.2675221
- Mark, G., et al. (2016). Neurotics Can't Focus: An in situ Study of Online Multitasking in the Workplace. *Proc. CHI 2016*. https://scholars.houstonmethodist.org/en/publications/neurotics-cant-focus-an-in-situ-study-of-online-multitasking-in-t
- Mark, G. (2023). *Attention Span*. Hanover Square Press. 解説: https://www.universityofcalifornia.edu/news/cant-pay-attention-youre-not-alone / https://www.apa.org/news/podcasts/speaking-of-psychology/attention-spans

### Mind-wandering
- Smallwood, J., & Schooler, J. W. (2015). The Science of Mind Wandering. *Annu. Rev. Psychol.*, 66, 487–518. https://labs.psych.ucsb.edu/schooler/jonathan/sites/labs.psych.ucsb.edu.schooler.jonathan/files/pubs/the_science_of_mind_wandering.pdf
- Schooler, J. W., Reichle, E. D., & Halpern, D. V. (2004). Zoning out while reading. In *Thinking and Seeing* (MIT Press). https://www.researchgate.net/publication/313005175
- Bonifacci, P., et al. (2022). Mind wandering and reading comprehension: A meta-analysis. *Psychon. Bull. Rev.* https://pmc.ncbi.nlm.nih.gov/articles/PMC9971160/
- Killingsworth, M. A., & Gilbert, D. T. (2010). A wandering mind is an unhappy mind. *Science*, 330, 932.

### 行動ログの妥当性
- Claypool, M., et al. (2001). Implicit interest indicators. *Proc. IUI 2001*. https://www.researchgate.net/publication/220723854
- Guo, Q., & Agichtein, E. (2012). Beyond dwell time: estimating document relevance from cursor movements. *Proc. SIGIR/WWW*. 概説: https://www.researchgate.net/publication/296633585
- Liu, Y., et al. (2014). From Skimming to Reading. *Proc. CIKM 2014*. https://dl.acm.org/doi/10.1145/2661829.2661907
- Leiva, L. A., & Arapakis, I. (2020). The Attentive Cursor Dataset. *Front. Hum. Neurosci.* https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2020.565664/full

### 読書時間・深い読み
- BLS American Time Use Survey 2023. https://www.bls.gov/news.release/archives/atus_06272024.htm
- American Academy of Arts & Sciences, Humanities Indicators: Time Spent Reading. https://www.amacad.org/humanities-indicators/public-life/time-spent-reading
- Delgado, P., et al. (2018). Don't throw away your printed books. *Educ. Res. Rev.* PDF: https://www.uv.es/lasalgon/papers/Delgado%202018%20dont%20throw%20away%20your%20printed%20books.pdf
- Wolf, M. (2018). *Reader, Come Home: The Reading Brain in a Digital World*. Harper.

### media multitasking
- Ophir, E., Nass, C., & Wagner, A. D. (2009). Cognitive control in media multitaskers. *PNAS*, 106(37).
- Wiradhany, W., & Nieuwenstein, M. R. (2017). Two replication studies and a meta-analysis. *Atten. Percept. Psychophys.* https://link.springer.com/article/10.3758/s13414-017-1408-4
- Uncapher, M. R., & Wagner, A. D. (2018). Minds and brains of media multitaskers. *PNAS*. https://www.pnas.org/doi/10.1073/pnas.1611612115
- Wiradhany, W., & Koerts, J. (2021). "Cognitive Control in Media Multitaskers" Ten Years On: A Meta-Analysis. *Cyberpsychology*, 15(2). https://cyberpsychology.eu/article/view/13303

### 調査で「見つからなかった」もの(明記)
- 健常成人の「連続読書時間」の分布・正常値を直接報告する学術研究: **発見できず**(実験は課題時間固定、業界データは非公開)。
- Robertson et al. 1997 の健常対照群の正確な平均コミッションエラー数(原文パラグラフ単位): 原文PDFに到達できず、後続研究の引用値(30–50%)で代替。
- 「2.5分(2004)」という正確な数値の原論文内での記載: 原論文の報告は「約3分/イベント」であり、2.5分はMark本人の講演・書籍での丸め値と判断。

---

## 5. 意思決定記録(2026-08-31)

本ノートの「製品への反映」§3を受けた議論の結果:

- **プローブ案(却下):** §3①の交絡(補助を減らすだけでKPIが自動上昇する)への対策として、ランダムに選んだセッションでθに関係なく補助を全停止する「サイレントプローブ」を検討したが**却下**。理由: 測定のために体験を犠牲にする。高θ期(=最も脆弱な時期)に静かなセッションが混ざることは本人の不快・挫折リスクに直結する。
- **採用: 「週次目標の達成率 × θ推移」の対報告。** 成功セッション数は補助があっても増えるため単独では証拠にならないが、「達成率を保ったままθが下がり続ける」ことは補助への非依存の証拠になり、交絡を測定条件の変更なしで回避できる。θを下げると達成が崩れるなら機構の失敗、と反証可能性も残る。主図は「達成率フラット×θ右肩下がり」の二軸グラフ。
- **「補助なし読書時間」の位置づけ:** 主KPIから、θが0に近づいた卒業段階の確認指標へ降格(θ≈0では定義上ほぼ全セッションが補助なしになり、交絡が消えるため)。
- **段階別目標(§3③の3段階を週次目標化):** レベル1=成功セッション週3回 / レベル2=週5回+ストリーク中央値10分 / レベル3=週60分+理解非劣化。
- **派生する設計変更:** オンボーディングに ①診断→初期θ(結果をスコアとして本人に言い渡さない) ②目標の自己設定(プリセットから選択。KPIの分母になる)を置く。目標は制御器に入れない・未達で責めない(達成率はダッシュボード限定表示)。
- **制御と評価の分離:** 制御器のsuccess定義(5分・離脱≤1)は固定。段階で厳しくなるのは評価用目標のみ。
