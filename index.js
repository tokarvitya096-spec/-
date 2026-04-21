import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

const pending = new Map(); // chatId -> {card, amount}
const approved = new Set();

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

💎 ${u.diamonds}

Оберіть вкладку:`,
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

// ================= CALLBACK =================
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

  // ================= CASINO =================
  if (q.data === "casino") {
    if (u.diamonds <= 0) {
      return bot.sendMessage(chatId, "❌ 0💎 — казино недоступне");
    }

    return bot.sendMessage(chatId,
`🎰 CASINO`,
{
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎲 DICE", callback_data: "dice" }],
          [{ text: "🎯 DARTS", callback_data: "darts" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= DICE =================
  if (q.data === "dice") {
    if (u.diamonds <= 0) return;

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
    if (u.diamonds <= 0) return;

    const hit = Math.random();
    const reward = hit > 0.9 ? 1.5 : 1.05;

    u.diamonds += reward;
    await users.updateOne({ chatId }, { $set: u });

    return bot.sendMessage(chatId, `🎯 ${hit > 0.9 ? "CENTER" : "MISS"} +${reward}💎`);
  }

  // ================= PROFILE =================
  if (q.data === "profile") {
    return bot.sendMessage(chatId, `💎 ${u.diamonds}`);
  }

  // ================= DONATE =================
  if (q.data === "donate") {
    return bot.sendMessage(chatId,
`💳 DONATE

Оберіть банк:`,
{
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏦 Abank", callback_data: "abank" }],
          [{ text: "🏦 Pumb", callback_data: "pumb" }]
        ]
      }
    });
  }

  // ================= BANK =================
  if (q.data === "abank" || q.data === "pumb") {
    const card =
      q.data === "abank"
        ? "4400005550111519"
        : "5355280028902177";

    pending.set(chatId, { card });

    return bot.sendMessage(chatId,
`💳 Карта:
${card}

💎 Введи кількість (мін 3💎)`);
  }

  // ================= ADMIN APPROVE =================
  if (q.data.startsWith("approve_") || q.data.startsWith("reject_")) {
    const id = Number(q.data.split("_")[1]);

    if (approved.has(id)) {
      return bot.sendMessage(chatId, "❌ вже оброблено");
    }

    approved.add(id);

    if (q.data.startsWith("approve_")) {
      const amount = pending.get(id)?.amount || 0;

      await users.updateOne(
        { chatId: id },
        { $inc: { diamonds: amount } }
      );

      bot.sendMessage(id, `✅ +${amount}💎`);
    }

    if (q.data.startsWith("reject_")) {
      bot.sendMessage(id, "❌ платіж відхилено");
    }
  }
});

// ================= TEXT INPUT =================
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const amount = parseInt(msg.text);

  if (isNaN(amount)) return;

  if (amount < 3) {
    return bot.sendMessage(chatId, "❌ мін 3💎");
  }

  const data = pending.get(chatId);
  if (!data) return;

  data.amount = amount;
  pending.set(chatId, data);

  const ADMIN_ID = process.env.ADMIN_ID;

  bot.sendMessage(chatId, "📩 відправ квитанцію");

  bot.sendMessage(
    ADMIN_ID,
`💳 NEW DONATE
User: ${chatId}
💎: ${amount}
Card: ${data.card}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
            { text: "❌ REJECT", callback_data: `reject_${chatId}` }
          ]
        ]
      }
    }
  );
});

// ================= RECEIPT =================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = process.env.ADMIN_ID;

  bot.sendMessage(chatId, "📩 надіслано адміну");

  bot.sendPhoto(ADMIN_ID, msg.photo.at(-1).file_id, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
          { text: "❌ REJECT", callback_data: `reject_${chatId}` }
        ]
      ]
    }
  });
});

console.log("🚀 FULL GAME READY");
