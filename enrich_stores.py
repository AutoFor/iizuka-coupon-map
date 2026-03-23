"""
飯塚市クーポン店舗データ Perplexity API 補完スクリプト
- カテゴリ自動付与（キーワードマッチング）
- Perplexity sonar API で住所・電話・HP・SNS を補完
- 途中保存あり（中断しても再開可能）
"""

import asyncio
import csv
import json
import os
import re
import time
from pathlib import Path

import aiohttp

# ── パス設定 ─────────────────────────────────────────
BASE = Path(__file__).parent
INPUT_CSV   = BASE / "csv_merged" / "merged.csv"
OUTPUT_CSV  = BASE / "csv_merged" / "enriched.csv"
CHECKPOINT  = BASE / "csv_merged" / "checkpoint.json"

PPLX_KEY = os.environ.get("PERPLEXITY_API_KEY", "")

# ── カテゴリルール（優先順位順） ──────────────────────
CATEGORY_RULES = [
    ("コンビニ",         ["セブンイレブン", "ファミリーマート", "ローソン", "ミニストップ", "デイリーヤマザキ"]),
    ("スーパー",         ["ハローデイ", "イオン", "スーパー川食", "ミスターマックス", "ドン・キホーテ", "ＭＥＧＡ"]),
    ("ドラッグストア",   ["ドラッグストア", "ドラッグ", "薬局", "薬店", "調剤"]),
    ("ホームセンター",   ["ナフコ", "コメリ", "カインズ", "DCM"]),
    ("家電量販店",       ["ヤマダデンキ", "ヤマダ電機", "エディオン", "でんき", "電器"]),
    ("衣料・アパレル",   ["ユニクロ", "洋服の青山", "しまむら", "ファッション", "呉服", "着物"]),
    ("ファストフード",   ["マクドナルド", "モスバーガー", "ケンタッキー", "バーガー", "ウエスト"]),
    ("ラーメン",         ["ラーメン", "らーめん"]),
    ("焼肉・ホルモン",   ["焼肉", "ホルモン", "炭火焼肉"]),
    ("寿司・海鮮",       ["寿司", "鮨", "すし", "海鮮"]),
    ("居酒屋",           ["居酒屋", "酒肴", "酒場", "もつ家", "串亭", "串かつ"]),
    ("カフェ",           ["カフェ", "Cafe", "café", "珈琲", "コーヒー", "喫茶"]),
    ("パン・スイーツ",   ["パン", "ベーカリー", "ケーキ", "菓子司", "スイーツ", "PATISSERIE", "patisserie"]),
    ("和食・定食",       ["食堂", "うどん", "そば", "天ぷら", "とんかつ", "定食"]),
    ("エスニック料理",   ["インド料理", "中華", "韓国", "タイ料理"]),
    ("レストラン・洋食", ["レストラン", "イタリアン", "フレンチ", "洋食"]),
    ("美容室・理容室",   ["ヘアー", "ヘア", "Hair", "HAIR", "美容室", "理容室", "理容", "美容院", "カットハウス"]),
    ("サロン・エステ",   ["エステ", "ネイル", "まつ毛", "脱毛", "ホワイトニング", "サロン"]),
    ("整体・マッサージ", ["整体", "マッサージ", "接骨", "整骨", "カイロ", "癒"]),
    ("フィットネス",     ["ジム", "フィットネス", "トレーニング", "ヨガ", "ゴルフセンター"]),
    ("医療・歯科",       ["クリニック", "医院", "病院", "歯科", "眼科", "内科", "外科"]),
    ("自動車関連",       ["自動車", "タイヤ", "板金", "整備", "タクシー", "ガレージ", "カー"]),
    ("ガソリンスタンド", ["石油", "ガソリン", "エネオス", "出光"]),
    ("不動産・建築",     ["不動産", "建築", "工務", "リフォーム", "住宅"]),
    ("葬儀・冠婚",       ["葬祭", "葬儀", "斎場", "会館"]),
    ("時計・眼鏡",       ["時計", "眼鏡", "メガネ", "めがね"]),
    ("写真館",           ["写真館", "フォトスタジオ"]),
    ("通信・スマホ",     ["ドコモ", "ソフトバンク", "スマホ", "携帯"]),
    ("学習・教室",       ["学習", "塾", "スクール", "教室", "習字"]),
    ("農業・食品",       ["農楽園", "農園", "米穀", "たまご", "食品"]),
    ("福祉・介護",       ["福祉", "介護", "デイ", "障害", "支援"]),
    ("酒類販売",         ["酒屋", "酒店", "ビール", "ワイン"]),
]

