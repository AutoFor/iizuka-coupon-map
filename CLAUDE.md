# 改修後のテスト手順

コードを改修したら、必ず以下のコマンドを実行して結果が正しいか確認すること。

```bash
env TARGET_URL=http://127.0.0.1:8081 npm run dump:localhost
env TARGET_URL=http://127.0.0.1:8081 npm run dump:desktop
env TARGET_URL=http://127.0.0.1:8081 npm run dump:mobile
```

各コマンドの出力（`playwright-output/` 配下のスクリーンショット・コンソールログ・DOM）を確認し、
表示・動作が正しいことを検証してからユーザーに報告すること。
