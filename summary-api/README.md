# Summary API

Slack メッセージを要約するための API。Ollama を使用して LLM で要約を生成します。

## セットアップ

1. Ollama のインストール

```bash
# Mac
brew install ollama

# または公式サイトからダウンロード
# https://ollama.ai
```

2. Llama 3 モデルのダウンロード

```bash
ollama pull llama3
```

3. 環境変数の設定

```bash
cp .env.example .env
# .env を編集
```

4. 依存関係のインストール

```bash
npm install
```

5. アプリの起動

```bash
npm start
# または開発モード
npm run dev
```

## API エンドポイント

### POST /summary

メッセージを要約します。

**Request Body:**

```json
{
  "text": "要約するテキスト",
  "channel": "C1234567890"
}
```

**Response:**

```json
{
  "summary": "要約されたテキスト",
  "channel": "C1234567890"
}
```

### GET /summaries/:channel

チャンネルの要約履歴を取得します。

**Response:**

```json
{
  "summaries": [
    {
      "id": 1,
      "summary": "要約テキスト",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## 環境変数

- `PORT` - API のポート番号（デフォルト: 8000）
- `OLLAMA_URL` - Ollama の URL（デフォルト: http://localhost:11434）
- `OLLAMA_MODEL` - 使用するモデル名（デフォルト: llama3）
- `DB_HOST` - PostgreSQL のホスト
- `DB_PORT` - PostgreSQL のポート
- `DB_NAME` - データベース名
- `DB_USER` - ユーザー名
- `DB_PASSWORD` - パスワード

