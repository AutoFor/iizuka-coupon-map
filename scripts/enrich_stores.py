#!/usr/bin/env python3
"""
stores.csv に lat/lng・正式住所・カテゴリを追加するスクリプト
Google Places API (Text Search) を使用
"""

import csv
import json
import os
import time
import urllib.parse
import urllib.request

API_KEY = os.environ.get("GOOGLE_API_KEY", "")
INPUT_CSV = os.path.join(os.path.dirname(__file__), "../csv/stores.csv")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "../csv/stores_enriched.csv")

PLACES_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"

# Places API の types を日本語カテゴリに変換（主要なもののみ）
TYPE_MAP = {
    "restaurant": "飲食店",
    "food": "飲食店",
    "cafe": "カフェ",
    "bakery": "ベーカリー",
    "bar": "バー",
    "store": "店舗",
    "clothing_store": "衣料品店",
    "electronics_store": "電器店",
    "grocery_or_supermarket": "スーパー",
    "supermarket": "スーパー",
    "convenience_store": "コンビニ",
    "drugstore": "ドラッグストア",
    "pharmacy": "薬局",
    "hair_care": "美容室",
    "beauty_salon": "美容室",
    "gym": "ジム",
    "health": "健康・医療",
    "doctor": "医療機関",
    "hospital": "病院",
    "car_repair": "自動車修理",
    "gas_station": "ガソリンスタンド",
    "lodging": "宿泊施設",
    "real_estate_agency": "不動産",
    "bank": "銀行",
    "atm": "ATM",
    "jewelry_store": "宝飾店",
    "shoe_store": "靴店",
    "florist": "花屋",
    "furniture_store": "家具店",
    "home_goods_store": "生活雑貨",
    "pet_store": "ペット",
    "book_store": "書店",
    "optician": "眼鏡店",
    "movie_theater": "映画館",
    "amusement_park": "アミューズメント",
    "cemetery": "墓地・斎場",
    "funeral_home": "葬儀場",
    "place_of_worship": "宗教施設",
    "laundry": "クリーニング",
    "car_dealer": "自動車販売",
    "car_wash": "洗車",
    "parking": "駐車場",
    "transit_station": "交通",
    "school": "学校・教育",
    "university": "大学",
    "library": "図書館",
    "post_office": "郵便局",
    "accounting": "会計・税理士",
    "insurance_agency": "保険",
    "travel_agency": "旅行代理店",
    "moving_company": "引越し",
    "painter": "塗装",
    "plumber": "水道",
    "electrician": "電気工事",
    "general_contractor": "建設・工事",
    "roofing_contractor": "屋根工事",
    "storage": "倉庫",
    "veterinary_care": "動物病院",
    "spa": "スパ・エステ",
    "night_club": "ナイトクラブ",
    "bowling_alley": "ボウリング",
    "casino": "カジノ",
    "stadium": "スタジアム",
    "zoo": "動物園",
    "aquarium": "水族館",
    "art_gallery": "ギャラリー",
    "museum": "博物館・美術館",
    "campground": "キャンプ場",
    "rv_park": "RVパーク",
    "natural_feature": "自然",
    "park": "公園",
    "tourist_attraction": "観光スポット",
    "locality": "地域",
    "sublocality": "地域",
}


def translate_types(types: list[str]) -> str:
    for t in types:
        if t in TYPE_MAP:
            return TYPE_MAP[t]
    # マッピングになければ最初の type をそのまま返す（点数・establishment 等は除外）
    skip = {"point_of_interest", "establishment", "geocode", "premise"}
    for t in types:
        if t not in skip:
            return t
    return "その他"


def search_place(store_name: str, area: str) -> dict:
    query = f"{store_name} {area} 飯塚市"
    params = urllib.parse.urlencode({
        "query": query,
        "language": "ja",
        "region": "jp",
        "key": API_KEY,
    })
    url = f"{PLACES_URL}?{params}"

    try:
        with urllib.request.urlopen(url, timeout=10) as res:
            data = json.loads(res.read().decode())
    except Exception as e:
        print(f"  [ERROR] {store_name}: {e}")
        return {}

    if data.get("status") != "OK" or not data.get("results"):
        print(f"  [NOT FOUND] {store_name} ({data.get('status')})")
        return {}

    result = data["results"][0]
    location = result.get("geometry", {}).get("location", {})
    return {
        "place_name": result.get("name", ""),
        "formatted_address": result.get("formatted_address", ""),
        "lat": location.get("lat", ""),
        "lng": location.get("lng", ""),
        "category": translate_types(result.get("types", [])),
    }


def main():
    if not API_KEY:
        print("ERROR: 環境変数 GOOGLE_API_KEY が設定されていません")
        print("  export GOOGLE_API_KEY=<your_key> を実行してください")
        return

    with open(INPUT_CSV, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    print(f"{len(rows)} 件の店舗を処理します...\n")

    results = []
    for i, row in enumerate(rows, 1):
        store = row["店舗名称"]
        area = row["住所"]
        coupon = row["券種"]

        print(f"[{i:3}/{len(rows)}] {store} ({area})")
        info = search_place(store, area)

        results.append({
            "店舗名称": store,
            "エリア": area,
            "券種": coupon,
            "place_name": info.get("place_name", ""),
            "formatted_address": info.get("formatted_address", ""),
            "lat": info.get("lat", ""),
            "lng": info.get("lng", ""),
            "category": info.get("category", ""),
        })

        # API レート制限対策 (10 req/s まで)
        time.sleep(0.2)

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        fieldnames = ["店舗名称", "エリア", "券種", "place_name", "formatted_address", "lat", "lng", "category"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    found = sum(1 for r in results if r["lat"])
    print(f"\n完了: {found}/{len(results)} 件取得 → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
