const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// --- DB接続設定 ---
const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "slack_summary",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

// --- Ollama設定 ---
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS || 2000);

// ------------------------------------
// 🔹 共通ユーティリティ
// ------------------------------------
async function generateLLMSummary(text) {
  const prompt = `
以下はSlackチャンネルでの会話ログです。
以下の形式で、重要な要点・決定事項・次のアクションを簡潔にまとめてください。

# 出力形式
- 要点:
- 決定事項:
- 次のアクション:

# 会話ログ:
${text}
`;

  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    },
    { timeout: 120000 }
  );

  return response.data.response.trim();
}

function generateRuleBasedSummary(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  const mentions = text.match(/<@[A-Z0-9]+>/g) || [];
  const words = text.match(/[ぁ-んァ-ヶー一-龠]{4,}/g) || [];

  // 頻出単語集計
  const wordCount = {};
  for (const w of words) wordCount[w] = (wordCount[w] || 0) + 1;
  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  return `
📊 *ルールベース要約*
━━━━━━━━━━━━━━━
メッセージ数: ${lines.length}件
文字数: ${text.length}文字
参加者: ${[...new Set(mentions)].length}名
頻出ワード: ${topWords.join(", ") || "なし"}
━━━━━━━━━━━━━━━
最初: ${lines[0]?.slice(0, 40) || ""}
最後: ${lines[lines.length - 1]?.slice(0, 40) || ""}
`;
}

// ------------------------------------
// 🩺 ヘルスチェック
// ------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ------------------------------------
// 🧠 要約生成API
// ------------------------------------
app.post("/summary", async (req, res) => {
  try {
    const { text, channel } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const clippedText = text.slice(0, MAX_INPUT_CHARS);
    const textLength = clippedText.length;
    let summary;

    // --- 長文はチャンク分割 ---
    const chunks = clippedText.match(/.{1,800}/gs) || [clippedText];
    const partialSummaries = [];

    try {
      for (const chunk of chunks) {
        const partial = await generateLLMSummary(chunk);
        partialSummaries.push(partial);
      }

      if (partialSummaries.length > 1) {
        const finalPrompt = `
以下はSlack会話の部分ごとの要約です。
全体の要点・決定事項・アクションをまとめてください。

${partialSummaries.join("\n---\n")}
        `;
        summary = await generateLLMSummary(finalPrompt);
      } else {
        summary = partialSummaries[0];
      }
    } catch (llmErr) {
      console.warn("⚠️ LLM要約失敗:", llmErr.message);
      summary = generateRuleBasedSummary(clippedText);
    }

    // --- Markdown整形（Slack向け） ---
    const formattedSummary = `
    📢 *チャンネル要約*
━━━━━━━━━━━━━━━
${summary}
━━━━━━━━━━━━━━━
`;

    // --- DB保存 ---
    try {
      await pool.query(
        "INSERT INTO summaries (channel_id, summary, created_at) VALUES ($1, $2, NOW())",
        [channel, formattedSummary]
      );
    } catch (dbErr) {
      console.warn("⚠️ DB保存失敗:", dbErr.message);
    }

    res.json({ summary: formattedSummary });
  } catch (err) {
    console.error("❌ Summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------
// 🕓 履歴取得API
// ------------------------------------
app.get("/summaries/:channel", async (req, res) => {
  try {
    const { channel } = req.params;
    const result = await pool.query(
      "SELECT id, summary, created_at FROM summaries WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 10",
      [channel]
    );
    res.json({ summaries: result.rows });
  } catch (err) {
    console.error("DB取得失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Summary API listening on port ${port}`);
});
