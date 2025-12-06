const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 8000;

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
以下の形式で要約してください。

# 出力フォーマット
📝 要約:
- （3〜5行の要約）

✅ 決定事項:
- （あれば）

📌 TODO:
- （必要なタスク）

🔍 頻出ワード（上位5）:
- （単語リスト）

# 会話ログ:
${text}
`;

  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    { model: OLLAMA_MODEL, prompt, stream: false },
    { timeout: 120000 }
  );

  return response.data.response.trim();
}

function generateRuleBasedSummary(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  const mentions = text.match(/<@[A-Z0-9]+>/g) || [];
  const words = text.match(/[ぁ-んァ-ヶー一-龠]{4,}/g) || [];

  const wordCount = {};
  for (const w of words) wordCount[w] = (wordCount[w] || 0) + 1;
  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  const highlightKeywords = [
    "進捗",
    "対応",
    "完了",
    "問題",
    "報告",
    "確認",
    "共有",
  ];
  const decisionKeywords = ["決定", "合意", "確定", "承認", "変更", "採用"];
  const todoKeywords = [
    "TODO",
    "対応",
    "お願いします",
    "必要",
    "宿題",
    "やる",
    "実施",
  ];

  const uniqueLines = [];
  const addLine = (line) => {
    if (!line) return;
    if (uniqueLines.includes(line)) return;
    uniqueLines.push(line);
  };

  // prioritise lines with highlight keywords
  lines.forEach((line) => {
    if (highlightKeywords.some((kw) => line.includes(kw))) addLine(line);
  });

  // fallback to first/middle/last if not enough
  if (uniqueLines.length < 3 && lines.length) {
    addLine(lines[0]);
    addLine(lines[Math.floor(lines.length / 2)]);
    addLine(lines[lines.length - 1]);
  }

  const summarizeLines = uniqueLines
    .slice(0, 3)
    .map(
      (line) => `- ${line.trim().slice(0, 80)}${line.length > 80 ? "…" : ""}`
    );

  const decisions = lines
    .filter((line) => decisionKeywords.some((kw) => line.includes(kw)))
    .slice(0, 3)
    .map(
      (line) => `- ${line.trim().slice(0, 80)}${line.length > 80 ? "…" : ""}`
    );

  const todos = lines
    .filter((line) => todoKeywords.some((kw) => line.includes(kw)))
    .slice(0, 3)
    .map(
      (line) => `- ${line.trim().slice(0, 80)}${line.length > 80 ? "…" : ""}`
    );

  const formatSection = (items, fallback) =>
    items.length ? items.join("\n") : `- ${fallback}`;

  return `
📝 要約:
${formatSection(
  summarizeLines,
  "直近の会話を確認しました。特筆すべき内容は多くありません。"
)}

✅ 決定事項:
${formatSection(decisions, "特になし")}

📌 TODO:
${formatSection(todos, "特になし")}

📊 統計情報:
- メッセージ数: ${lines.length}件
- 文字数: ${text.length}文字
- 参加者: ${[...new Set(mentions)].length}名
- 頻出ワード: ${topWords.join(", ") || "なし"}
- 最初: ${lines[0]?.slice(0, 40) || ""}
- 最後: ${lines[lines.length - 1]?.slice(0, 40) || ""}
`;
}

// ------------------------------------
// 🧠 要約生成API
// ------------------------------------
app.post("/summary", async (req, res) => {
  try {
    const { text, channel } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const clippedText = text.slice(0, MAX_INPUT_CHARS);
    const now = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour12: false,
    });

    let summary;

    try {
      summary = await generateLLMSummary(clippedText);
    } catch (err) {
      console.warn("⚠️ LLM要約失敗:", err.message);
      summary = generateRuleBasedSummary(clippedText);
    }

    const formattedSummary = `
:mega: *チャンネル要約*
━━━━━━━━━━━━━━━
${summary}
━━━━━━━━━━━━━━━
`;

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