def categorize(name: str) -> str:
    for category, keywords in CATEGORY_RULES:
        if any(kw in name for kw in keywords):
            return category
    return "その他"


# ── Perplexity API 呼び出し ───────────────────────────
PPLX_URL = "https://api.perplexity.ai/chat/completions"

PROMPT_TEMPLATE = """福岡県飯塚市にある「{name}」（地区：{district}）の店舗情報を調べて、以下のJSON形式のみで返してください（説明文・マークダウン不要）:
{{"address": "〒XXX-XXXX 福岡県飯塚市から始まる番地まで含むフル住所", "phone": "電話番号（ハイフン区切り）", "website": "公式HPのURL", "facebook": "FacebookページURL", "instagram": "InstagramアカウントURL"}}
見つからない項目はnullにしてください。"""

async def fetch_store_info(session: aiohttp.ClientSession, name: str, district: str, semaphore: asyncio.Semaphore) -> dict:
    async with semaphore:
        payload = {
            "model": "sonar",
            "messages": [{"role": "user", "content": PROMPT_TEMPLATE.format(name=name, district=district)}],
            "return_citations": False,
        }
        headers = {
            "Authorization": f"Bearer {PPLX_KEY}",
            "Content-Type": "application/json",
        }
        for attempt in range(3):
            try:
                async with session.post(PPLX_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    data = await resp.json()
                    content = data["choices"][0]["message"]["content"]
                    # JSONブロック抽出
                    match = re.search(r'\{.*\}', content, re.DOTALL)
                    if match:
                        return json.loads(match.group())
            except Exception as e:
                if attempt == 2:
                    print(f"  ERROR [{name}]: {e}")
                await asyncio.sleep(2)
        return {"address": None, "phone": None, "website": None, "facebook": None, "instagram": None}


# ── メイン処理 ────────────────────────────────────────
async def main():
    if not PPLX_KEY:
        raise ValueError("PERPLEXITY_API_KEY が設定されていません")

    # 入力CSV読み込み
    with open(INPUT_CSV, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    # カテゴリ付与
    for row in rows:
        row["category"] = categorize(row["店舗名称"])

    # チェックポイント読み込み（再開用）
    checkpoint: dict = {}
    if CHECKPOINT.exists():
        checkpoint = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        print(f"チェックポイント読み込み: {len(checkpoint)} 件完了済み")

    # 未処理の行を抽出
    todo = [r for r in rows if r["店舗名称"] not in checkpoint]
    done = {r["店舗名称"]: checkpoint[r["店舗名称"]] for r in rows if r["店舗名称"] in checkpoint}
    print(f"処理対象: {len(todo)} 件 / 完了済み: {len(done)} 件")

    # 並列実行（同時5リクエスト）
    semaphore = asyncio.Semaphore(5)
    connector = aiohttp.TCPConnector(limit=10)

    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [fetch_store_info(session, r["店舗名称"], r["住所"], semaphore) for r in todo]

        results = []
        batch_size = 20
        for i in range(0, len(tasks), batch_size):
            batch_tasks = tasks[i:i+batch_size]
            batch_rows  = todo[i:i+batch_size]
            batch_results = await asyncio.gather(*batch_tasks)
            for row, info in zip(batch_rows, batch_results):
                done[row["店舗名称"]] = info
                results.append((row, info))
            # チェックポイント保存
            CHECKPOINT.write_text(json.dumps(done, ensure_ascii=False, indent=2), encoding="utf-8")
            completed = len(done)
            total = len(rows)
            print(f"  進捗: {completed}/{total} ({completed/total*100:.1f}%)")

    # CSV出力
    fieldnames = ["name", "category", "address_raw", "address", "phone", "website", "facebook", "instagram", "digital", "paper"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            info = done.get(row["店舗名称"], {})
            writer.writerow({
                "name":        row["店舗名称"],
                "category":    row["category"],
                "address_raw": row["住所"],
                "address":     info.get("address") or "",
                "phone":       info.get("phone") or "",
                "website":     info.get("website") or "",
                "facebook":    info.get("facebook") or "",
                "instagram":   info.get("instagram") or "",
                "digital":     row["digital"],
                "paper":       row["paper"],
            })

    print(f"\n完了: {OUTPUT_CSV}")
    # チェックポイント削除
    if CHECKPOINT.exists():
        CHECKPOINT.unlink()


if __name__ == "__main__":
    asyncio.run(main())
