# 記事カード自動更新の仕組み

トップページ（index.html）の「発信」セクションに表示される記事カードは、
`data/articles.json` を元に表示されています。このファイルの一部は自動更新、
一部は手動更新です。

## 自動 / 手動の切り分け

| source        | 更新方法 | 備考 |
|---------------|----------|------|
| `NOTE`        | 自動（毎日） | note の RSS (`https://note.com/yukisa0814/rss`) を取得 |
| `YOUTUBE`     | 自動（毎日） | YouTube チャンネルの RSS を取得 |
| `X`           | 半自動（ローカル） | X（旧Twitter）には無料で使える公式APIがないため、ローカル PC の xHermes を使う半自動更新（下記参照）。例外的な手動編集は `admin.html` からも可能 |
| `SITE`        | 手動 | LP 内の特設ページ等、RSS化されていないコンテンツのため手動で追加・編集してください |

自動更新の対象（NOTE / YOUTUBE）は、GitHub Actions のワークフロー
`.github/workflows/update-articles.yml` が毎日 JST 6:00 頃に実行し、
`scripts/update_articles.py` が最新の記事情報で `data/articles.json` を
書き換えます。差分がある場合のみ `github-actions[bot]` 名義でコミット・push
されます（差分がなければ何もしません）。

X / SITE のエントリはスクリプトが一切触れないため、`admin.html` で追加・編集
した内容がそのまま保持されます。

## 全体の件数制限

カードは合計最大 12 件です。手動管理（X / SITE）のエントリは優先的に保持され、
残り枠を NOTE / YOUTUBE の最新記事で日付降順に埋めます。

## 手動で今すぐ更新したいとき

1. GitHub リポジトリの **Actions** タブを開く
2. 左側の **Update article cards from RSS** ワークフローを選択
3. **Run workflow** ボタンから `workflow_dispatch` を手動実行

数十秒〜1分程度で完了し、差分があれば自動コミットされます。GitHub Pages は
main ブランチへの push で自動的に再デプロイされるため、追加の作業は不要です。

## トラブル時の確認ポイント

- **Actions のログを見る**: Actions タブ →
  該当の実行 → `Run article update script` ステップのログにエラー内容が出ます。
  片方のフィード取得に失敗しても、もう片方は処理を継続する仕様です（両方失敗
  した場合のみジョブが失敗します）。
- **RSS URL の生死を確認する**: ブラウザで直接開いて中身が返ってくるか確認してください。
  - note: https://note.com/yukisa0814/rss
  - YouTube: https://www.youtube.com/feeds/videos.xml?channel_id=UC_Nl9zjN9bE4VE66TcLRUyQ
  - アカウント名やチャンネルIDが変わった場合は `scripts/update_articles.py` 冒頭の
    `NOTE_RSS_URL` / `YOUTUBE_RSS_URL` を修正してください。
- **手元で動作確認したいとき**:
  ```bash
  python scripts/update_articles.py --dry-run
  ```
  実際には書き込まず、追加・削除されるエントリだけを表示します。
- **コミットが作られない**: 差分がない場合は正常な挙動です（冪等設計のため）。

## X 記事カード（半自動・ローカル実行）

X（旧Twitter）には無料で使える公式検索APIがなく、GitHub Actions（クラウド上の
Ubuntu ランナー）から直接取得することができません。その代わりに、ローカル PC
の WSL（Ubuntu）上に導入済みの **xHermes**（Hermes Agent + Grok の `x_search`
機能）を使い、`@Yorozu0519` の最新ポストを取得して `data/articles.json` の
X カードを更新します。

### 仕組み

1. `scripts/update_x_articles.py` が `scripts/xhermes_lp_prompt.txt` の
   プロンプトを WSL 上の `hermes` コマンドに渡し、最新ポスト最大 5 件を
   JSON 配列として取得する。
2. 取得結果をバリデーション（URL / 日付形式・タイトル長）した上で、既存の
   X エントリと URL で重複排除しながらマージし、**日付降順で最新 3 件だけ**
   を X カードとして残す（X が「発信」セクションのカード枠を占有しすぎない
   ようにするため）。
3. X 以外（NOTE / YOUTUBE / SITE）のエントリには一切触れない。
4. 変更があれば `data/articles.json` を書き換える（`--push` 指定時はさらに
   `git pull --rebase` → `commit` → `push` まで行う）。

この処理はローカル PC 上でしか実行できない（xHermes がローカルの WSL に
あるため、GitHub Actions からは実行できない）点に注意してください。

### 手動実行

```bash
python scripts/update_x_articles.py --dry-run   # 書き込まず差分だけ確認
python scripts/update_x_articles.py             # 実際に articles.json を更新（push はしない）
python scripts/update_x_articles.py --push       # 更新後に commit & push まで行う
```

hermes の応答には数分かかることがあります。タイムアウトは 600 秒に設定
されています。

### 定期実行の登録・解除

`scripts/register_x_update_task.ps1` を使うと、Windows のタスクスケジューラに
毎日 07:00（ローカル時刻）に `python scripts/update_x_articles.py --push` を
実行するタスク `LP_XArticlesUpdate` を登録できます（GitHub Actions の
NOTE/YOUTUBE 自動更新が毎日 JST 6:00 頃に走るため、rebase の衝突を避けるべく
1 時間ずらしています）。

```powershell
# 登録前に内容を確認したいだけの場合
.\scripts\register_x_update_task.ps1 -WhatIf

# 登録
.\scripts\register_x_update_task.ps1

# 解除
.\scripts\register_x_update_task.ps1 -Unregister
```

このタスクは **PC の電源が入っていて、かつユーザーがログインしている間だけ**
動作します。スリープ中のマシンを起こすことはなく、ログオフ中や PC がシャット
ダウンしている間は実行されません（その日の実行はスキップされます）。

### 前提条件

- WSL（Ubuntu）に `/home/yukisa/.local/bin/hermes` が導入済みであること。
- WSL 側で `hermes` が Grok の `x_search` を使える状態（認証済み）であること。
- `python.exe` が Windows 側の PATH に通っていること（タスクスケジューラ登録
  スクリプトが `python` コマンドを解決するため）。
