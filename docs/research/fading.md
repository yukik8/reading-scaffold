# リサーチノート: 「気づかれない速度で補助を減らす」の学術的根拠

作成: 2026-08-26 / 対象: θ制御則(成功で×0.9、失敗2連続で×1.3、±10%ノイズ、日次±15%上限、θ<0.3で卒業、卒業後ホメオスタット)

---

## 1. 問い

1. 「本人が気づかない速度で補助を漸減する」という設計に、前例・実証はあるか。
2. JND(丁度可知差異)未満の漸進的変化という発想は、どの分野で機能した実績があるか。
3. α=10%(成功時減衰)/β=30%(失敗時復元)/日次±15%というパラメータに文献的根拠を与えられるか。
4. θ制御器・卒業後ホメオスタットを学術系譜のどこに位置づけられるか。

---

## 2. エビデンス

### 2.1 教育のscaffolding fading

**Wood, Bruner & Ross (1976)** "The Role of Tutoring in Problem Solving" (Journal of Child Psychology and Psychiatry, 17, 89–100)。scaffoldingの原典。3〜5歳児の積木課題で、チューターの6機能(興味の喚起、自由度の削減、方向維持、重要特徴のマーキング、フラストレーション制御、モデル提示)を同定。被引用約9,000回。ただし**この論文にfadingの速度規則はない**。支援は「子どもの現在の能力に応じて(contingently)」調整せよ、としか言っていない。

**van de Pol, Volman & Beishuizen (2010)** "Scaffolding in Teacher–Student Interaction: A Decade of Research" (Educational Psychology Review, 22, 271–296)。scaffoldingの3要素を **contingency(随伴性)→ fading(漸減)→ transfer of responsibility(責任移譲)** と定式化。重要な結論: (a) fadingは目的でなく手段で、contingentに(=学習者の理解度に応じて)行われたときのみ責任移譲に至る。(b) **効果検証研究は少なく、fadingの「速度」を定量的に規定した実証は存在しない**。「何%ずつ」という数値規則は教育学の一次文献にはない、というのが正直な結論。

**ITSでの適応的fading — Salden, Aleven, Schwonke & Renkl (2010)** "The expertise reversal effect and worked examples in tutored problem solving" (Instructional Science, 38, 289–307)。幾何のCognitive Tutorで、worked example(解答例)のステップを問題解決に置き換えていくfadingを、(1)なし、(2)固定スケジュール、(3)個々の生徒の理解度に適応、の3条件で比較(実験室+実授業)。**適応的fadingが遅延転移テストで最良**。含意: fadingは「固定スケジュールより成功判定駆動」が実証的に優位 — 本製品の「成功セッションごとに減らす」設計と同型。理論的根拠はKalyugaらの**expertise reversal effect**(熟達者には補助が逆に有害になる)。

**Koedinger & Aleven (2007)** "Exploring the Assistance Dilemma in Experiments with Cognitive Tutors" (Educational Psychology Review, 19, 239–264)。「いつ補助を与え、いつ差し控えるか」を**assistance dilemma**と命名し、Cognitive Tutor系実験を統合レビュー。補助過多は記憶形成と生成活動を阻害、補助過少は徒労と挫折を生む。θの最適制御はこのdilemmaの連続値版と位置づけられる。

**ABAのプロンプトフェイディング**。応用行動分析では prompt fading / errorless learning / 刺激統制の転移(transfer of stimulus control)として体系化され、「段階的なプロンプト除去は急な除去より習得・維持に優る」が標準的知見(most-to-least prompting、time delay法など)。ここでも減衰は「正反応の安定」を条件とするのが定石で、%規則ではなく成功随伴。※二次資料で「147研究のメタ分析で6ヶ月後保持73%改善」という記述を見たが一次文献を確認できなかったため、この数値は引用しないこと。

### 2.2 JND未満の漸進的変化の実証(最重要)

**Girgis et al. (2003)** "A one-quarter reduction in the salt content of bread can be made without detection" (European Journal of Clinical Nutrition, 57, 616–620)。シドニーRoyal North Shore病院職員110名の単盲検RCT。介入群は**毎週5%ずつ累積で6週間、計25%減塩**したパンを喫食。介入群が「塩味が変わった」と報告する率は対照群と差なし(P=0.8)、風味・好意度スコアも差なし。**「週5%・累積25%は検知されない」を示した最重要の一次実証**。本製品のα=10%/セッションの直接のアナロジー。

