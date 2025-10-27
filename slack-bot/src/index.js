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
  const userId = command.user_id;

  try {
    // Get channel history
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

    // Send loading message
    await respond({
      text: "要約を生成中...",
      response_type: "in_channel",
    });

    // Call summary API
    const messages = result.messages
      .filter((msg) => msg.subtype !== "bot_message")
      .map((msg) => msg.text)
      .join("\n");

    const summary = await axios.post(
      `${SUMMARY_API_URL}/summary`,
      {
        text: messages,
        channel: channelId,
      },
      { timeout: Number(process.env.REQUEST_TIMEOUT_MS || 300000) } // 5分に延長
    );

    // Post summary as new message
    await app.client.chat.postMessage({
      channel: channelId,
      text: `📝 **要約結果**\n\n${summary.data.summary}`,
    });
  } catch (error) {
    console.error("Error:", error);

    // Handle specific errors
    if (error.data && error.data.error === "not_in_channel") {
      await respond({
        text: "❌ エラー: Botがこのチャンネルに参加していません。\n\nチャンネルにBotを招待する方法:\n1. チャンネルで `/invite @slack-summary` と入力\n2. または、チャンネル設定からメンバーを追加して Bot を招待",
        response_type: "ephemeral",
      });
      return;
    }

    const isTimeout =
      error.code === "ECONNABORTED" || /timeout/i.test(error.message || "");
    await respond({
      text: isTimeout
        ? "⏱ 要約処理がタイムアウトしました。メッセージ量を減らすか、後でもう一度お試しください。"
        : `エラーが発生しました: ${error.message}`,
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
