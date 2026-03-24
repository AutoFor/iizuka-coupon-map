"""
全店舗のカテゴリを Perplexity で自由カテゴリに再分類する
"""

import asyncio
import csv
import json
import os
import re
from pathlib import Path

import aiohttp

BASE       = Path(__file__).parent
ENRICHED   = BASE / "csv_merged" / "enriched.csv"
CHECKPOINT = BASE / "csv_merged" / "reclassify_checkpoint.json"
PPLX_KEY   = os.environ.get("PERPLEXITY_API_KEY", "")
PPLX_URL   = "https://api.perplexity.ai/chat/completions"

PROMPT_TEMPLATE = """福岡県飯塚市にある「{name}」（地区：{district}、ウェブサイト：{website}）はどのような業種の店舗ですか？
以下のJSON形式のみで返してください（説明文・マークダウン不要）:
{{"category": "業種を日本語で簡潔に（例：補聴器販売、花屋、バー、古着屋、鍼灸院）"}}"""


async def fetch_category(session, name, district, website, semaphore):
    async with semaphore:
        payload = {
            "model": "sonar",
            "messages": [{"role": "user", "content": PROMPT_TEMPLATE.format(
                name=name, district=district, website=website or "不明"
            )}],
            "return_citations": False,
        }
        headers = {"Authorization": f"Bearer {PPLX_KEY}", "Content-Type": "application/json"}
        for attempt in range(3):
            try:
                async with session.post(PPLX_URL, json=payload, headers=headers,
                                        timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    data = await resp.json()
                    content = data["choices"][0]["message"]["content"]
                    match = re.search(r'\{.*?\}', content, re.DOTALL)
                    if match:
                        result = json.loads(match.group())
                        return result.get("category")
            except Exception as e:
                if attempt == 2:
                    print(f"  ERROR [{name}]: {e}")
                await asyncio.sleep(2)
        return None


async def main():
    if not PPLX_KEY:
        raise ValueError("PERPLEXITY_API_KEY が設定されていません")

    with open(ENRICHED, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    targets = rows
    print(f"再分類対象: {len(targets)} 件")

    checkpoint = {}
    if CHECKPOINT.exists():
        checkpoint = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        print(f"チェックポイント: {len(checkpoint)} 件完了済み")

    todo = [r for r in targets if r["name"] not in checkpoint]
    print(f"処理対象: {len(todo)} 件")

    semaphore = asyncio.Semaphore(5)
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_category(session, r["name"], r["address_raw"], r["website"], semaphore) for r in todo]
        batch_size = 20
        for i in range(0, len(tasks), batch_size):
            batch_results = await asyncio.gather(*tasks[i:i+batch_size])
            for row, category in zip(todo[i:i+batch_size], batch_results):
                checkpoint[row["name"]] = category or "その他"
            CHECKPOINT.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2), encoding="utf-8")
            done = len(checkpoint)
            print(f"  進捗: {done}/{len(targets)} ({done/len(targets)*100:.1f}%)")

    # enriched.csv を更新
    updated = 0
    for row in rows:
        if row["name"] in checkpoint:
            new_cat = checkpoint[row["name"]]
            if new_cat:
                row["category"] = new_cat
                updated += 1

    fieldnames = list(rows[0].keys())
    with open(ENRICHED, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nカテゴリ更新: {updated} 件")
    print(f"完了: {ENRICHED}")
    if CHECKPOINT.exists():
        CHECKPOINT.unlink()


if __name__ == "__main__":
    asyncio.run(main())
