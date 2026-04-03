#!/usr/bin/env python3
"""
stores_merged.csv に URL・概要カラムを追加するスクリプト

追加カラム:
  phone          : 電話番号              (Google Places Details API)
  official_url   : 公式HP                (Google Places Details API)
  google_maps_url: Google Maps URL       (place_id から生成、追加コストなし)
  google_summary : Google編集概要 + 口コミ(Google Places Details API)
  instagram_url  : Instagram             (Perplexity API)
  tiktok_url     : TikTok                (Perplexity API)
  x_url          : X / Twitter           (Perplexity API)
  facebook_url   : Facebook              (Perplexity API)
  youtube_url    : YouTube               (Perplexity API)
  line_url       : LINE 公式アカウント   (Perplexity API)
  tabelog_url    : 食べログ              (Perplexity API, 飲食カテゴリのみ)
  hotpepper_url  : ホットペッパー        (Perplexity API, 飲食・美容カテゴリのみ)
  jalan_url      : じゃらん              (Perplexity API, 宿泊・観光カテゴリのみ)
  raw_description: Perplexity が調べた店舗情報（加工前）
  description    : 最終概要（別途 Claude Code で生成）

処理フロー（1店舗あたり）:
  ① Google Places Details → phone, official_url, google_maps_url, google_summary
  ② Perplexity            → SNS/予約サイトURL + raw_description

再実行時のスキップ条件:
  - チェックポイントに raw_description キーが存在する → スキップ（①②完了済み）
  - チェックポイントにあるが raw_description がない → ②のみ再実行（①は再利用）

必要な環境変数:
  GOOGLE_API_KEY    : Google API キー
  PERPLEXITY_API_KEY: Perplexity API キー

使い方:
  source .env && python3 scripts/enrich_urls.py
"""

import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Azure SDK のインストール先を明示的に追加
sys.path.insert(0, str(Path.home() / ".local/lib/python3.12/site-packages"))

from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

_VAULT_URL = "https://autofor-kv.vault.azure.net/"

def _get_secret(name: str) -> str:
    """Azure Key Vault からシークレットを取得する。失敗時は環境変数にフォールバック。"""
    try:
        client = SecretClient(vault_url=_VAULT_URL, credential=DefaultAzureCredential())
        return client.get_secret(name).value
    except Exception as e:
        print(f"  [KeyVault] {name} 取得失敗: {e}")
        return ""

GOOGLE_API_KEY     = _get_secret("google-maps-api-key") or os.environ.get("GOOGLE_API_KEY", "")
PERPLEXITY_API_KEY = _get_secret("perplexity-api-key") or os.environ.get("PERPLEXITY_API_KEY", "")

BASE_DIR   = Path(__file__).parent.parent
INPUT_CSV  = BASE_DIR / "csv" / "stores_merged.csv"
OUTPUT_CSV = BASE_DIR / "csv" / "stores_merged.csv"
CHECKPOINT = BASE_DIR / "csv" / ".url_checkpoint.json"

PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL     = "https://maps.googleapis.com/maps/api/place/details/json"
PERPLEXITY_URL         = "https://api.perplexity.ai/chat/completions"

FOOD_CATEGORIES    = {"飲食店", "カフェ", "ベーカリー", "バー", "スーパー", "コンビニ", "グルメ・飲食"}
BEAUTY_CATEGORIES  = {"美容室", "スパ・エステ", "ネイル"}
LODGING_CATEGORIES = {"宿泊施設"}
TOURIST_CATEGORIES = {"観光スポット", "アミューズメント", "ジム", "ボウリング"}

# Places API で取得するフィールド（①）
PLACES_FIELDS = ["phone", "official_url", "google_maps_url", "google_summary"]
# Perplexity で取得するフィールド（②）
PERPLEXITY_FIELDS = [
    "raw_description",
    "instagram_url", "tiktok_url", "x_url", "facebook_url",
    "youtube_url", "line_url", "tabelog_url", "hotpepper_url", "jalan_url",
]
# description は Claude Code で後から生成
# カラム順: 基本情報 → 連絡先/地図 → 概要 → SNS → 予約サイト
NEW_FIELDS = PLACES_FIELDS + ["raw_description", "description"] + [
    "instagram_url", "tiktok_url", "x_url", "facebook_url",
    "youtube_url", "line_url", "tabelog_url", "hotpepper_url", "jalan_url",
]


