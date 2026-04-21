import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

const CHANNEL = "@PVEmpire1";

// ===== USER =====
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 0,
      xp: 0,
      level: 1,
      lastFarm: 0,
      lastWork: 0,
      lastCase: 0,
      tasks: {}
    };

    await users.insertOne(u);
  }

  if (!u.tasks) {
    u.tasks = {};
    await users.updateOne({ chatId }, { $set: { tasks: u.tasks } });
  }

  return u;
}

// ===== LEVEL =====
const level = (xp) => Math.floor(xp / 100) + 1;

// ===== MENU =====
function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 HOME", callback_data: "home" }],
        [
          { text: "⛏ FARM", callback_data: "tab_farm" },
          { text: "💼 WORK", callback_data: "tab_work" }
        ],
        [
          { text: "📦 CASE", callback_data: "tab_case" },
          { text: "📜 TASKS", callback_data: "tab_tasks" }
        ],
        [
          { text: "👤 PROFILE", callback_data: "tab_profile" }
        ]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎮 GAME STARTED", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);
  const now = Date.now();

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ===== HOME
  if (q.data === "home") {
    return bot.editMessageText("🏠 MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ===== TASKS
  if (q.data === "tab_tasks") {
    return bot.editMessageText(
`📜 TASKS

1️⃣ Subscribe to channel
Reward: +20 coins`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🌐 OPEN CHANNEL", url: "https://t.me/PVEmpire1" }],
            [{ text: "✅ CHECK", callback_data: "task_check_1" }],
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }

  // ===== CHECK SUB (З DEBUG)
  if (q.data === "task_check_1") {
    try {
      const res = await bot.getChatMember(CHANNEL, chatId);

      console.log("CHAT MEMBER:", res);

      const isMember =
        res.status === "member" ||
        res.status === "administrator" ||
        res.status === "creator";

      if (!isMember) {
        return bot.answerCallbackQuery(q.id, {
          text: "❌ Not subscribed",
          show_alert: true
        });
      }

      if (u.tasks.sub === "done") {
        return bot.answerCallbackQuery(q.id, {
          text: "Already done"
        });
      }

      u.tasks.sub = "done";
      u.coins += 20;

      await users.updateOne({ chatId }, { $set: u });

      return bot.editMessageText("✅ +20 coins", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });

    } catch (e) {
      console.log("ERROR:", e);

      return bot.answerCallbackQuery(q.id, {
        text: "⚠️ ERROR: " + e.message,
        show_alert: true
      });
    }
  }

  // ===== PROFILE
  if (q.data === "tab_profile") {
    return bot.editMessageText(
`👤 PROFILE

💰 ${u.coins}
⭐ XP ${u.xp}
📊 LVL ${u.level}`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }
});

console.log("🚀 BOT RUNNING");
