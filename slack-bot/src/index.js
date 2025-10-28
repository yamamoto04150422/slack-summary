require("dotenv").config();
const { App } = require("@slack/bolt");
const axios = require("axios");

// Initialize Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

const SUMMARY_API_URL = process.env.SUMMARY_API_URL || "http://localhost:8000";

// Handle /summary slash command
app.command("/summary", async ({ command, ack, respond }) => {
  await ack();

  const channelId = command.channel_id;

  try {
    // チャンネル履歴を取得（最新100件）
    const result = await app.client.conversations.history({
      channel: channelId,
      limit: 100,
    });

    if (!result.messages || result.messages.length === 0) {
      await respond({
        text: "このチャンネルにはメッセージがありません。",
        response_type: "ephemeral",
      });
      return;
    }

    // botメッセージを除外し、古い順に整列
    const userMessages = result.messages
      .filter((msg) => msg.subtype !== "bot_message")
      .map((msg) => msg.text)
      .reverse();

    if (userMessages.length === 0) {
      await respond({
        text: "ユーザーからのメッセージが見つかりませんでした（bot投稿を除外済み）。",
        response_type: "ephemeral",
      });
      return;
    }

    // 処理中メッセージ
    await respond({
      text: "🧠 要約を生成中です。少々お待ちください…",
      response_type: "in_channel",
    });

    // summary-api へ要約リクエスト
    const messages = userMessages.join("\n");

    const summaryResponse = await axios.post(
      `${SUMMARY_API_URL}/summary`,
      {
        text: messages,
        channel: channelId,
      },
      { timeout: Number(process.env.REQUEST_TIMEOUT_MS || 180000) } // 3分
    );

    const summary = summaryResponse.data.summary || "(要約結果なし)";

    // 現在時刻（日本時間）
    const now = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour12: false,
    });

    // Slack出力用に整形（summary-apiの結果を活かしてシンプルに）
    const message = `
${summary}
━━━━━━━━━━━━━━━
🕒 ${now} に生成
`;

    // 結果をSlackへ投稿
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    });
  } catch (error) {
    console.error("❌ Error:", error);

    if (error.data && error.data.error === "not_in_channel") {
      await respond({
        text: "❌ エラー: Botがこのチャンネルに参加していません。\n\nチャンネルで `/invite @slack-summary` と入力して招待してください。",
        response_type: "ephemeral",
      });
      return;
    }

    const isTimeout =
      error.code === "ECONNABORTED" || /timeout/i.test(error.message || "");
    await respond({
      text: isTimeout
        ? "⏱ 要約処理がタイムアウトしました。メッセージ量を減らすか、後でもう一度お試しください。"
        : `⚠️ エラーが発生しました: ${error.message}`,
      response_type: "ephemeral",
    });
  }
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log("⚡️ Bolt app is running!");
  } catch (error) {
    console.error("Failed to start app:", error);
    process.exit(1);
  }
})();
