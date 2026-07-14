#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/articles.json を note / YouTube の RSS フィードから自動更新するスクリプト。

- 外部パッケージは使用しない（標準ライブラリのみ）。
- NOTE / YOUTUBE のカードはフィード取得結果で置き換える。
- X / SITE など、それ以外の source を持つエントリは「手動管理」として保持する。
- 全体を date 降順でソートし、手動管理エントリを除いた自動取得分を含めて
  最大 MAX_ARTICLES 件に切り詰める（手動管理エントリは必ず残す）。
- 変更がなければファイルを書き換えない（冪等）。

使い方:
    python scripts/update_articles.py            # 実行して articles.json を更新
    python scripts/update_articles.py --dry-run  # 書き込まず差分だけ表示
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

# Windows のコンソール (cp932 等) でも日本語・絵文字を含む出力で落ちないようにする。
# GitHub Actions (Ubuntu, UTF-8) では no-op に近い。
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

NOTE_RSS_URL = "https://note.com/yukisa0814/rss"
YOUTUBE_RSS_URL = (
    "https://www.youtube.com/feeds/videos.xml?channel_id=UC_Nl9zjN9bE4VE66TcLRUyQ"
)

USER_AGENT = (
    "Mozilla/5.0 (compatible; YorozuArticleBot/1.0; "
    "+https://yorozusoudansyo.github.io/home/)"
)
REQUEST_TIMEOUT = 15  # seconds

MAX_ARTICLES = 12

AUTO_SOURCES = {"NOTE", "YOUTUBE"}

ATOM_NS = "http://www.w3.org/2005/Atom"
YT_NS = "http://www.youtube.com/xml/schemas/2015"
MEDIA_NS = "http://search.yahoo.com/mrss/"


# ---------------------------------------------------------------------------
# HTTP 取得
# ---------------------------------------------------------------------------


