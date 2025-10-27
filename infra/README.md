# Infrastructure

Docker Compose を使用したインフラ構成。

## 構成

- **postgres**: PostgreSQL データベース
- **summary-api**: 要約 API サービス
- **slack-bot**: Slack Bot サービス

## セットアップ

1. 環境変数の設定

```bash
cp .env.example .env
# .env を編集してSlack Appの認証情報を設定
```

2. データベースの初期化

```bash
docker-compose up -d postgres
# しばらく待ってから
docker-compose exec postgres psql -U postgres -d slack_summary -f /docker-entrypoint-initdb.d/init.sql
```

3. 全サービスの起動

```bash
docker-compose up -d
```

4. ログの確認

```bash
# 全てのログ
docker-compose logs -f

# 特定のサービスのログ
docker-compose logs -f slack-bot
docker-compose logs -f summary-api
```

## コマンド

### サービスの起動

```bash
docker-compose up -d
```

### サービスの停止

```bash
docker-compose down
```

### サービスの再起動

```bash
docker-compose restart
```

### データベースの初期化（注意：データが削除されます）

```bash
docker-compose down -v
docker-compose up -d
```

### ビルドの更新

```bash
docker-compose build
docker-compose up -d
```

## トラブルシューティング

### Ollama に接続できない場合

`OLLAMA_URL` を確認してください。Mac の場合、`http://host.docker.internal:11434` を使用します。

### データベースに接続できない場合

```bash
docker-compose logs postgres
```

### サービスの健康状態を確認

```bash
docker-compose ps
```

