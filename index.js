import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

const pending = new Map();
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

  // FIX NaN
  if (typeof u.coins !== "number") u.coins = 0;
  if (typeof u.diamonds !== "number") u.diamonds = 0;

  return u;
}

// ================= MENUS =================
function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["🪙 Coins", "🎰 Casino"],
        ["💳 Donate", "👤 Profile"]
      ],
      resize_keyboard: true
    }
  };
}

function coinsMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["⛏ FARM", "💼 WORK"],
        ["📦 CASE"],
        ["⬅ BACK"]
      ],
      resize_keyboard: true
    }
  };
}

function bankMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["Abank", "Pumb"],
        ["⬅ BACK"]
      ],
      resize_keyboard: true
    }
  };
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, `🎮 GAME\n💎 ${u.diamonds}`, mainMenu());
});

// ================= MAIN =================
bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith("/")) return;

  const u = await getUser(chatId, msg.from.username);

  // BACK
  if (text === "⬅ BACK") {
    return bot.sendMessage(chatId, "🔙 Назад", mainMenu());
  }

  // ================= COINS =================
  if (text === "🪙 Coins") {
    return bot.sendMessage(chatId, "🪙 Coins Menu", coinsMenu());
  }

  if (text === "⛏ FARM") {
    u.coins = Number(u.coins) + 10;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, "+10 coins", coinsMenu());
  }

  if (text === "💼 WORK") {
    u.coins = Number(u.coins) + 20;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, "+20 coins", coinsMenu());
  }

  if (text === "📦 CASE") {
    const r = Math.random() < 0.7 ? 15 : 40;
    u.coins = Number(u.coins) + r;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, `+${r} coins`, coinsMenu());
  }

  // ================= PROFILE =================
  if (text === "👤 Profile") {
    const coins = Number(u.coins) || 0;
    const diamonds = Number(u.diamonds) || 0;

    return bot.sendMessage(
      chatId,
`👤 PROFILE

🆔 ${chatId}
👤 @${msg.from.username || "none"}

💰 Coins: ${coins}
💎 Diamonds: ${diamonds}`,
      mainMenu()
    );
  }

  // ================= CASINO =================
  if (text === "🎰 Casino") {
    if ((Number(u.diamonds) || 0) <= 0) {
      return bot.sendMessage(chatId, "❌ 0💎", mainMenu());
    }

    return bot.sendMessage(
      chatId,
`🎰 CASINO

🎲 /dice
🎯 /dart`,
      mainMenu()
    );
  }

  // ================= DONATE =================
  if (text === "💳 Donate") {
    return bot.sendMessage(chatId, "💳 Вибери банк:", bankMenu());
  }

  if (text === "Abank" || text === "Pumb") {
    const card =
      text === "Abank"
        ? "4400005550111519"
        : "5355280028902177";

    pending.set(chatId, { card, step: "amount" });

    return bot.sendMessage(chatId, "💎 Напиши скільки хочеш", bankMenu());
  }

  const amount = Number(text);

  if (!isNaN(amount)) {
    const data = pending.get(chatId);
    if (!data || data.step !== "amount") return;

    if (amount < 3) {
      return bot.sendMessage(chatId, "❌ мін 3💎", bankMenu());
    }

    const price = amount;

    data.amount = amount;
    data.step = "pay";
    pending.set(chatId, data);

    return bot.sendMessage(
      chatId,
`💳 Карта:
${data.card}

💰 До оплати: ${price}₴

📩 Надішли квитанцію`,
      mainMenu()
    );
  }
});

// ================= 🎲 DICE =================
bot.onText(/\/dice/, async (msg) => {
  const chatId = msg.chat.id;
  const u = await getUser(chatId, msg.from.username);

  if ((Number(u.diamonds) || 0) <= 0) {
    return bot.sendMessage(chatId, "❌ 0💎", mainMenu());
  }

  bot.sendDice(chatId).then(async (m) => {
    const v = m.dice.value;

    let reward =
      v === 1 ? 1.1 :
      v === 2 ? 1.2 :
      v === 3 ? 1.4 :
      v === 4 ? 1.6 :
      v === 5 ? 1.8 : 2;

    u.diamonds = Number(u.diamonds) + Number(reward);

    await users.updateOne({ chatId }, { $set: u });

    bot.sendMessage(chatId, `🎲 ${v} → +${reward}💎`, mainMenu());
  });
});

// ================= 🎯 DART =================
bot.onText(/\/dart/, async (msg) => {
  const chatId = msg.chat.id;
  const u = await getUser(chatId, msg.from.username);

  if ((Number(u.diamonds) || 0) <= 0) {
    return bot.sendMessage(chatId, "❌ 0💎", mainMenu());
  }

  bot.sendDice(chatId, { emoji: "🎯" }).then(async (m) => {
    const v = m.dice.value;

    const reward = v === 6 ? 1.5 : 1.05;

    u.diamonds = Number(u.diamonds) + Number(reward);

    await users.updateOne({ chatId }, { $set: u });

    bot.sendMessage(
      chatId,
`🎯 ${v === 6 ? "CENTER" : "MISS"}
+${reward}💎`,
      mainMenu()
    );
  });
});

// ================= RECEIPT =================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = process.env.ADMIN_ID;

  const data = pending.get(chatId);

  bot.sendPhoto(ADMIN_ID, msg.photo.at(-1).file_id, {
    caption:
`💳 DONATE

User: ${chatId}
💎: ${data?.amount || 0}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅", callback_data: `approve_${chatId}` },
          { text: "❌", callback_data: `reject_${chatId}` }
        ]
      ]
    }
  });

  bot.sendMessage(chatId, "📩 на перевірці");
});

// ================= ADMIN =================
bot.on("callback_query", async (q) => {
  if (!q.data.startsWith("approve_") && !q.data.startsWith("reject_")) return;

  const id = Number(q.data.split("_")[1]);

  if (approved.has(id)) {
    return bot.answerCallbackQuery(q.id, { text: "Вже було" });
  }

  approved.add(id);

  if (q.data.startsWith("approve_")) {
    const amount = Number(pending.get(id)?.amount || 0);

    await users.updateOne(
      { chatId: id },
      { $inc: { diamonds: amount } }
    );

    bot.sendMessage(id, `✅ +${amount}💎`);
  }

  if (q.data.startsWith("reject_")) {
    bot.sendMessage(id, "❌ відхилено");
  }

  bot.answerCallbackQuery(q.id);
});

console.log("🚀 GAME FIXED (NO NaN)");
