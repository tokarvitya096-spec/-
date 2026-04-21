import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

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

Вибери:`,
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

💰 Coins: ${u.coins}
💎 Diamonds: ${u.diamonds}`,
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

💳 Card = manual
₿ Crypto = later

📌 20₴ = 20💎

Надішли квитанцію після оплати`,
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

  // ================= DICE (player controlled) =================
  if (q.data === "dice") {
    return bot.sendMessage(chatId, "🎲 Натисни щоб кинути куб", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎲 ROLL", callback_data: "roll_dice" }]
        ]
      }
    });
  }

  if (q.data === "roll_dice") {
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
});

// ================= CARD RECEIPT HANDLER =================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  const ADMIN_ID = process.env.ADMIN_ID;

  await bot.sendMessage(
    ADMIN_ID,
`💳 NEW PAYMENT

User: ${chatId}
@${msg.from.username || "no_username"}`
  );

  await bot.sendPhoto(ADMIN_ID, fileId, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
          { text: "❌ REJECT", callback_data: `reject_${chatId}` }
        ]
      ]
    }
  });

  bot.sendMessage(chatId, "📩 Квитанцію відправлено на перевірку");
});

// ================= ADMIN ACTIONS =================
bot.on("callback_query", async (q) => {
  if (!q.data.startsWith("approve_") && !q.data.startsWith("reject_")) return;

  const chatId = Number(q.data.split("_")[1]);

  if (q.data.startsWith("approve_")) {
    await users.updateOne(
      { chatId },
      { $inc: { diamonds: 20 } }
    );

    bot.sendMessage(chatId, "✅ +20💎 зараховано");
  }

  if (q.data.startsWith("reject_")) {
    bot.sendMessage(chatId, "❌ платіж відхилено");
  }
});

console.log("🚀 FULL GAME RUNNING FIXED");
