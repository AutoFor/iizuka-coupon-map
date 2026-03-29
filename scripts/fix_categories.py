#!/usr/bin/env python3
"""
stores_enriched.csv の category 列を後処理で修正するスクリプト
- 英語のまま残っている category を日本語に変換
- 空白の category を「その他」に置換
"""

import csv
import os

INPUT_CSV = os.path.join(os.path.dirname(__file__), "../csv/stores_enriched.csv")
OUTPUT_CSV = INPUT_CSV  # 上書き

EN_TO_JA = {
    "funeral_home": "葬儀場",
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
    "park": "公園",
    "tourist_attraction": "観光スポット",
    "locality": "地域",
    "sublocality": "地域",
    "natural_feature": "自然",
    "ATM": "コンビニ",  # セブンイレブンが ATM になっていたケース
}


def fix_category(cat: str, store_name: str = "") -> str:
    if not cat:
        return "その他"
    if cat in EN_TO_JA:
        return EN_TO_JA[cat]
    # 全角英字や記号が混じっている場合もそのまま返す
    return cat


def main():
    with open(INPUT_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    fixed = 0
    for row in rows:
        original = row["category"]
        row["category"] = fix_category(original, row.get("店舗名称", ""))
        if row["category"] != original:
            fixed += 1
            print(f"  {row['店舗名称']}: {original!r} → {row['category']!r}")

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        fieldnames = ["店舗名称", "エリア", "券種", "place_name", "formatted_address", "lat", "lng", "category"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{fixed} 件修正 → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
