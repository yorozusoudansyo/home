#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/articles.json の X (旧 Twitter) カードを、ローカルの xHermes
(WSL Ubuntu 上の Hermes Agent + Grok x_search) を呼び出して半自動更新するスクリプト。

- 外部パッケージは使用しない（標準ライブラリのみ）。
- WSL 上の `hermes` コマンドに scripts/xhermes_lp_prompt.txt の内容を渡し、
  @Yorozu0519 の最新ポストを JSON 配列として取得する。
- 取得結果は既存の X エントリとマージし、日付降順で最新 3 件だけを
  X カードとして残す（LP のカード枠を X が占有しすぎないため）。
- X 以外のエントリ（NOTE / YOUTUBE / SITE）には一切触れない。
- 変更がなければファイルを書き換えない（冪等）。

このスクリプトは GitHub Actions では実行できない（xHermes がローカル PC の
WSL 上にあるため）。ローカル PC から手動、またはタスクスケジューラ
(scripts/register_x_update_task.ps1) 経由で実行する。

使い方:
    python scripts/update_x_articles.py             # 実行して articles.json を更新
    python scripts/update_x_articles.py --dry-run   # 書き込まず差分だけ表示
    python scripts/update_x_articles.py --push       # 更新後に commit & push まで行う（運用機用）
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# Windows のコンソール (cp932 等) でも日本語を含む出力で落ちないようにする。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTICLES_PATH = REPO_ROOT / "data" / "articles.json"
PROMPT_PATH = REPO_ROOT / "scripts" / "xhermes_lp_prompt.txt"

HERMES_BIN = "/home/yukisa/.local/bin/hermes"
HERMES_TIMEOUT = 600  # seconds

MAX_X_ARTICLES = 3

URL_RE = re.compile(r"^https://x\.com/Yorozu0519/status/\d+$")
DATE_RE = re.compile(r"^\d{4}\.\d{2}\.\d{2}$")


# ---------------------------------------------------------------------------
# Windows パス -> WSL パス変換
# ---------------------------------------------------------------------------


def to_wsl_path(win_path: Path) -> str:
    """'D:\\foo\\bar' -> '/mnt/d/foo/bar'"""
    p = str(win_path.resolve())
    if re.match(r"^[A-Za-z]:", p):
        drive = p[0].lower()
        rest = p[2:].replace("\\", "/")
        return f"/mnt/{drive}{rest}"
    # フォールバック: すでに POSIX 風のパスならそのまま
    return p.replace("\\", "/")


# ---------------------------------------------------------------------------
# xHermes 呼び出し
# ---------------------------------------------------------------------------


def call_xhermes() -> str:
    """WSL 上の hermes を呼び出し、標準出力の文字列を返す。失敗時は例外を送出する。"""
    wsl_prompt_path = to_wsl_path(PROMPT_PATH)
    # 日本語の括弧等がプロンプトに含まれるため、bash へのインライン展開は禁止。
    # 必ずファイルに置いて cat で読む方式を使う。
    bash_cmd = (
        f'P="$(cat "{wsl_prompt_path}")"; {HERMES_BIN} -z "$P" </dev/null'
    )

    proc = subprocess.run(
        ["wsl", "-e", "bash", "-lc", bash_cmd],
        capture_output=True,
        timeout=HERMES_TIMEOUT,
    )

    stdout = proc.stdout.decode("utf-8", errors="replace")
    stderr = proc.stderr.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        raise RuntimeError(
            f"wsl/hermes の実行が失敗しました (exit={proc.returncode}): {stderr.strip()}"
        )

    return stdout


# ---------------------------------------------------------------------------
# 出力から JSON 配列を抽出
# ---------------------------------------------------------------------------


def extract_json_array(text: str) -> list:
    """テキスト中の最初の '[' から対応する ']' までを抽出して JSON パースする。
    前後にノイズ（説明文など）があっても耐えるようにする。
    文字列中の括弧は無視する（エスケープ考慮の簡易パーサ）。
    """
    start = text.find("[")
    if start == -1:
        raise ValueError("出力に JSON 配列の開始 '[' が見つかりません。")

    depth = 0
    in_string = False
    escape = False
    end = None

    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end is None:
        raise ValueError("出力中の JSON 配列の対応する ']' が見つかりません。")

    snippet = text[start : end + 1]
    return json.loads(snippet)


# ---------------------------------------------------------------------------
# バリデーション
# ---------------------------------------------------------------------------


def validate_entry(entry: dict) -> str | None:
    """問題なければ None、問題があれば警告メッセージを返す。"""
    if not isinstance(entry, dict):
        return f"エントリが object ではありません: {entry!r}"

    url = entry.get("url")
    date = entry.get("date")
    title = entry.get("title")

    if not isinstance(url, str) or not URL_RE.match(url):
        return f"url の形式が不正なためスキップ: {url!r}"
    if not isinstance(date, str) or not DATE_RE.match(date):
        return f"date の形式が不正なためスキップ ({url}): {date!r}"
    if not isinstance(title, str) or not title.strip():
        return f"title が空のためスキップ ({url})"
    if len(title) > 60:
        return f"title が60字を超えるためスキップ ({url}): {len(title)}字"

    return None


def validate_entries(raw_entries: list) -> list[dict]:
    valid: list[dict] = []
    for entry in raw_entries:
        warning = validate_entry(entry)
        if warning:
            print(f"警告: {warning}", file=sys.stderr)
            continue
        valid.append(
            {
                "source": "X",
                "title": entry["title"].strip(),
                "url": entry["url"],
                "date": entry["date"],
            }
        )
    return valid


