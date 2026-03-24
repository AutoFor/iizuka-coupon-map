"""
住所が空の店舗だけ Perplexity で再取得して enriched.csv を更新する
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
CHECKPOINT = BASE / "csv_merged" / "retry_checkpoint.json"
PPLX_KEY   = os.environ.get("PERPLEXITY_API_KEY", "")
PPLX_URL   = "https://api.perplexity.ai/chat/completions"

PROMPT_TEMPLATE = """福岡県飯塚市にある「{name}」（地区：{district}）の店舗情報を調べてください。
以下のJSON形式のみで返してください（説明文・マークダウン・コードブロック不要）:
{{"address": "〒XXX-XXXX 福岡県飯塚市から始まる番地まで含むフル住所", "phone": "電話番号（ハイフン区切り）", "website": "公式HPのURL", "facebook": "FacebookページURL", "instagram": "InstagramアカウントURL"}}
見つからない項目はnullにしてください。"""

async def fetch(session, name, district, semaphore):
    async with semaphore:
        payload = {
            "model": "sonar",
            "messages": [{"role": "user", "content": PROMPT_TEMPLATE.format(name=name, district=district)}],
            "return_citations": False,
        }
        headers = {"Authorization": f"Bearer {PPLX_KEY}", "Content-Type": "application/json"}
        for attempt in range(3):
            try:
                async with session.post(PPLX_URL, json=payload, headers=headers,
                                        timeout=aiohttp.ClientTimeout(total=40)) as resp:
                    if resp.status == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    data = await resp.json()
                    content = data["choices"][0]["message"]["content"]
                    match = re.search(r'\{.*?\}', content, re.DOTALL)
                    if match:
                        return json.loads(match.group())
            except Exception as e:
                if attempt == 2:
                    print(f"  ERROR [{name}]: {e}")
                await asyncio.sleep(2)
        return None


async def main():
    # enriched.csv 読み込み
    with open(ENRICHED, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    # 住所空の行を抽出
    targets = [r for r in rows if not r["address"]]
    print(f"再取得対象: {len(targets)} 件")

    # チェックポイント読み込み
    checkpoint = {}
    if CHECKPOINT.exists():
        checkpoint = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        print(f"チェックポイント: {len(checkpoint)} 件完了済み")

    todo = [r for r in targets if r["name"] not in checkpoint]
    print(f"処理対象: {len(todo)} 件")

    semaphore = asyncio.Semaphore(5)
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, r["name"], r["address_raw"], semaphore) for r in todo]
        batch_size = 20
        for i in range(0, len(tasks), batch_size):
            batch_results = await asyncio.gather(*tasks[i:i+batch_size])
            for row, info in zip(todo[i:i+batch_size], batch_results):
                if info:
                    checkpoint[row["name"]] = info
            CHECKPOINT.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2), encoding="utf-8")
            done = len(checkpoint)
            print(f"  進捗: {done}/{len(targets)} ({done/len(targets)*100:.1f}%)")

    # enriched.csv を更新
    updated = 0
    for row in rows:
        if row["name"] in checkpoint:
            info = checkpoint[row["name"]]
            for key in ["address", "phone", "website", "facebook", "instagram"]:
                if not row[key] and info.get(key):
                    row[key] = info[key]
                    if key == "address":
                        updated += 1

    fieldnames = list(rows[0].keys())
    with open(ENRICHED, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n住所更新: {updated} 件")
    print(f"完了: {ENRICHED}")
    if CHECKPOINT.exists():
        CHECKPOINT.unlink()


if __name__ == "__main__":
    asyncio.run(main())
