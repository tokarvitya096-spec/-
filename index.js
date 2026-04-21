import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

const pendingDonates = new Map(); // chatId -> amount
const approvedOnce = new Set();    // щоб 1 раз підтвердити

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
function menu(u) {
  return {
    text:
`🎮 GAME

💎 Баланс: ${u.diamonds}

Оберіть:`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎰 CASINO", callback_data: "casino" }],
          [{ text: "💳 DONATE", callback_data: "donate" }]
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

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id);

  // HOME
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

  // BANK
  if (q.data === "abank" || q.data === "pumb") {
    const card =
      q.data === "abank"
        ? "4400005550111519"
        : "5355280028902177";

    pendingDonates.set(chatId, { card });

    return bot.sendMessage(chatId,
`💳 КАРТА:
${card}

💎 Введи скільки хочеш донат валюти
(мінімум 3💎)`);
  }

  // CASINO BLOCK IF 0
  if (q.data === "casino") {
    if (u.diamonds <= 0) {
      return bot.sendMessage(chatId, "❌ 0💎 — гра заборонена");
    }

    return bot.sendMessage(chatId, "🎰 CASINO ACTIVE");
  }

  // APPROVE ONCE ONLY
  if (q.data.startsWith("approve_")) {
    const id = Number(q.data.split("_")[1]);

    if (approvedOnce.has(id)) {
      return bot.sendMessage(chatId, "❌ вже підтверджено");
    }

    approvedOnce.add(id);

    const amount = pendingDonates.get(id)?.amount || 0;

    await users.updateOne(
      { chatId: id },
      { $inc: { diamonds: amount } }
    );

    return bot.sendMessage(id, `✅ +${amount}💎 зараховано`);
  }
});

// ================= TEXT (AMOUNT INPUT) =================
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const amount = parseInt(msg.text);

  if (isNaN(amount)) return;

  if (amount < 3) {
    return bot.sendMessage(chatId, "❌ мінімум 3💎");
  }

  const data = pendingDonates.get(chatId);

  if (!data) {
    return bot.sendMessage(chatId, "❌ спочатку вибери банк");
  }

  data.amount = amount;
  pendingDonates.set(chatId, data);

  const ADMIN_ID = process.env.ADMIN_ID;

  bot.sendMessage(chatId,
`📩 Надішли квитанцію на перевірку`);

  bot.sendMessage(ADMIN_ID,
`💳 NEW DONATE

User: ${chatId}
💎: ${amount}
Card: ${data.card}

Потрібна перевірка`);
});

// ================= RECEIPT =================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = process.env.ADMIN_ID;

  bot.sendMessage(ADMIN_ID, `📩 PAYMENT RECEIPT from ${chatId}`);

  bot.sendPhoto(ADMIN_ID, msg.photo.at(-1).file_id, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ APPROVE", callback_data: `approve_${chatId}` }]
      ]
    }
  });

  bot.sendMessage(chatId, "📩 відправлено адміну");
});

console.log("🚀 SYSTEM READY");