# ---------------------------------------------------------------------------
# 日付ユーティリティ
# ---------------------------------------------------------------------------


def sort_key_for_date_string(date_str: str) -> str:
    if DATE_RE.match(date_str or ""):
        return date_str
    return "0000.00.00"


# ---------------------------------------------------------------------------
# マージロジック
# ---------------------------------------------------------------------------


def merge_x_articles(existing_data: dict, fetched_entries: list[dict]) -> dict:
    existing_articles = existing_data.get("articles", [])

    other_entries = [a for a in existing_articles if a.get("source") != "X"]
    existing_x = [a for a in existing_articles if a.get("source") == "X"]

    # URL で重複排除。新規取得分の内容を優先（同一ポストの再確認で情報が
    # 更新されている可能性があるため）。
    by_url: dict[str, dict] = {}
    for entry in existing_x:
        url = entry.get("url")
        if url:
            by_url[url] = entry
    for entry in fetched_entries:
        url = entry.get("url")
        if url:
            by_url[url] = entry

    combined_x = list(by_url.values())
    combined_x.sort(key=lambda a: sort_key_for_date_string(a.get("date", "")), reverse=True)
    top_x = combined_x[:MAX_X_ARTICLES]

    all_entries = other_entries + top_x
    all_entries.sort(key=lambda a: sort_key_for_date_string(a.get("date", "")), reverse=True)

    result = dict(existing_data)
    result["articles"] = all_entries
    return result


def diff_x_entries(old_list: list[dict], new_list: list[dict]) -> tuple[list[dict], list[dict]]:
    old_x = [a for a in old_list if a.get("source") == "X"]
    new_x = [a for a in new_list if a.get("source") == "X"]

    old_urls = {a.get("url"): a for a in old_x}
    new_urls = {a.get("url"): a for a in new_x}

    added = [a for a in new_x if a.get("url") not in old_urls]
    removed = [a for a in old_x if a.get("url") not in new_urls]
    return added, removed


# ---------------------------------------------------------------------------
# git 操作 (--push 用)
# ---------------------------------------------------------------------------


def run_git(args: list[str]) -> None:
    proc = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    print(proc.stdout, end="")
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr, end="")
        raise RuntimeError(f"git {' '.join(args)} が失敗しました (exit={proc.returncode})")


def push_changes() -> None:
    run_git(["pull", "--rebase"])
    run_git(["add", "data/articles.json"])
    run_git(["commit", "-m", "chore: update X article cards via xHermes"])
    run_git(["push"])


# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------


def load_existing() -> dict:
    if not ARTICLES_PATH.exists():
        return {"articles": []}
    with ARTICLES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="xHermes 経由で data/articles.json の X カードを半自動更新する。"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="書き込まず、追加/削除される X エントリを表示するだけ",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="書き込み後に git pull --rebase / commit / push まで行う（運用機用。テストでは使わないこと）",
    )
    args = parser.parse_args()

    if not PROMPT_PATH.exists():
        print(f"エラー: プロンプトファイルが見つかりません: {PROMPT_PATH}", file=sys.stderr)
        return 1

    try:
        raw_output = call_xhermes()
    except (subprocess.TimeoutExpired, RuntimeError, OSError) as exc:
        print(f"エラー: xHermes の呼び出しに失敗しました: {exc}", file=sys.stderr)
        return 1

    try:
        raw_entries = extract_json_array(raw_output)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"エラー: xHermes の出力から JSON 配列を抽出できませんでした: {exc}", file=sys.stderr)
        print("--- xHermes 出力 (先頭 2000 文字) ---", file=sys.stderr)
        print(raw_output[:2000], file=sys.stderr)
        return 1

    if not isinstance(raw_entries, list):
        print("エラー: xHermes の出力が JSON 配列ではありません。", file=sys.stderr)
        return 1

    fetched_entries = validate_entries(raw_entries)
    print(f"取得件数: {len(raw_entries)} (バリデーション通過: {len(fetched_entries)})")

    if not fetched_entries:
        print("警告: 有効な X エントリが1件も取得できませんでした。ファイルは変更しません。", file=sys.stderr)
        return 1

    existing_data = load_existing()
    new_data = merge_x_articles(existing_data, fetched_entries)

    old_list = existing_data.get("articles", [])
    new_list = new_data.get("articles", [])

    added, removed = diff_x_entries(old_list, new_list)

    if args.dry_run:
        print("\n--- dry-run: 追加される X エントリ ---")
        if added:
            for a in added:
                print(f"  + {a.get('date')} {a.get('title')} ({a.get('url')})")
        else:
            print("  (なし)")

        print("--- dry-run: 削除される X エントリ ---")
        if removed:
            for a in removed:
                print(f"  - {a.get('date')} {a.get('title')} ({a.get('url')})")
        else:
            print("  (なし)")

        print(f"\n(dry-run) 現在 {len(old_list)} 件 -> 更新後 {len(new_list)} 件")
        return 0

    if old_list == new_list:
        print("変更なし。ファイルは書き換えません。")
        return 0

    with ARTICLES_PATH.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"更新しました: {len(old_list)} 件 -> {len(new_list)} 件 (X追加 {len(added)} / X削除 {len(removed)})")

    if args.push:
        try:
            push_changes()
        except RuntimeError as exc:
            print(f"エラー: push 処理に失敗しました: {exc}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
