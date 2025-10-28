const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "slack_summary",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

// Ollama configuration
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 180000); // 3分
const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS || 1000); // 1000文字に制限
const USE_SIMPLE_SUMMARY = process.env.USE_SIMPLE_SUMMARY === "true"; // 簡単要約を強制

// Test endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Summary endpoint
app.post("/summary", async (req, res) => {
  try {
    const { text, channel } = req.body;

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    // Clip overly long input to avoid heavy load
    const clippedText = String(text).slice(0, MAX_INPUT_CHARS);

    // 要約生成
    let summary;

    // 要約生成（LLMまたはルールベース）
    const textLength = clippedText.length;
    const lines = clippedText.split("\n").filter((line) => line.trim());
    const messageCount = lines.length;

    // ルールベース要約の準備（フォールバック用）
    const mentions = clippedText.match(/<@[A-Z0-9]+>/g) || [];
    const uniqueMentions = [...new Set(mentions)];
    const words = clippedText.match(/[ぁ-んァ-ヶー一-龠]{5,}/g) || [];
    const wordCounts = {};
    words.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    const topWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    const firstMessage = lines[0] || "";
    const lastMessage = lines[lines.length - 1] || "";

    const ruleSummary =
      `📊 チャンネル要約\n\n` +
      `メッセージ数: ${messageCount}件\n` +
      `文字数: ${textLength}文字\n` +
      `参加者: ${uniqueMentions.length}名\n\n` +
      `📝 頻出キーワード:\n${topWords.join(", ") || "なし"}\n\n` +
      `📌 最初: ${firstMessage.substring(0, 50)}${
        firstMessage.length > 50 ? "..." : ""
      }\n` +
      `📌 最後: ${lastMessage.substring(0, 50)}${
        lastMessage.length > 50 ? "..." : ""
      }\n\n` +
      `💡 ルールベース要約`;

    // LLM要約を試行（200文字以下の場合のみ）
    if (textLength <= 200) {
      try {
        console.log(`Trying LLM summary (${textLength} chars)`);
        const prompt = `要約: ${clippedText}`;

        const response = await axios.post(
          `${OLLAMA_URL}/api/generate`,
          {
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
          },
          { timeout: 90000 } // 90秒
        );

        summary = `🤖 LLM要約\n\n${response.data.response}\n\n---\n${ruleSummary}`;
        console.log(`LLM summary success`);
      } catch (ollamaError) {
        console.log(`LLM failed, using rule-based: ${ollamaError.message}`);
        summary = ruleSummary;
      }
    } else {
      console.log(
        `Text too long (${textLength} chars), using rule-based summary`
      );
      summary = ruleSummary;
    }

    // Save to database
    try {
      await pool.query(
        "INSERT INTO summaries (channel_id, summary, created_at) VALUES ($1, $2, NOW())",
        [channel, summary]
      );
    } catch (dbError) {
      console.error("Database error:", dbError);
      // Continue even if DB save fails
    }

    res.json({
      summary: summary,
      channel: channel,
    });
  } catch (error) {
    console.error("Summary error:", error);
    const isTimeout =
      error.code === "ECONNABORTED" || /timeout/i.test(error.message || "");
    res
      .status(500)
      .json({ error: isTimeout ? "summary timeout" : error.message });
  }
});

// Get summaries history
app.get("/summaries/:channel", async (req, res) => {
  try {
    const { channel } = req.params;

    const result = await pool.query(
      "SELECT id, summary, created_at FROM summaries WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 10",
      [channel]
    );

    res.json({ summaries: result.rows });
  } catch (error) {
    console.error("Get summaries error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Summary API listening on port ${port}`);
});
