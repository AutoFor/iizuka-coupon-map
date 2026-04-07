# 令和8年 飯塚市生活応援クーポン券マップ

飯塚市が発行する生活応援クーポン券が使えるお店を、地図で探せるWebサービスです。

**URL:** https://www.afr-iizuka-seikatsu-coupon-2026.jp

---

## このサービスでできること

- **地図でお店を探す** — ピンをタップ・クリックするとお店の情報が表示されます
- **カテゴリで絞り込む** — グルメ・飲食、小売・買い物など業種別に絞り込めます
- **券種で絞り込む** — デジタルクーポンのみ、紙クーポンのみ、両方OKで絞り込めます
- **店舗名で検索する** — キーワードで素早くお店を探せます

---

## このHPについて

- 飯塚市が公開しているPDFを元に、AutoFor株式会社がAIを活用して作成しました
- 掲載情報の正確性・最新性・完全性を保証するものではありません
- 情報の修正・追加・削除のご要望は、サイト内の「お問い合わせ」からご連絡ください

---

## 制作者・お問い合わせ

**AutoFor株式会社**
https://autofor.co.jp/

| SNS | リンク |
|-----|--------|
| X（旧Twitter） | [@Kawashima_RPA](https://x.com/Kawashima_RPA) |
| Qiita | [Kawashima_RPA](https://qiita.com/Kawashima_RPA) |

---

## 技術情報（エンジニア向け）

| 項目 | 内容 |
|------|------|
| フロントエンド | HTML / CSS / JavaScript（ライブラリなし） |
| 地図 | [Leaflet.js](https://leafletjs.com/) + OpenStreetMap |
| データ | CSV（`csv/stores_enriched.csv`） |
| バックエンド | Azure Functions（お問い合わせ送信） |
| ホスティング | Azure Static Web Apps |
| CI/CD | GitHub Actions（masterブランチへのpushで自動デプロイ） |

### ローカルで動かす

```bash
# 依存パッケージのインストール（初回のみ）
npm install

# ローカルサーバーを起動（ポート8081）
python3 -m http.server 8081

# ブラウザで開く
# http://127.0.0.1:8081
```

### 動作確認（Playwright）

```bash
env TARGET_URL=http://127.0.0.1:8081 npm run dump:desktop
env TARGET_URL=http://127.0.0.1:8081 npm run dump:mobile
```

`playwright-output/` にスクリーンショット・コンソールログ・HTMLが保存されます。

### データの更新

1. `csv/stores_enriched.csv` を編集
2. `master` ブランチにpush → GitHub Actionsが自動でデプロイ

---

## ライセンス

掲載データは[飯塚市公開情報](https://www.city.iizuka.lg.jp/soshiki/70/14632.html)を元にしています。
コードの利用については AutoFor株式会社までお問い合わせください。
