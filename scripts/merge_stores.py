#!/usr/bin/env python3
"""
stores_enriched.csv の重複店舗（同名・digital+paper）を1行にマージする
券種: digital / paper → both
"""

import csv
import os

INPUT_CSV  = os.path.join(os.path.dirname(__file__), "../csv/stores_enriched.csv")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "../csv/stores_merged.csv")

FIELDNAMES = ["店舗名称", "エリア", "券種", "place_name", "formatted_address", "lat", "lng", "category"]


def main():
    with open(INPUT_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # 店舗名でグループ化（出現順を保持）
    merged: dict[str, dict] = {}
    for row in rows:
        name = row["店舗名称"]
        if name not in merged:
            merged[name] = dict(row)
        else:
            # 既存エントリと券種が違えば both に更新
            existing = merged[name]["券種"]
            incoming = row["券種"]
            if existing != incoming:
                merged[name]["券種"] = "both"

    result = list(merged.values())

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(result)

    both_count = sum(1 for r in result if r["券種"] == "both")
    print(f"入力: {len(rows)} 行")
    print(f"出力: {len(result)} 行（削減: {len(rows) - len(result)} 行）")
    print(f"両対応(both): {both_count} 店舗")
    print(f"→ {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
