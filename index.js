import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== USER =====
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 100,
      xp: 0,
      level: 1,
      lastFarm: 0,
      lastCase: 0
    };

    await users.insertOne(u);
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
          { text: "🎰 CASINO", callback_data: "tab_casino" }
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

  // ================= HOME
  if (q.data === "home") {
    return bot.editMessageText("🏠 MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= FARM
  if (q.data === "tab_farm") {
    return bot.editMessageText("⛏ FARM", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⛏ FARM", callback_data: "farm" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  if (q.data === "farm") {
    const gain = Math.floor(Math.random() * 10) + 5;

    u.coins += gain;
    u.xp += 5;
    u.level = level(u.xp);
    u.lastFarm = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`⛏ +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= WORK
  if (q.data === "tab_work") {
    return bot.editMessageText("💼 WORK", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "💼 WORK", callback_data: "work" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  if (q.data === "work") {
    const reward =
      Math.random() < 0.7 ? 10 :
      Math.random() < 0.95 ? 25 : 50;

    u.coins += reward;
    u.xp += 8;
    u.level = level(u.xp);

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`💼 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= CASE
  if (q.data === "tab_case") {
    return bot.editMessageText("📦 CASE", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📦 OPEN", callback_data: "case" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  if (q.data === "case") {
    const reward = Math.random() < 0.7 ? 15 : 40;

    u.coins += reward;
    u.lastCase = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= CASINO TAB
  if (q.data === "tab_casino") {
    return bot.editMessageText("🎰 CASINO", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎲 COINFLIP", callback_data: "coinflip" }],
          [{ text: "🎰 SLOTS", callback_data: "slots" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= COINFLIP
  if (q.data === "coinflip") {
    const bet = 10;

    if (u.coins < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Not enough coins",
        show_alert: true
      });
    }

    const win = Math.random() < 0.5;

    if (win) {
      u.coins += bet;
    } else {
      u.coins -= bet;
    }

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
win ? "🎉 WIN +10" : "💀 LOSE -10",
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= SLOTS
  if (q.data === "slots") {
    const bet = 20;

    if (u.coins < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Not enough coins",
        show_alert: true
      });
    }

    const symbols = ["🍒", "🍋", "💎", "7️⃣"];
    const r1 = symbols[Math.floor(Math.random() * symbols.length)];
    const r2 = symbols[Math.floor(Math.random() * symbols.length)];
    const r3 = symbols[Math.floor(Math.random() * symbols.length)];

    let text = `🎰 ${r1} | ${r2} | ${r3}\n\n`;

    if (r1 === r2 && r2 === r3) {
      u.coins += bet * 5;
      text += "💎 JACKPOT x5";
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      u.coins += bet * 2;
      text += "🎉 WIN x2";
    } else {
      u.coins -= bet;
      text += "💀 LOSE";
    }

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= PROFILE
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

console.log("🚀 GAME WITH CASINO TAB RUNNING");
