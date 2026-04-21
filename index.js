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
function mainMenu(u) {
  return {
    text:
`🎮 GAME HUB

👤 ${u.username}
💰 Coins: ${u.coins}
💎 Diamonds: ${u.diamonds}

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
            { text: "⚔️ PVP", callback_data: "pvp" },
            { text: "💳 DONATE", callback_data: "donate" }
          ],
          [
            { text: "👤 PROFILE", callback_data: "profile" }
          ]
        ]
      }
    }
  };
}

// ================= CASINO =================
function casinoMenu() {
  return {
    text:
`🎰 CASINO 💎

Оберіть гру:`,
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎲 DICE (сам кидаєш)", callback_data: "dice" }],
          [{ text: "🎯 DARTS (сам кидаєш)", callback_data: "darts" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
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

// ================= CALLBACK =================
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id).catch(() => {});

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

  // ================= FARM =================
  if (q.data === "farm") {
    const gain = Math.floor(Math.random() * 10) + 5;
    u.coins += gain;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`⛏ FARM +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu(u).options
    });
  }

  // ================= WORK =================
  if (q.data === "work") {
    const gain = Math.floor(Math.random() * 30) + 10;
    u.coins += gain;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`💼 WORK +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu(u).options
    });
  }

  // ================= CASE =================
  if (q.data === "case") {
    const gain = Math.random() < 0.7 ? 15 : 40;
    u.coins += gain;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 CASE +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu(u).options
    });
  }

  // ================= CASINO =================
  if (q.data === "casino") {
    const ui = casinoMenu();

    return bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: messageId,
      ...ui.options
    });
  }

  // ================= 🎲 DICE (PLAYER CLICKS) =================
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

    let multi =
      roll === 1 ? 1.1 :
      roll === 2 ? 1.2 :
      roll === 3 ? 1.4 :
      roll === 4 ? 1.6 :
      roll === 5 ? 1.8 : 2;

    const win = bet * multi;

    u.diamonds += win;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
`🎲 DICE

🎯 Roll: ${roll}
💎 Bet: 1
🏆 Win: ${win.toFixed(2)}💎`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎲 ROLL AGAIN", callback_data: "dice" }],
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

    let win = hit > 0.9 ? 1.5 : 1.05;

    const reward = bet * win;

    u.diamonds += reward;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
`🎯 DARTS

📍 Accuracy: ${(hit * 100).toFixed(0)}%
🏆 Win: ${reward.toFixed(2)}💎`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎯 THROW AGAIN", callback_data: "darts" }],
            [{ text: "⬅ BACK", callback_data: "casino" }]
          ]
        }
      }
    );
  }

  // ================= 💳 DONATE SYSTEM (CARCASS) =================
  if (q.data === "donate") {
    return bot.editMessageText(
`💳 DONATE SYSTEM

Способи:
• Telegram Stars ⭐
• CryptoBot ₿
• Карта 💳 (майбутнє)

Після оплати ти отримуєш 💎`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⭐ STARS", url: "https://t.me/your_bot" }],
            [{ text: "₿ CRYPTOBOT", url: "https://t.me/CryptoBot" }],
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }

  // ================= PVP (placeholder) =================
  if (q.data === "pvp") {
    return bot.editMessageText(
`⚔️ PVP

(буде оновлено: PvP казино на 💎)`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...mainMenu(u).options
      }
    );
  }
});

console.log("🚀 FULL GAME + 💎 CASINO + DONATE RUNNING");YSTEM RUNNING");
