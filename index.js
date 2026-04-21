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

const pendingCards = new Map();

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

Оберіть:`,
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

// ================= DONATE MENU =================
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id);

  // HOME
  if (q.data === "home") {
    const ui = menu(u);

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // FARM
  if (q.data === "farm") {
    u.coins += 10;
    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText("⛏ FARM +10", {
      chat_id: chatId,
      message_id: messageId,
      ...menu(u).options
    });
  }

  // WORK
  if (q.data === "work") {
    u.coins += 20;
    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText("💼 WORK +20", {
      chat_id: chatId,
      message_id: messageId,
      ...menu(u).options
    });
  }

  // CASE
  if (q.data === "case") {
    const r = Math.random() < 0.7 ? 15 : 40;
    u.coins += r;
    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 CASE +${r}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu(u).options
    });
  }

  // CASINO MENU
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

  // PROFILE
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

  // DONATE MENU
  if (q.data === "donate") {
    return bot.editMessageText(
`💳 DONATE

💎 Crypto (auto)
💳 Card (manual)

Вибери:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "₿ Crypto", callback_data: "crypto" }],
            [{ text: "💳 Card", callback_data: "card" }],
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }

  // ================= CARD =================
  if (q.data === "card") {
    return bot.sendMessage(chatId,
`💳 CARD PAYMENT

💰 20₴ = 20💎

📌 Карта:
4400 0055 5011 1519
5355 2800 2890 2177

📩 Надішли фото квитанції сюди`);
  }

  // ================= CARD RECEIPT =================
  if (q.message.photo) {
    const fileId = q.message.photo?.slice(-1)[0].file_id;

    pendingCards.set(chatId, fileId);

    const ADMIN_ID = process.env.ADMIN_ID;

    bot.sendMessage(ADMIN_ID,
`💳 NEW CARD PAYMENT
User: ${chatId}`,
{
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
            { text: "❌ REJECT", callback_data: `reject_${chatId}` }
          ]
        ]
      }
    });

    bot.sendPhoto(ADMIN_ID, fileId);
  }

  // ================= ADMIN =================
  if (q.data.startsWith("approve_")) {
    const id = q.data.split("_")[1];

    await users.updateOne(
      { chatId: Number(id) },
      { $inc: { diamonds: 20 } }
    );

    return bot.sendMessage(id, "✅ +20💎 added");
  }

  if (q.data.startsWith("reject_")) {
    const id = q.data.split("_")[1];
    return bot.sendMessage(id, "❌ rejected");
  }

  // ================= DICE =================
  if (q.data === "dice") {
    return bot.sendDice(chatId).then(async (msg) => {
      const v = msg.dice.value;

      let reward =
        v === 1 ? 1.1 :
        v === 2 ? 1.2 :
        v === 3 ? 1.4 :
        v === 4 ? 1.6 :
        v === 5 ? 1.8 : 2;

      u.diamonds += reward;
      await users.updateOne({ chatId }, { $set: u });

      bot.sendMessage(chatId, `🎲 ${v} → +${reward}💎`);
    });
  }

  // ================= DARTS =================
  if (q.data === "darts") {
    const hit = Math.random();

    const reward = hit > 0.9 ? 1.5 : 1.05;

    u.diamonds += reward;
    await users.updateOne({ chatId }, { $set: u });

    return bot.sendMessage(chatId, `🎯 ${hit > 0.9 ? "CENTER" : "MISS"} +${reward}💎`);
  }

  // ================= CRYPTO =================
  if (q.data === "crypto") {
    return bot.sendMessage(chatId, "₿ CryptoBot буде додано через invoice (якщо хочеш — скажеш)");
  }
});

console.log("🚀 FULL GAME RUNNING");
