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

    // 簡易要約を生成（LLMを使わない）
    const textLength = clippedText.length;
    const messageCount = (clippedText.match(/\n/g) || []).length + 1;

    // メッセージの最初の3行を抽出
    const lines = clippedText.split("\n").filter((line) => line.trim());
    const preview = lines.slice(0, 3).join("\n");

    summary =
      `📊 チャンネル要約 (最新${messageCount}件)\n\n` +
      `文字数: ${textLength}文字\n\n` +
      `最初のメッセージ:\n${preview}\n\n` +
      `💡 現在は簡易要約モードです。`;

    console.log(
      `Simple summary generated (${messageCount} messages, ${textLength} chars)`
    );

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