**英国FSA/Action on Saltの国家的減塩プログラム(2003–2011)**。He & MacGregorらが主導。80以上の食品カテゴリに自主的削減目標を設定し、**段階的(stepwise)に、消費者の味覚が順応する時間を置いて**再フォーマット。結果: 人口平均塩分摂取は**9.5→8.1 g/日(2003→2011、−15%)**、2014年には7.58 g/日(−19%)。同期間に血圧が平均**3.0/1.4 mmHg低下**、脳卒中死亡**−42%**、虚血性心疾患死亡**−40%**(He, Pombo-Rodrigues & MacGregor 2014, BMJ Open; 死亡低下は禁煙等の交絡を含む生態学的関連で、全てが減塩の効果ではない点に注意)。パンは英国人の塩分最大摂取源で、2001–2011年に市販パンの塩分は約2割低下(Brinsden et al. 2013, BMJ Open)。**国家規模で「気づかれない漸減」が機能した唯一級の事例**。

**追試と限界**: 豪州先住民コミュニティでの検知実験(McMahon et al. 2016, Nutrients)では一斉(非漸進)比較で12.5%減は検知されにくいが25%一括は検知されうる、という結果 — **「一括25%は気づかれるが、漸進なら気づかれない」の裏づけ**。チュニジアのパイロット(2021, PMC7915252)では**漸進的に35%減塩しても消費者に検知されず**。

**砂糖は塩より難しい**: チョコレート風味乳のJND研究(Pineli et al. 2017, PubMed 28460937)は漸進的減糖の推奨ステップをJNDから逆算。一方コーラのJND研究(Valicente et al. 2023, Journal of Sensory Studies)は**「コーラでは小さな砂糖変化でも気づかれる」**と報告 — JNDは刺激・文脈依存で、10%が常に安全とは限らない反証。業界実務では12–24ヶ月かけた漸進的減糖が標準。

**ポーションサイズ**: 主食の皿サイズを縮小しても完全な代償摂食は起きず総摂取が減る(Sharp et al. 2020, IJBNPA)。漸進的縮小は「正常なサイズ」の知覚基準そのものをシフトさせる(norm range model, Robinson et al.)。ただし6ヶ月自由生活試験では昼食は減っても総日摂取量の有意減なし、という不完全な結果もある(代償の存在)。

**総括**: 「JND未満の漸進変化で行動・摂取を変える」は食品再フォーマット分野で**stealth reformulation**としてRCT+国家規模の実証を持つ。Weber-Fechner的な「現在量の一定割合なら気づかれない」がまさに設計原理として明文化されている(FSAの文書に「味覚順応の時間を置いた段階的削減」)。ただしJND比率は感覚モダリティと文脈で変動する。

### 2.3 臨床の漸減(タペリング)

**ベンゾジアゼピン — Ashtonプロトコル(Ashton Manual, 2002)**: ジアゼパム等価換算に置換後、**現在量の約5–10%(文献により10–25%)を1–2週ごとに削減**。急な中断は離脱症候群(反跳性不眠・不安、発作)を起こす。近年の**hyperbolic tapering**(Horowitz & Taylor 2019以降、抗うつ薬でも)は用量-受容体占有曲線が非線形であることから、**「元の量の定率」ではなく「現在量の定率」で減らす=指数的減衰**を推奨。**本製品のθ←θ×0.9は正確にこの形**(乗算的減衰)。また離脱症状が出たら「直前の安定用量に戻して保持してから再開」がタペリングの標準作法 — 失敗時にβで大きく戻すヒステリシスの臨床的対応物。

**ニコチンの反証**: Hatsukami et al. (2018, JAMA 320:880–891) のRCTは、たばこのニコチン含量を**即時に極低量へ落とす群が、漸減群より喫煙本数・曝露バイオマーカーの減少が大きい**ことを示した。「漸減が常に優る」わけではない — 依存物質の供給側削減では即時遮断が優ることがある。本製品への含意: 漸減の優位は「離脱コストが高く、能力が漸進的に育つ」場面に限る(読解力はこちら側)。

