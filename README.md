# Slack 要約エンジン 要件定義（MVP 版）

## 📑 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [機能要件](#2-機能要件)
3. [非機能要件](#3-非機能要件セキュリティ運用)
4. [構成方針（アーキテクチャ）](#4-構成方針アーキテクチャ)
5. [リポジトリ構成](#5-リポジトリ構成)
6. [今後の拡張予定](#6-今後の拡張予定mvp-以降)
7. [開発フェーズ優先度まとめ](#7-開発フェーズ優先度まとめ)
8. [補足アドバイス](#-補足アドバイス)
9. [クイックスタート](#クイックスタート)
10. [ディレクトリ構成](#-ディレクトリ構成)
11. [開発](#開発)
12. [環境変数](#環境変数)
13. [日常的な起動手順](#日常的な起動手順)
14. [トラブルシューティング](#トラブルシューティング)
15. [その他のドキュメント](#その他のドキュメント)

---

## 1. プロジェクト概要

Slack 上の特定チャンネルの会話を自動または手動で取得し、
ローカル環境内で要約結果を生成・投稿するツールを開発する。
まずは外部クラウドを使わず、完全ローカルで動作する MVP を目指す。

## 2. 機能要件

| 項目     | 内容                                                                |
| -------- | ------------------------------------------------------------------- |
| 要約対象 | 特定チャンネル（例：#project-discussion）                           |
| 要約頻度 | 手動トリガー（`/summary` コマンド）から開始し、後に毎朝自動化を追加 |
| 保存範囲 | 要約結果のみを DB へ保存（全文ログは保持しない）                    |
| 出力方法 | 要約結果を Slack スレッドまたは指定チャンネルに投稿                 |
| 再実行   | 同日の再要約も可能（最新メッセージを対象）                          |
| 対象期間 | 前回要約以降〜最新投稿まで                                          |

## 3. 非機能要件（セキュリティ・運用）

| 項目         | 内容                                            |
| ------------ | ----------------------------------------------- |
| 実行環境     | ローカル PC またはローカル VM 上（Docker 利用） |
| 通信範囲     | Slack API 以外は外部通信を行わない              |
| 認証情報     | `.env` ファイルで管理（Slack Bot Token など）   |
| ログ保持期間 | DB に要約履歴のみ保持（期間制限なし）           |
| 拡張性       | 後に AWS 移行（ECS/EC2/VPC）を想定              |
| モデル実行   | Ollama を利用しローカル LLM で推論処理          |
| 可用性       | ローカル開発向け（単一プロセスで稼働）          |

## 4. 構成方針（アーキテクチャ）

| 要素         | 技術候補                                | 補足                                 |
| ------------ | --------------------------------------- | ------------------------------------ |
| Slack Bot    | Bolt for JavaScript (Node.js)           | Slash コマンド `/summary` で要約実行 |
| 要約 API     | FastAPI（Python） or Express（Node.js） | Ollama 呼び出し用の内部 API          |
| LLM モデル   | Llama 3 8B（Ollama 経由）               | 無料・ローカル実行可能。Mac でも OK  |
| DB           | PostgreSQL                              | 要約履歴保存・再利用用               |
| インフラ構成 | Docker Compose                          | Slack Bot + API + DB を一括起動      |
| 通信制御     | ローカル LAN 内                         | VPN など不要。まずは開発端末内で完結 |

## 5. リポジトリ構成

🔧 将来的に AWS や CI/CD 対応を見越してリポジトリを分割する

```
root/
 ├── slack-bot/       # Slackアプリケーション（Bolt）
 ├── summary-api/      # LLM要約API（Ollama + LangChain）
 ├── infra/            # Docker, docker-compose, env設定
 └── README.md         # 開発手順・構成説明
```

**補足：**

- 「全体のリポジトリ」という理解で OK です。→ 各ディレクトリが独立して動く構成（Bot, API, DB）
- 最初は docker-compose で 3 つを同時起動させる想定。
- AWS 移行時は `/infra` 配下に Terraform / ECS 設定を追加可能。

## 6. 今後の拡張予定（MVP 以降）

| 段階 | 内容                              | 目的                     |
| ---- | --------------------------------- | ------------------------ |
| v1.0 | `/summary` コマンドで要約結果返信 | MVP 完成                 |
| v1.1 | 定期要約（毎朝 9 時）             | 自動化                   |
| v1.2 | 要約履歴の Slack 閲覧コマンド     | 使いやすさ向上           |
| v2.0 | AWS 移行（ECS + RDS）             | セキュリティ・運用安定化 |

## 開発フェーズ優先度まとめ

| フェーズ                 | 内容                        | 優先度 |
| ------------------------ | --------------------------- | ------ |
| ① Slack Bot の作成       | `/summary` でメッセージ取得 | ★★★★★  |
| ② Ollama + 要約 API 構築 | テキストを要約              | ★★★★☆  |
| ③ Slack への返信処理     | 要約結果を投稿              | ★★★★☆  |
| ④ DB 保存                | 要約履歴保存                | ★★★☆☆  |
| ⑤ Docker 化              | ローカル環境構築            | ★★★☆☆  |

## 💡 補足アドバイス

**要約モデル（Llama3 8B）**は Ollama で簡単に動作確認できます。

Mac / Windows 対応。GPU 不要でも OK。

コマンド例：

```bash
ollama pull llama3
ollama run llama3 "この文章を要約してください。"
```

VPN 制御は後回しで OK。
ローカル開発時は Slack API 呼び出し以外に外部通信しなければ安全。

---

## クイックスタート

### 1. Ollama のインストール

```bash
# Mac
brew install ollama

# Windows / Linux
# https://ollama.ai からダウンロード
```

### 2. Ollama サーバーの起動

```bash
# Ollamaサーバーを起動（新しいターミナルで実行）
ollama serve
```

**重要:**

- `ollama serve` コマンドはサーバーを起動します
- このコマンドを実行すると、そのターミナルでは他のコマンドが入力できなくなります
- 別のターミナルウィンドウを開いて次のステップ（`ollama pull llama3`）を実行してください
- サーバーが既に動いている場合は、別のターミナルで `ollama list` を実行して確認できます

### 3. Llama 3 モデルのダウンロード

```bash
ollama pull llama3
```

### 4. Docker Desktop のインストールと起動

```bash
# Mac
# https://www.docker.com/products/docker-desktop からダウンロードしてインストール

# またはHomebrewでインストール
brew install --cask docker

# Docker Desktopを起動（Applicationsフォルダから起動）
open -a Docker
```

**確認方法:**

```bash
# ターミナルで確認
docker --version
docker compose version
```

**注意:**

- Docker Desktop が起動するまで数分かかることがあります
- Docker Desktop が起動しているかは、メニューバーの Docker アイコンで確認できます
- ターミナルで `docker ps` を実行してエラーが出なければ起動しています

### 5. Slack App の作成

**方法 1: From scratch（手動設定）**

1. https://api.slack.com/apps にアクセス
2. "Create New App" → "From scratch"
3. App Name: `slack-summary`
4. Workspace を選択

**方法 2: App Manifest（推奨・簡単）**

1. https://api.slack.com/apps にアクセス
2. "Create New App" → "From an app manifest"
3. Workspace を選択
4. 以下のマニフェストをコピー＆ペースト：

<details>
<summary>📋 YAML形式（クリックして展開）</summary>

```yaml
display_information:
  name: slack-summary
  description: Slack会話を自動要約するBot
  background_color: "#2c2d30"

features:
  bot_user:
    display_name: slack-summary
    always_online: false

oauth_config:
  scopes:
    bot:
      - channels:history
      - chat:write
      - commands
```

</details>

<details>
<summary>📋 JSON形式（クリックして展開）</summary>

```json
{
  "display_information": {
    "name": "slack-summary",
    "description": "Slack会話を自動要約するBot",
    "background_color": "#2c2d30"
  },
  "features": {
    "bot_user": {
      "display_name": "slack-summary",
      "always_online": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": ["channels:history", "chat:write", "commands"]
    }
  }
}
```

</details>

5. "Create" をクリック

6. **Socket Mode を有効化**

   - サイドバーから "Socket Mode" を選択
   - "Enable Socket Mode" を有効化
   - "Generate Token" をクリックして App-Level Token を作成
   - Scope: `connections:write`
   - トークンをコピーして保存（後で使用）

7. **Slash Command を追加（重要！）**

   **ステップ:**

   1. Slack App 設定画面の**左サイドバー**から **"Slash Commands"** をクリック
   2. ページ中央上部の **"Create New Command"** ボタンをクリック
   3. 以下の値を入力:

      - **Command**: `/summary`

        - 必ずスラッシュ（/）を含めてください

      - **Short description**: `チャンネルの会話を要約します`

        - コマンドの説明文

      - **Request URL**: （**空欄のままにする**）
        - Socket Mode を使うため、URL は不要
        - エラーメッセージが出る場合は無視して OK

   4. **"Save"** ボタンをクリック

   5. **確認**: 画面に `/summary` コマンドが一覧に表示されていることを確認

8. **ワークスペースにインストール（必須！）**

   **ステップ:**

   1. Slack App 設定画面の**画面左上**（ブラウザのウィンドウ上部）に **"Install App to Workspace"** という緑色のボタンを探す

   2. そのボタンをクリック

   3. 承認画面が表示されたら:

      - **"許可する"** をクリック
      - 要求されている権限を確認し、承認

   4. 成功すると、トークン一覧画面にリダイレクトされます

   **重要:** この手順を実行しないと、Slack で `/summary` コマンドは認識されません。「有効なコマンドではありません」というエラーが出ます。

### 9. 環境変数の設定

```bash
cd infra
cp env.example .env
```

`.env` を編集：

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3
```

### 10. Docker Compose で起動

```bash
cd infra

# 新しいバージョンのDocker（推奨）
docker compose up -d

# または、古いバージョンのDockerの場合
docker-compose up -d
```

**注意:** Docker Desktop の新しいバージョン（v2 以上）では、コマンドが `docker-compose` から `docker compose`（ハイフンなし）に変更されました。

### 11. 動作確認

1. Slack で任意のチャンネルに移動
2. **Bot をチャンネルに招待**
   - チャンネルで `/invite @slack-summary` と入力して送信
   - または、チャンネル設定 → メンバーを追加 → `@slack-summary` を検索して追加
3. `/summary` と入力して送信
4. 要約結果が表示される

**注意:** Bot がチャンネルに参加していないと、`not_in_channel` エラーが発生します。

### 12. ログの確認

```bash
docker-compose logs -f
```

## 📁 ディレクトリ構成

```
slack-summary/
├── slack-bot/          # Slack Bot アプリケーション
│   ├── src/
│   │   └── index.js
│   ├── package.json
│   ├── Dockerfile
│   └── README.md
├── summary-api/        # 要約 API
│   ├── src/
│   │   └── index.js
│   ├── package.json
│   ├── Dockerfile
│   └── README.md
├── infra/              # インフラ設定
│   ├── docker-compose.yml
│   ├── init.sql
│   └── README.md
└── README.md
```

## 開発

### ローカル開発（Docker なし）

#### Slack Bot

```bash
cd slack-bot
npm install
cp .env.example .env  # .envを編集
npm start
```

#### Summary API

```bash
cd summary-api
npm install
npm start
```

### データベース接続

```bash
docker-compose exec postgres psql -U postgres -d slack_summary
```

## 環境変数

各ディレクトリの `.env.example` を参照してください。

## 日常的な起動手順

**初回のみ**上記の「クイックスタート」に従ってセットアップしてください。

**2 回目以降**の起動方法：

```bash
# 1. Ollamaサーバーを起動（別ターミナルで実行）
ollama serve

# 2. Dockerコンテナを起動
cd /Users/yamamotoyuuta/Desktop/latestWork/slack-summary/infra
docker compose up -d

# 3. 起動確認
docker compose ps
```

**停止方法：**

```bash
# Dockerコンテナを停止
cd /Users/yamamotoyuuta/Desktop/latestWork/slack-summary/infra
docker compose down

# Ollamaを停止（Ctrl+C を押す）
```

**注意：**

- Ollama サーバーは別のターミナルで起動し続ける必要があります
- Docker Desktop が起動している必要があります

## トラブルシューティング

### Ollama に接続できない

Mac の場合、`OLLAMA_URL` を `http://host.docker.internal:11434` に設定してください。

### Slack から応答がない

```bash
docker-compose logs slack-bot
```

### 要約が生成されない

```bash
docker-compose logs summary-api
```

### データベースエラー

```bash
docker-compose logs postgres
```

## その他のドキュメント

- [slack-bot/README.md](slack-bot/README.md) - Slack Bot の詳細
- [summary-api/README.md](summary-api/README.md) - Summary API の詳細
- [infra/README.md](infra/README.md) - インフラ構成の詳細
