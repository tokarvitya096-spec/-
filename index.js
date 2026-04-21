import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";
import axios from "axios";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ================= USER =================
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 100,
      diamonds: 0
    };
    await users.insertOne(u);
  }

  return u;
}

// ================= MENU =================
function menu(u) {
  return {
    text:
`🎮 GAME HUB

👤 ${u.username}
💰 Coins: ${u.coins}
💎 Diamonds: ${u.diamonds}

Вибери вкладку:`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⛏ FARM", callback_data: "farm" },
            { text: "💼 WORK", callback_data: "work" }
          ],
          [
            { text: "📦 CASE", callback_data: "case" },
            { text: "🎰 CASINO", callback_data: "casino" }
          ],
          [
            { text: "💳 DONATE", callback_data: "donate" },
            { text: "👤 PROFILE", callback_data: "profile" }
          ]
        ]
      }
    }
  };
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);
  const ui = menu(u);

  bot.sendMessage(msg.chat.id, ui.text, ui.options);
});

// ================= CREATE INVOICE =================
async function createInvoice(amountUSD, chatId, diamonds) {
  const res = await axios.post(
    "https://pay.crypt.bot/api/createInvoice",
    {
      asset: "USDT",
      amount: amountUSD,
      payload: JSON.stringify({ chatId, diamonds })
    },
    {
      headers: {
        "Crypto-Pay-API-Token": process.env.CRYPTOBOT_TOKEN
      }
    }
  );

  return res.data.result.pay_url;
}

// ================= CALLBACK =================
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id);

  // ================= HOME =================
  if (q.data === "home") {
    const ui = menu(u);

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // ================= FARM =================
  if (q.data === "farm") {
    u.coins += 10;
    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText("⛏ FARM +10", {
      chat_id: chatId,
      message_id: messageId,
      ...menu(u).options
    });
  }

  // ================= WORK =================
  if (q.data === "work") {
    u.coins += 20;
    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText("💼 WORK +20", {
      chat_id: chatId,
      message_id: messageId,
      ...menu(u).options
    });
  }

  // ================= CASE =================
  if (q.data === "case") {
    const reward = Math.random() < 0.7 ? 15 : 40;
    u.coins += reward;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 CASE +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu(u).options
    });
  }

  // ================= CASINO =================
  if (q.data === "casino") {
    return bot.editMessageText(
`🎰 CASINO`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎲 DICE", callback_data: "dice" }],
            [{ text: "🎯 DARTS", callback_data: "darts" }],
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }

  // ================= PROFILE =================
  if (q.data === "profile") {
    return bot.editMessageText(
`👤 PROFILE

💰 ${u.coins}
💎 ${u.diamonds}`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: "⬅ BACK", callback_data: "home" }]]
        }
      }
    );
  }

  // ================= DONATE MENU =================
  if (q.data === "donate") {
    return bot.editMessageText(
`💳 DONATE SYSTEM

💡 Мінімум: 0.5$
💡 Максимум: ∞

Введи суму (USD):`,
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  }
});

// ================= TEXT INPUT (DONATE AMOUNT) =================
bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  const u = await getUser(chatId, msg.from.username);

  const amount = parseFloat(text);

  if (isNaN(amount)) return;

  if (amount < 0.5) {
    return bot.sendMessage(chatId, "❌ Мінімум 0.5$");
  }

  const diamonds = Math.floor(amount * 2); // 1$ = 2💎

  const url = await createInvoice(amount, chatId, diamonds);

  bot.sendMessage(
    chatId,
    `💳 Pay ${amount}$ → ${diamonds}💎`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "PAY", url }]
        ]
      }
    }
  );
});

console.log("🚀 FULL GAME + DYNAMIC DONATE RUNNING");