**段階的曝露療法**: Wolpe系統的脱感作以来、恐怖階層(SUDS)を低強度から漸進する graded exposure が標準で、flooding(一括高強度)より**脱落率が低い**。強度序列を崩した変動強度でも効果が落ちないという報告(Jacoby et al. 2019, J Behav Ther Exp Psychiatry)もあり、「厳密な単調性」より「継続できること」が本質。方向は本製品と逆(挑戦を漸増)だが、「本人が耐えられる変化幅で進める」原理は同一。

### 2.4 適応的介入の制御(θ制御器の系譜)

**JITAI — Nahum-Shani et al. (2018)** "Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health" (Annals of Behavioral Medicine, 52, 446–462)。設計要素: distal outcome(遠位目標=卒業)/ proximal outcomes(近位目標=セッション成功)/ tailoring variables(適応変数=成功・失敗履歴)/ decision points(セッション境界)/ decision rules(θ更新則)。**本製品のθ制御則はJITAIのdecision ruleそのもの**として記述でき、発表用の語彙が揃う。同フレームワークは支援過多による**負担(burden)と習慣化(habituation)の回避**を明示的な設計目標に挙げており、「補助は必要最小限へ漸減すべき」という規範を含む。

**動的難易度調整(DDA)とflow**: Hunicke & Chapman "AI for Dynamic Difficulty Adjustment in Games"(Hamletシステム、2004)以降、**プレイヤーに気づかれないよう**在庫理論的にゲーム資源を操作して難易度を保つ研究系譜がある(Zohaib 2018のレビュー)。理論基盤はCsikszentmihalyiのflow(挑戦と能力の均衡帯)。DDA文献では「調整がプレイヤーに知覚されると没入と自己効力感を損なう」ことが知られ、**「気づかれないこと」自体が設計要件**とされる点で本製品と一致。θノイズ(±10%迷彩)はDDAのランダム化と同じ機能。

**制御理論的自己調整**: Carver & Scheier (1981, 1998) の自己調整のフィードバックループ(基準値-比較-修正)。卒業後ホメオスタットは、基準値=卒業時ベースライン読書時間、負のフィードバックで補助を再展開する**サーモスタット(homeostat)型制御**として素直に位置づく。

### 2.5 行動維持と再発(ホメオスタットの先行概念)

**Lally et al. (2010)** "How are habits formed: Modelling habit formation in the real world" (European Journal of Social Psychology, 40, 998–1009)。96名、12週間の日次自己報告。自動性は漸近曲線で成長し、**95%漸近到達の中央値66日、範囲18–254日**。**1回の欠落は自動性をほとんど損なわず速やかに回復**。含意: (a) 卒業判定は66日オーダーの維持観察が妥当、(b) 単発の失敗でθを戻すべきではない — 「失敗2連続で初めて戻す」設計はこの知見と整合。

**Marlatt & Gordon (1985)** Relapse Prevention model。**lapse(一過性の逸脱)とrelapse(完全な再発)を区別**し、lapse後の破局的解釈(abstinence violation effect)が本格的再発を招くとする。lapseからrelapseへの進行は不可避ではなく、早期の小さな介入で断ち切れる。**卒業後ホメオスタット(50%割れで一時再展開、80%回復で撤収)は「lapse段階での限定的再介入でrelapseを防ぐ」というRPモデルの機械化**と説明できる。行動医学ではmaintenance(維持期)を独立フェーズと扱う(Prochaska & DiClementeのTTMのmaintenance期、Rothman 2000の維持動機論)。

### 2.6 見つからなかったもの(明記)

- **「fadingの最適速度は現在量の◯%」と規定した教育学の一次文献は存在しない**。scaffolding研究はfading速度を定量化していない(van de Pol 2010が明言)。
- **Weber-FechnerのJNDを「支援量の削減」に直接適用した先行研究は発見できず**。JND応用は感覚刺激(塩・糖・ポーション・ゲーム難易度)に限られ、「ヒント量・演出量のJND」を測った研究は見当たらない。ここは本製品のオリジナルな飛躍であり、発表ではアナロジーとして提示すべき(実測でθのJNDを検証する余地=売りにもなる)。
- α:βの非対称比(1:3)そのものを検証した文献はない。ただし方向性(ゆっくり減らし、戻すときは大きく安定域まで)はタペリング臨床の作法と一致。

---

## 3. 製品への反映

### 3.1 パラメータへの裏付けと修正提案

