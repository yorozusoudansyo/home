# LP再構成プラン v2（確定版） — AI・ITよろず相談所

**作成日：2026-07-13 ／ v2：ユーザー決定事項を反映**
**対象：** https://yorozusoudansyo.github.io/home/ （index.html ほか）
**体制：** プラン・指示 = Fable ／ 実装 = Sonnet ／ 画像生成 = Codex (ImageGen2)

---

## 0. 確定した決定事項（2026-07-13）

| # | 項目 | 決定 |
|---|---|---|
| 1 | Peatix LT登壇（5月） | **実施していない → 一切掲載しない** |
| 2 | 料金プラン | **打ち消し線・「予定」バッジを削除**（金額はそのまま確定表示） |
| 3 | LINE | **オープンチャット「AI・ITよろず相談所」開設済み**。URL: `https://line.me/ti/g2/lnqqHIx9uYLCuqKQkU2TWfGhMaTWTORnwIVPHQ?utm_source=invitation&utm_medium=link_copy&utm_campaign=default` ／ QR: `assets/line-qr.png`（配置済み） |
| 4 | 発信チャネル | X (`https://x.com/Yorozu0519`)・**YouTube (`https://www.youtube.com/channel/UC_Nl9zjN9bE4VE66TcLRUyQ`)**・note (`https://note.com/yukisa0814`) の3本柱 |
| 5 | 記事カード更新 | admin.html での手動更新が面倒 → **自動化／半自動化を実装**（GitHub Actions + RSS） |
| 6 | 画像 | 現行の feature 画像は Gemini 製 → **Codex (ImageGen2) で再生成**したい |
| 7 | クライアント事例 | **掲載する**（完全匿名化・抽象化） |

---

## 1. ワークストリーム分割

### WS-1：index.html 再構成（Sonnet）
1. **お知らせバー**（NAV直下）：Copilotウェビナー開催中（残り 7/19・7/26、21:00–21:40、無料）→ `copilot_webinar_lp.html`
2. **新セクション「セミナー・ウェビナー」**（PROCESS と PRICING の間）
   - Copilotシリーズ（開催中）カード → copilot_webinar_lp.html
   - 「AIと話すだけで仕事が変わる」全3回（2026年6月・開催済み）カード → webinar_lp.html
   - 法人・コミュニティ向け研修の案内文 1行 → 無料相談へ
3. **新セクション「実績・活動」**（セミナーの後 or 想いの前）
   - 活動タイムライン（Peatixなし）：2024.09 独立 → 2026.04 サイト公開・個別伴走開始 → 2026.06 無料ウェビナー第1弾（全3回）→ 2026.07 Copilotウェビナー（全3回・開催中）
   - 匿名化事例カード（下記 §2 の確定コピーをそのまま使用）
4. **料金**：`tentative` クラス・「予定」バッジ削除
5. **LINEオープンチャット**：連絡先グリッドにカード追加（QR表示付き）
6. **YouTube**：発信セクションのプラットフォームボタン＋フッターアイコンに追加
7. **articles.json**：SITE ソース対応（教材ページ 2026.04.30／Copilot基礎記事ゲート 2026.06.30 をカード化）、開催済みウェビナーのX告知カードは削除
8. フッター `LAST UPDATED — 2026.07`

### WS-2：記事カード自動更新（Sonnet）
- **GitHub Actions（毎日1回 + 手動実行）** で RSS を取得し `data/articles.json` を自動更新：
  - note RSS: `https://note.com/yukisa0814/rss`（サムネイル付き）
  - YouTube RSS: `https://www.youtube.com/feeds/videos.xml?channel_id=UC_Nl9zjN9bE4VE66TcLRUyQ`
- マージ規則：NOTE / YOUTUBE は自動管理、X / SITE は手動管理（admin.html 継続利用）。URL で重複排除、日付降順、最大12件
- X は無料APIがないため対象外（admin.html から従来どおり手動追加）

### WS-3：feature 画像の再生成（Codex / ImageGen2）
- 対象：`assets/feature-01.png` 〜 `feature-07.png`（＋ feature-solving.png）
- Fable がブランド準拠のプロンプト仕様書を作成 → Codex (ImageGen2) で生成 → 同名で差し替えるだけで反映される設計
- ブランド制約：赤 #D32F2F は面積5%以下、余白広め、Inter/Noto系のクリーンなフラットイラスト、1024×559

---

## 2. 匿名化事例（確定コピー — このまま掲載）

> 掲載ルール：個人名・地名・業種の特定につながる固有情報はすべて除去済み。「守秘徹底・事例は匿名化」の注記を添える。

1. **Webサイトのブランド画像を高解像度化したい（コミュニティ運営）**
   作業を代行するのではなく、ご本人がAIを使えるようになる"教育込み"の伴走で対応。画像アップスケールのミニアプリを一緒に構築し、以後はご自身で運用できる形に。

2. **法人設立準備×AI活用（専門コンサルタント）**
   リサーチ・文書作成・デザインでAIの役割分担を設計。ノウハウを「自分の脳の外」に蓄積していくノート型AI活用の仕組みづくりを支援。

3. **講座教材づくりの効率化（教室・講座運営）**
   受講生向けテキスト・ワークシートづくりをAIで効率化。よくある質問に答えるAIチャットボット構想の整理まで、機能の使い分けを一緒に設計。

4. **「紙の単価表2000項目」を一瞬でExcel化**（note公開事例）
   昭和から使われてきた紙の単価表をAIでデータ化。手入力なら数日の作業を数分に。→ note記事リンク付き

5. **創作コンテンツのAI展開（個人クリエイター）**
   「ストーリーは自分で書けるが、動画化にどのAIを使えばいいか分からない」——ツール選定から最初の一歩まで、実演を交えて伴走。

---

## 3. 変更しないもの

- ブランドデザインシステム（#D32F2F ≤5%、Inter + Noto Sans JP）
- キャッチコピー・HEROの骨格・悩み4項目・特徴7カード・流れ4ステップ
- admin.html の仕組み（X/SITE の手動追加用として存続）
