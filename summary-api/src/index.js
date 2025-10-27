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
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000); // 2分に延長
const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS || 4000); // 4000文字に制限

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

    // Generate summary using Ollama (簡潔なプロンプトで高速化)
    const prompt = `要約: ${clippedText}`;

    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const summary = response.data.response;

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