- **α=10%/成功**: Girgis 2003(週5%累積で無検知)、Ashton(現在量5–10%/1–2週)、味覚JND(塩でおよそ10–20%)と整合。**10%は「無検知域の上限寄り」**。文献的に最も守備的なのは5%だが、θは感覚刺激でなくメタ認知的な補助量なのでJNDはより大きい可能性が高く、10%は妥当なデフォルト。ユーザーが変化に言及したら5%へ落とすadaptive刻みも検討。
- **β=30%/失敗2連続**: 直接の根拠文献なし。ただしタペリング臨床の「症状が出たら直前の安定用量へ戻して保持」に対応させるなら、**「最後に成功が安定していたθまで戻す」(履歴ベース復元)**の方が文献に忠実。×1.3は近似としては可(2回で約1.7倍≒2段階分の巻き戻し)。
- **日次±15%上限**: 根拠は間接的(FSAの「順応時間を置く」原則、hyperbolic taperingの「急がない」原則)。数値自体は工学的裁量と正直に言うべき。
- **乗算的減衰(×0.9)という形式自体**が hyperbolic tapering の推奨形式(現在量の定率減)と同型 — これは発表で強調できる。
- **失敗1回で戻さない**: Lally 2010(単発の欠落は自動性に影響せず)と整合。現設計を維持。
- **卒業スナップ(θ<0.3→0)**: McMahon 2016は「一括25%変化は検知されうる」ことを示唆。最後の30%一括除去は検知されるリスクがあるが、卒業時点では補助への依存が低いため実害は小さいはず。気になるなら卒業直前だけ刻みを細かく(×0.85など)する選択肢。

### 3.2 学術用語での位置づけ(発表用)

「本システムは、**scaffoldingのfading(Wood/Bruner/Ross 1976; van de Pol 2010)を、JITAI(Nahum-Shani 2018)のdecision ruleとして実装した、成功随伴型(contingent)の適応的フェイディング制御器**である。乗算的減衰は臨床タペリングのhyperbolic tapering、無検知性はstealth reformulation(Girgis 2003; UK FSA)とゲームDDA(Hunicke 2004)、失敗時ヒステリシスはタペリング臨床とMarlattの再発防止、卒業後の監視はCarver-Scheier型の負フィードバック制御に依拠する。」— assistance dilemma(Koedinger & Aleven 2007)の連続値解、と一言添えると教育工学の文脈に刺さる。

### 3.3 「気づかれない漸減」実証アナロジー集(数字で語れる形)

1. **パンの塩、週5%×6週=25%減、誰も気づかなかった**(RCT, n=110, P=0.8; Girgis 2003)。
2. **英国は国全体の塩を8年で15%減らし、血圧3mmHg・脳卒中死亡42%減と並走した。方法は「気づかれない段階的削減」**(He et al. 2014)。
3. **チュニジアはパンの塩を35%まで漸減しても検知されなかった**(2021)。
4. **一括で25%減らすと気づかれる。漸進なら気づかれない**(McMahon 2016との対比)。
5. **減薬は「現在量の5–10%ずつ」が鉄則。急にやめると離脱で戻る。戻すときは安定量まで戻す**(Ashton Manual / hyperbolic tapering)。
6. **ゲームのDDAは「プレイヤーに気づかれないこと」を設計要件にして難易度を裏で調整している**(Hamlet, 2004)。
7. 反証も添えて誠実に: **コーラの砂糖では小さな変化も気づかれた**(Valicente 2023)、**ニコチンは即時遮断の方が効いた**(Hatsukami 2018, JAMA)。「漸減が効くのは、離脱コストが高く能力が育つ領域」という限定を自分から言う。

### 3.4 ホメオスタット設計への示唆

- Marlattに倣い、**再展開はlapse対応であってrelapse認定ではない**とUI上も軽く扱う(θ復帰を「失敗」と見せない。abstinence violation effect=「一度崩れたからもう駄目だ」認知を誘発しない)。
- Lallyより、**4週移動平均**という緩い窓は妥当(単日の欠落に反応しない)。卒業判定自体も「66日中央値、個人差18–254日」を踏まえ、固定日数でなく行動指標ベースが正しい。
- 再展開時のθは小さく始めて必要なら増やす(最小有効量の原則、JITAIのburden回避)。卒業時θ=0.3相当を一括再投入するより、0.15から漸増が文献の精神に合う。

---

## 4. 引用元

