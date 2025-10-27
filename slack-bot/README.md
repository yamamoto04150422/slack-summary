# Slack Bot

Slack Bot アプリケーション。`/summary` コマンドでチャンネルのメッセージを要約します。

## セットアップ

1. 環境変数の設定

```bash
cp .env.example .env
# .env にSlack Appの認証情報を記入
```

2. 依存関係のインストール

```bash
npm install
```

3. アプリの起動

```bash
npm start
# または開発モード
npm run dev
```

## 必要な Slack App 設定

- **Bot Token Scopes**

  - `chat:write` - メッセージ送信
  - `commands` - Slash コマンド
  - `channels:history` - チャンネル履歴取得
  - `groups:history` - プライベートチャンネル履歴取得
  - `im:history` - DM 履歴取得

- **Slash Command**

  - Command: `/summary`
  - Request URL: (Socket Mode なので不要)
  - Short description: `チャンネルの会話を要約します`
  - Usage hint: `チャンネルで /summary と入力してください`

- **Socket Mode**
  - App-Level Token を作成し、`connections:write` scope を付与