# ─── HTTP ヘルパー ──────────────────────────────────────────────────

def get_json(url: str) -> dict:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"    [HTTP ERROR] {e}")
        return {}


def post_json(url: str, payload: dict, headers: dict) -> dict:
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"    [HTTP ERROR] {e}")
        return {}


# ─── Google Places ──────────────────────────────────────────────────

def get_place_id(place_name: str, formatted_address: str) -> str:
    query = f"{place_name} {formatted_address}"
    params = urllib.parse.urlencode({
        "query": query, "language": "ja", "region": "jp", "key": GOOGLE_API_KEY,
    })
    data = get_json(f"{PLACES_TEXT_SEARCH_URL}?{params}")
    results = data.get("results", [])
    return results[0].get("place_id", "") if results else ""


def get_place_details(place_id: str) -> dict:
    if not place_id:
        return {}
    params = urllib.parse.urlencode({
        "place_id": place_id,
        "fields": "website,formatted_phone_number,editorial_summary,reviews",
        "language": "ja",
        "key": GOOGLE_API_KEY,
    })
    data = get_json(f"{PLACES_DETAILS_URL}?{params}")
    return data.get("result", {})


def build_google_summary(details: dict) -> str:
    parts = []
    summary = details.get("editorial_summary", {}).get("overview", "")
    if summary:
        parts.append(summary)
    for review in details.get("reviews", [])[:2]:
        text = review.get("text", "").strip()
        if text:
            parts.append(text[:100])
    return " / ".join(parts)


def make_google_maps_url(place_id: str) -> str:
    return f"https://www.google.com/maps/place/?q=place_id:{place_id}" if place_id else ""


# ─── Perplexity API ─────────────────────────────────────────────────

def _build_url_prompt(store_name: str, address: str, category: str) -> str:
    is_food    = category in FOOD_CATEGORIES
    is_beauty  = category in BEAUTY_CATEGORIES
    is_lodging = category in LODGING_CATEGORIES
    is_tourist = category in TOURIST_CATEGORIES

    conditional = []
    if is_food:
        conditional.append('  "tabelog_url": "食べログのページURL (tabelog.com)",')
        conditional.append('  "hotpepper_url": "ホットペッパーグルメのURL (hotpepper.jp)",')
    if is_beauty:
        conditional.append('  "hotpepper_url": "ホットペッパービューティーのURL (beauty.hotpepper.jp)",')
    if is_lodging or is_tourist:
        conditional.append('  "jalan_url": "じゃらんのページURL (jalan.net)",')

    return f"""以下の店舗について調べてください。

店舗名: {store_name}
住所: {address}
カテゴリ: {category}

次のJSON形式のみで回答してください（見つからない・不確かな項目は "" にする）:
{{
  "instagram_url": "https://www.instagram.com/...",
  "tiktok_url": "https://www.tiktok.com/...",
  "x_url": "https://twitter.com/ または https://x.com/...",
  "facebook_url": "https://www.facebook.com/...",
  "youtube_url": "https://www.youtube.com/...",
  "line_url": "https://lin.ee/... または LINE公式アカウントのURL",
{chr(10).join(conditional)}
  "raw_description": "この店舗についてわかったこと（特徴・メニュー・サービス・評判など）を200字以内で"
}}

注意:
- 実在が確認できるURLのみ記載してください
- 不確かな場合は必ず "" にしてください
- JSON以外のテキストは不要です"""


def search_with_perplexity(store_name: str, address: str, category: str) -> dict:
    result = {k: "" for k in PERPLEXITY_FIELDS}
    if not PERPLEXITY_API_KEY:
        return result

    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sonar",
        "messages": [{"role": "user", "content": _build_url_prompt(store_name, address, category)}],
        "temperature": 0.0,
        "max_tokens": 600,
    }

    data = post_json(PERPLEXITY_URL, payload, headers)
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

    match = re.search(r"\{.*?\}", content, re.DOTALL)
    if not match:
        return result

    try:
        parsed = json.loads(match.group())
    except json.JSONDecodeError:
        return result

    for key in result:
        val = parsed.get(key, "")
        if not isinstance(val, str):
            continue
        if key == "raw_description":
            result[key] = val[:200]
        elif val.startswith("http"):
            result[key] = val

    return result