### scaffolding / ITS
- Wood, Bruner & Ross (1976). The Role of Tutoring in Problem Solving. J Child Psychol Psychiatry. https://acamh.onlinelibrary.wiley.com/doi/10.1111/j.1469-7610.1976.tb00381.x
- van de Pol, Volman & Beishuizen (2010). Scaffolding in Teacher–Student Interaction: A Decade of Research. Educ Psychol Rev. https://link.springer.com/article/10.1007/s10648-010-9127-6
- Salden, Aleven, Schwonke & Renkl (2010). The expertise reversal effect and worked examples in tutored problem solving. Instructional Science. https://www.researchgate.net/publication/226748784
- Koedinger & Aleven (2007). Exploring the Assistance Dilemma in Experiments with Cognitive Tutors. Educ Psychol Rev. https://link.springer.com/article/10.1007/s10648-007-9049-0

### stealth reformulation / JND
- Girgis et al. (2003). A one-quarter reduction in the salt content of bread can be made without detection. Eur J Clin Nutr. https://www.nature.com/articles/1601583
- He, Brinsden & MacGregor (2014). Salt reduction in the United Kingdom: a successful experiment in public health. J Hum Hypertens. https://www.nature.com/articles/jhh2013105
- He et al. (2014). Salt reduction in England from 2003 to 2011: its relationship to blood pressure, stroke and IHD mortality. BMJ Open. https://pubmed.ncbi.nlm.nih.gov/24732242/
- Wyness, Butriss & Stanner (2011). Reducing the population's sodium intake: the UK FSA's salt reduction programme. Public Health Nutr. https://www.cambridge.org/core/journals/public-health-nutrition/article/9289C9978849B50578E974F1F6BEA01E
- McMahon et al. (2016). Detection of 12.5% and 25% Salt Reduction in Bread in a Remote Indigenous Australian Community. Nutrients. https://pmc.ncbi.nlm.nih.gov/articles/PMC4808897/
- (2021). Salt Reduction in Tunisian Bread: 35% Gradual Decrease without Detection. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7915252/
- Pineli et al. (2017). Difference thresholds for added sugar in chocolate-flavoured milk. Int J Food Sci Nutr(PubMed). https://pubmed.ncbi.nlm.nih.gov/28460937/
- Valicente et al. (2023). Just noticeable difference in sweetness perception of cola. J Sensory Studies. https://onlinelibrary.wiley.com/doi/10.1111/joss.12803
- Sharp et al. (2020). Reductions to main meal portion sizes reduce daily energy intake regardless of perceived normality. IJBNPA. https://ijbnpa.biomedcentral.com/articles/10.1186/s12966-020-0920-4

### 臨床タペリング
- Ashton (2002). Benzodiazepines: How They Work and How to Withdraw (The Ashton Manual). https://ashtonprotocol.com/
- Horowitz & Taylor系 hyperbolic tapering(抗うつ薬コホート): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10185864/ / https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8404667/
- Hatsukami et al. (2018). Effect of Immediate vs Gradual Reduction in Nicotine Content of Cigarettes. JAMA. https://jamanetwork.com/journals/jama/fullarticle/2698925
- Jacoby et al. (2019). Is the hierarchy necessary? Gradual versus variable exposure intensity. J Behav Ther Exp Psychiatry. https://www.sciencedirect.com/science/article/abs/pii/S0005791618301125

### 適応的介入 / 制御
- Nahum-Shani et al. (2018). Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health. Ann Behav Med. https://academic.oup.com/abm/article/52/6/446/4733473
- Hunicke & Chapman (2004). AI for Dynamic Difficulty Adjustment in Games (Hamlet). https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf
- Zohaib (2018). Dynamic Difficulty Adjustment (DDA) in Computer Games: A Review. Adv HCI. https://onlinelibrary.wiley.com/doi/10.1155/2018/5681652
- Carver & Scheier (1998). On the Self-Regulation of Behavior. Cambridge UP. https://www.cambridge.org/core/books/on-the-selfregulation-of-behavior/14606DD9FB32DA230927C08B331BEF84

### 習慣・再発
- Lally et al. (2010). How are habits formed: Modelling habit formation in the real world. Eur J Soc Psychol. https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674
- Larimer, Palmer & Marlatt (1999). Relapse Prevention: An Overview of Marlatt's Cognitive-Behavioral Model. Alcohol Res Health. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6760427/
