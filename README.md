# ノクトのまいにち服薬

内服薬の登録、時間帯別の服薬チェック、通知、履歴カレンダー、頓服記録を端末内だけで管理するNext.js PWAです。

## ローカル起動

```bash
npm install
npm run dev
```

## 確認

```bash
npm run lint
npm run build
```

`GITHUB_ACTIONS=true` でビルドすると、`/medication-app` を基準パスにしたGitHub Pages用の静的ファイルを `out` に生成します。

## データについて

- お薬・履歴・通知設定はブラウザのLocalStorageに保存します。
- お薬の写真はIndexedDBに保存します。
- クラウド同期、薬効判定、相互作用判定は行いません。
- 本アプリは医療機器ではありません。医師・薬剤師の指示を優先してください。