# ─── チェックポイント ───────────────────────────────────────────────

def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        with open(CHECKPOINT, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(data: dict):
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def write_csv(rows: list[dict]):
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ─── メイン ────────────────────────────────────────────────────────

def main():
    if not GOOGLE_API_KEY:
        print("ERROR: 環境変数 GOOGLE_API_KEY が設定されていません")
        return
    if not PERPLEXITY_API_KEY:
        print("WARNING: PERPLEXITY_API_KEY が未設定のため SNS・概要列は空欄になります\n")

    with open(INPUT_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for row in rows:
        for field in NEW_FIELDS:
            if field not in row:
                row[field] = ""

    checkpoint = load_checkpoint()
    total = len(rows)
    print(f"{total} 件の店舗を処理します...\n")

    for i, row in enumerate(rows, 1):
        key        = row["店舗名称"]
        place_name = row.get("place_name") or row["店舗名称"]
        address    = row.get("formatted_address", "")
        category   = row.get("category", "")
        cached     = checkpoint.get(key, {})

        # ① Places API: チェックポイントに google_maps_url があれば再利用（空でも済み扱い）
        if cached.get("google_maps_url") is not None and "google_maps_url" in cached:
            row["phone"]           = cached.get("phone", "")
            row["official_url"]    = cached.get("official_url", "")
            row["google_maps_url"] = cached.get("google_maps_url", "")
            row["google_summary"]  = cached.get("google_summary", "")
            places_done = True
        else:
            print(f"[{i:4}/{total}] {key}  [{category}] → Places取得")
            place_id            = get_place_id(place_name, address)
            time.sleep(0.2)
            details             = get_place_details(place_id) if place_id else {}
            row["phone"]        = details.get("formatted_phone_number", "")
            row["official_url"] = details.get("website", "")
            row["google_maps_url"] = make_google_maps_url(place_id)
            row["google_summary"]  = build_google_summary(details)
            time.sleep(0.2)
            places_done = False

        # ② Perplexity: raw_description が空でなければスキップ
        if cached.get("raw_description", ""):
            for field in PERPLEXITY_FIELDS:
                row[field] = cached.get(field, "")
            row["description"] = cached.get("description", "")
            if places_done:
                print(f"[{i:4}/{total}] (skip) {key}")
        else:
            if places_done:
                print(f"[{i:4}/{total}] {key}  [{category}] → Perplexity取得")
            plex = search_with_perplexity(key, address, category)
            time.sleep(1.2)
            for field in PERPLEXITY_FIELDS:
                row[field] = plex.get(field, "")
            row["description"] = cached.get("description", "")  # Claude Code 生成分は保持

        # チェックポイント更新
        checkpoint[key] = {f: row[f] for f in NEW_FIELDS}

        if i % 10 == 0:
            save_checkpoint(checkpoint)
            write_csv(rows)
            print(f"  → 保存 ({i}/{total})")

    save_checkpoint(checkpoint)
    write_csv(rows)

    def count(field): return sum(1 for r in rows if r[field])

    print(f"\n完了: {total} 件処理")
    print(f"  電話番号        : {count('phone')} 件")
    print(f"  公式HP          : {count('official_url')} 件")
    print(f"  Google Maps URL : {count('google_maps_url')} 件")
    print(f"  Google概要      : {count('google_summary')} 件")
    print(f"  Instagram       : {count('instagram_url')} 件")
    print(f"  TikTok          : {count('tiktok_url')} 件")
    print(f"  X               : {count('x_url')} 件")
    print(f"  Facebook        : {count('facebook_url')} 件")
    print(f"  YouTube         : {count('youtube_url')} 件")
    print(f"  LINE            : {count('line_url')} 件")
    print(f"  食べログ        : {count('tabelog_url')} 件")
    print(f"  ホットペッパー  : {count('hotpepper_url')} 件")
    print(f"  じゃらん        : {count('jalan_url')} 件")
    print(f"  raw_description : {count('raw_description')} 件")
    print(f"  description     : {count('description')} 件")
    print(f"  出力            : {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
