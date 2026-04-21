import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";
import axios from "axios";
import express from "express";

dotenv.config();

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ================= DB =================
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
      diamonds: 0
    };
    await users.insertOne(u);
  }

  return u;
}

// ================= MENU =================
function mainMenu(u) {
  return {
    text:
`🎮 GAME HUB

👤 ${u.username}
💎 Diamonds: ${u.diamonds}

Оберіть:`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 DONATE", callback_data: "donate" }],
          [{ text: "👤 PROFILE", callback_data: "profile" }]
        ]
      }
    }
  };
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);
  const ui = mainMenu(u);

  bot.sendMessage(msg.chat.id, ui.text, ui.options);
});

// ================= CREATE INVOICE =================
async function createInvoice(amount, chatId, diamonds) {
  const res = await axios.post(
    "https://pay.crypt.bot/api/createInvoice",
    {
      asset: "USDT",
      amount,
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
    const ui = mainMenu(u);

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // ================= PROFILE =================
  if (q.data === "profile") {
    return bot.editMessageText(
`👤 PROFILE

💎 Diamonds: ${u.diamonds}`,
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

  // ================= DONATE MENU =================
  if (q.data === "donate") {
    return bot.editMessageText(
`💳 DONATE

1💎 = 2₴

Оберіть пакет:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "💎 5 = 10₴", callback_data: "d10" }],
            [{ text: "💎 10 = 20₴", callback_data: "d20" }],
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }

  // ================= PACK 10₴ =================
  if (q.data === "d10") {
    const url = await createInvoice(10, chatId, 5);

    return bot.sendMessage(chatId, "💳 Pay 10₴ → 5💎", {
      reply_markup: {
        inline_keyboard: [[{ text: "PAY", url }]]
      }
    });
  }

  // ================= PACK 20₴ =================
  if (q.data === "d20") {
    const url = await createInvoice(20, chatId, 10);

    return bot.sendMessage(chatId, "💳 Pay 20₴ → 10💎", {
      reply_markup: {
        inline_keyboard: [[{ text: "PAY", url }]]
      }
    });
  }
});

// ================= WEBHOOK SERVER =================
const app = express();
app.use(express.json());

app.post("/crypto-webhook", async (req, res) => {
  const data = req.body;

  try {
    if (data.status === "paid") {
      const payload = JSON.parse(data.payload);

      await users.updateOne(
        { chatId: payload.chatId },
        { $inc: { diamonds: payload.diamonds } }
      );

      console.log("💎 Added:", payload.diamonds);
    }
  } catch (e) {
    console.log("Webhook error:", e);
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Bot + Webhook running");
});
