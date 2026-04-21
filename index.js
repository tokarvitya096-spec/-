import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("casino");
const users = db.collection("users");

// ================= USER =================
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 100,
      diamonds: 1 // стартова 💎 (для тесту)
    };

    await users.insertOne(u);
  }

  return u;
}

// ================= MENU (HOME) =================
function homeUI(u) {
  return {
    text:
`🎮 CASINO HUB

👤 ${u.username}
💰 Coins: ${u.coins}
💎 Diamonds: ${u.diamonds}

Оберіть режим:`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎰 CASINO", callback_data: "casino" }],
          [{ text: "👤 PROFILE", callback_data: "profile" }]
        ]
      }
    }
  };
}

// ================= CASINO MENU =================
function casinoUI() {
  return {
    text:
`🎰 CASINO MODE

Вибери гру:`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎲 DICE", callback_data: "dice" }],
          [{ text: "🎯 DARTS", callback_data: "darts" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    }
  };
}

// ================= PROFILE =================
function profileUI(u) {
  return {
    text:
`👤 PROFILE

💰 Coins: ${u.coins}
💎 Diamonds: ${u.diamonds}`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    }
  };
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);
  const ui = homeUI(u);

  bot.sendMessage(msg.chat.id, ui.text, ui.options);
});

// ================= CALLBACK =================
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ===== HOME
  if (q.data === "home") {
    const ui = homeUI(u);

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // ===== PROFILE
  if (q.data === "profile") {
    const ui = profileUI(u);

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // ===== CASINO
  if (q.data === "casino") {
    const ui = casinoUI();

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // ================= 🎲 DICE =================
  if (q.data === "dice") {
    const bet = 1;

    if (u.diamonds < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Нема 💎",
        show_alert: true
      });
    }

    u.diamonds -= bet;

    const roll = Math.floor(Math.random() * 6) + 1;

    let multiplier = 1;

    if (roll === 1) multiplier = 1.1;
    if (roll === 2) multiplier = 1.2;
    if (roll === 3) multiplier = 1.4;
    if (roll === 4) multiplier = 1.6;
    if (roll === 5) multiplier = 1.8;
    if (roll === 6) multiplier = 2;

    const win = bet * multiplier;

    u.diamonds += win;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
`🎲 DICE RESULT

Roll: ${roll}
💎 Bet: 1
🏆 Win: ${win.toFixed(2)}💎`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔁 PLAY AGAIN", callback_data: "dice" }],
            [{ text: "⬅ BACK", callback_data: "casino" }]
          ]
        }
      }
    );
  }

  // ================= 🎯 DARTS =================
  if (q.data === "darts") {
    const bet = 1;

    if (u.diamonds < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Нема 💎",
        show_alert: true
      });
    }

    u.diamonds -= bet;

    const hit = Math.random(); 
    let win = 0;

    if (hit > 0.9) {
      win = 1.5; // центр
    } else {
      win = 1.05; // мимо
    }

    const reward = bet * win;

    u.diamonds += reward;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
`🎯 DARTS RESULT

Hit chance: ${(hit * 100).toFixed(0)}%
🏆 Win: ${reward.toFixed(2)}💎`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔁 PLAY AGAIN", callback_data: "darts" }],
            [{ text: "⬅ BACK", callback_data: "casino" }]
          ]
        }
      }
    );
  }
});

console.log("💎 CASINO SYSTEM RUNNING");