def fetch_url(url: str) -> bytes:
    """Fetch a URL with a browser-like User-Agent and a timeout."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.read()


# ---------------------------------------------------------------------------
# 日付ユーティリティ
# ---------------------------------------------------------------------------


def format_date(dt: datetime) -> str:
    return dt.strftime("%Y.%m.%d")


def parse_rfc822_date(value: str) -> datetime | None:
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def parse_iso_date(value: str) -> datetime | None:
    try:
        # Atom's <published> is typically like 2026-04-27T12:00:00+00:00
        v = value.strip()
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        return datetime.fromisoformat(v)
    except (TypeError, ValueError):
        return None


def sort_key_for_date_string(date_str: str) -> str:
    """'YYYY.MM.DD' sorts correctly as a plain string, but guard against
    malformed values by falling back to something that sorts last (oldest)."""
    if re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", date_str or ""):
        return date_str
    return "0000.00.00"


# ---------------------------------------------------------------------------
# note RSS
# ---------------------------------------------------------------------------

IMG_SRC_RE = re.compile(r'<img[^>]+src="([^"]+)"', re.IGNORECASE)


def parse_note_feed(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for item in root.findall(".//item"):
        title_el = item.find("title")
        link_el = item.find("link")
        pubdate_el = item.find("pubDate")

        title = (title_el.text or "").strip() if title_el is not None else ""
        url = (link_el.text or "").strip() if link_el is not None else ""
        pubdate_raw = (pubdate_el.text or "").strip() if pubdate_el is not None else ""

        if not title or not url:
            continue

        dt = parse_rfc822_date(pubdate_raw) if pubdate_raw else None
        date_str = format_date(dt) if dt else ""

        thumbnail = None
        thumb_el = item.find(f"{{{MEDIA_NS}}}thumbnail")
        if thumb_el is not None:
            thumbnail = thumb_el.get("url")

        if not thumbnail:
            desc_el = item.find("description")
            if desc_el is not None and desc_el.text:
                m = IMG_SRC_RE.search(desc_el.text)
                if m:
                    thumbnail = m.group(1)

        entry = {
            "source": "NOTE",
            "title": title,
            "url": url,
            "date": date_str,
        }
        if thumbnail:
            entry["thumbnail"] = thumbnail
        items.append(entry)

    return items


# ---------------------------------------------------------------------------
# YouTube RSS (Atom)
# ---------------------------------------------------------------------------


def parse_youtube_feed(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for entry in root.findall(f"{{{ATOM_NS}}}entry"):
        video_id_el = entry.find(f"{{{YT_NS}}}videoId")
        title_el = entry.find(f"{{{ATOM_NS}}}title")
        published_el = entry.find(f"{{{ATOM_NS}}}published")

        video_id = (video_id_el.text or "").strip() if video_id_el is not None else ""
        title = (title_el.text or "").strip() if title_el is not None else ""
        published_raw = (
            (published_el.text or "").strip() if published_el is not None else ""
        )

        if not video_id or not title:
            continue

        dt = parse_iso_date(published_raw) if published_raw else None
        date_str = format_date(dt) if dt else ""

        items.append(
            {
                "source": "YOUTUBE",
                "title": title,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "date": date_str,
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            }
        )

    return items


# ---------------------------------------------------------------------------
# フィード取得（片方失敗しても続行、両方失敗なら例外）
# ---------------------------------------------------------------------------


def fetch_feed_entries() -> tuple[list[dict], list[str]]:
    """Returns (entries, error_messages). Raises RuntimeError if both feeds fail."""
    entries: list[dict] = []
    errors: list[str] = []

    try:
        note_xml = fetch_url(NOTE_RSS_URL)
        entries.extend(parse_note_feed(note_xml))
    except Exception as exc:  # noqa: BLE001 - want to continue regardless of cause
        errors.append(f"note RSS 取得に失敗しました ({NOTE_RSS_URL}): {exc}")

    try:
        yt_xml = fetch_url(YOUTUBE_RSS_URL)
        entries.extend(parse_youtube_feed(yt_xml))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"YouTube RSS 取得に失敗しました ({YOUTUBE_RSS_URL}): {exc}")

    if not entries and errors:
        raise RuntimeError("両方のフィード取得に失敗しました:\n" + "\n".join(errors))

    return entries, errors


# ---------------------------------------------------------------------------
# マージロジック
# ---------------------------------------------------------------------------


def merge_articles(existing_data: dict, fetched_entries: list[dict]) -> dict:
    existing_articles = existing_data.get("articles", [])

    manual_entries = [a for a in existing_articles if a.get("source") not in AUTO_SOURCES]
    manual_urls = {a.get("url") for a in manual_entries if a.get("url")}

    # 手動側に同一URLが既にある場合は手動側を優先し、fetched から除外
    auto_entries = [e for e in fetched_entries if e.get("url") not in manual_urls]

    # fetched 内の重複URLを排除（先勝ち: フィード出現順を優先）
    seen_urls: set[str] = set()
    deduped_auto: list[dict] = []
    for entry in auto_entries:
        url = entry.get("url")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        deduped_auto.append(entry)

    # 手動管理エントリは必ず残す。自動取得エントリのみ MAX_ARTICLES 制約の対象。
    all_entries = manual_entries + deduped_auto
    all_entries.sort(key=lambda a: sort_key_for_date_string(a.get("date", "")), reverse=True)

    manual_count = len(manual_entries)
    auto_budget = max(MAX_ARTICLES - manual_count, 0)

    final_entries: list[dict] = []
    auto_used = 0
    for entry in all_entries:
        if entry.get("source") not in AUTO_SOURCES:
            final_entries.append(entry)
        else:
            if auto_used < auto_budget:
                final_entries.append(entry)
                auto_used += 1
            # else: drop (over budget)

    result = dict(existing_data)
    result["articles"] = final_entries
    return result


# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------


def load_existing() -> dict:
    if not ARTICLES_PATH.exists():
        return {"articles": []}
    with ARTICLES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def diff_articles(old_list: list[dict], new_list: list[dict]) -> tuple[list[dict], list[dict]]:
    old_urls = {a.get("url"): a for a in old_list}
    new_urls = {a.get("url"): a for a in new_list}

    added = [a for a in new_list if a.get("url") not in old_urls]
    removed = [a for a in old_list if a.get("url") not in new_urls]
    return added, removed


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-update data/articles.json from RSS feeds.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="書き込まず、追加/削除されるエントリを表示するだけ",
    )
    args = parser.parse_args()

    try:
        fetched_entries, errors = fetch_feed_entries()
    except RuntimeError as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    for err in errors:
        print(f"警告: {err}", file=sys.stderr)

    note_count = sum(1 for e in fetched_entries if e["source"] == "NOTE")
    yt_count = sum(1 for e in fetched_entries if e["source"] == "YOUTUBE")
    print(f"取得件数: NOTE={note_count}, YOUTUBE={yt_count}")

    existing_data = load_existing()
    new_data = merge_articles(existing_data, fetched_entries)

    old_list = existing_data.get("articles", [])
    new_list = new_data.get("articles", [])

    added, removed = diff_articles(old_list, new_list)

    if args.dry_run:
        print("\n--- dry-run: 追加されるエントリ ---")
        if added:
            for a in added:
                print(f"  + [{a.get('source')}] {a.get('date')} {a.get('title')} ({a.get('url')})")
        else:
            print("  (なし)")

        print("--- dry-run: 削除されるエントリ ---")
        if removed:
            for a in removed:
                print(f"  - [{a.get('source')}] {a.get('date')} {a.get('title')} ({a.get('url')})")
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

    print(f"更新しました: {len(old_list)} 件 -> {len(new_list)} 件 (追加 {len(added)} / 削除 {len(removed)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
