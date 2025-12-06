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
    // bot自身のuser IDを取得
    const authResult = await app.client.auth.test();
    const botUserId = authResult.user_id;

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

    // 最新の要約メッセージを探す（リスト内の最初の要約メッセージ）
    let latestSummaryMessage = null;
    let latestSummaryIndex = -1;

    for (let i = 0; i < result.messages.length; i++) {
      const msg = result.messages[i];
      if (
        msg.user === botUserId &&
        msg.text &&
        msg.ts &&
        (msg.text.includes(":mega: *チャンネル要約*") ||
          msg.text.includes("チャンネル要約"))
      ) {
        latestSummaryMessage = msg;
        latestSummaryIndex = i;
        break;
      }
    }

    // 最新の要約メッセージが見つかった場合、その後に新しいユーザーメッセージがあるかチェック
    if (latestSummaryMessage && latestSummaryIndex >= 0 && latestSummaryMessage.ts) {
      const summaryTimestamp = parseFloat(latestSummaryMessage.ts);
      
      // summaryTimestampがNaNでないことを確認
      if (isNaN(summaryTimestamp)) {
        console.warn("⚠️ 要約メッセージのタイムスタンプが無効です:", latestSummaryMessage.ts);
      } else {
        // 要約メッセージが最新（index 0）の場合は、新しいメッセージはない
        if (latestSummaryIndex === 0) {
          await respond({
            text: "ℹ️ 前回の要約以降、新しいメッセージが追加されていないため、要約をスキップします。",
            response_type: "ephemeral",
          });
          return;
        }

        // 要約メッセージより前に（新しい）ユーザーメッセージがあるかチェック
        // Slack APIは降順（新しい順）で返すため、index 0～latestSummaryIndex-1 が要約より新しいメッセージ
        const hasNewMessages = result.messages
          .slice(0, latestSummaryIndex) // 要約メッセージより前の（新しい）メッセージをチェック
          .some((msg) => {
            // bot自身のメッセージ、bot_message、処理中メッセージを除外
            if (msg.user === botUserId) return false;
            if (msg.subtype === "bot_message") return false;
            if (msg.bot_id) return false;
            if (
              msg.text &&
              (msg.text.includes(":mega: *チャンネル要約*") ||
                msg.text.includes("🧠 要約を生成中です"))
            ) {
              return false;
            }
            // 要約メッセージより新しいメッセージかどうか（tsの存在もチェック）
            if (!msg.ts) return false;
            const msgTimestamp = parseFloat(msg.ts);
            return !isNaN(msgTimestamp) && msgTimestamp > summaryTimestamp;
          });

        // 新しいメッセージがない場合はスキップ
        if (!hasNewMessages) {
          await respond({
            text: "ℹ️ 前回の要約以降、新しいメッセージが追加されていないため、要約をスキップします。",
            response_type: "ephemeral",
          });
          return;
        }
      }
    }

    // botメッセージとslack-summaryのbot自身のメッセージを除外し、古い順に整列
    const userMessages = result.messages
      .filter((msg) => {
        // bot_messageサブタイプを除外
        if (msg.subtype === "bot_message") return false;
        // bot自身のuser IDと一致するメッセージを除外
        if (msg.user === botUserId) return false;
        // bot_idが存在するメッセージを除外（他のbotも）
        if (msg.bot_id) return false;
        // 要約メッセージのパターンを含むメッセージを除外（念のため）
        if (
          msg.text &&
          (msg.text.includes(":mega: *チャンネル要約*") ||
            msg.text.includes("🧠 要約を生成中です"))
        ) {
          return false;
        }
        return true;
      })
      .map((msg) => msg.text)
      .filter((text) => text) // 空のテキストを除外
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
