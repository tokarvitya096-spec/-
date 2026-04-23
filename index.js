import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");
const payments = db.collection("payments");

const games = new Map();

// ================= USER =================
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 100,
      diamonds: 0,
      lastWork: 0,
      lastCase: 0,
      state: null,
      card: null,
      first: true
    };
    await users.insertOne(u);
  }

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

function acceptMenu(id) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅", callback_data: `accept_${id}` },
          { text: "❌", callback_data: `decline_${id}` }
        ]
      ]
    }
  };
}

// ================= START =================
bot.onText(/\/start$/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);

  if (u.first) {
    return bot.sendMessage(msg.chat.id,
      "▶️ Натисни START",
      {
        reply_markup: {
          keyboard: [["▶️ START"]],
          resize_keyboard: true
        }
      }
    );
  }

  bot.sendMessage(msg.chat.id, "🎮 GAME", mainMenu());
});

// JOIN через посилання
bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const param = match[1];

  if (!param.startsWith("join_")) return;

  const id = param.split("_")[1];
  const game = games.get(id);

  if (!game) return bot.sendMessage(chatId, "❌ гра не знайдена");
  if (game.opponent) return bot.sendMessage(chatId, "❌ вже зайнято");
  if (chatId === game.creator) return;

  const u = await getUser(chatId);

  if (u.diamonds < game.bet) {
    return bot.sendMessage(chatId, "❌ недостатньо 💎");
  }

  game.opponent = chatId;

  bot.sendMessage(game.creator, "👤 гравець зайшов", acceptMenu(id));
  bot.sendMessage(chatId, "👤 ви зайшли", acceptMenu(id));
});

// ================= MAIN =================
bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith("/")) return;

  const u = await getUser(chatId, msg.from.username);

  // START SCREEN
  if (text === "▶️ START") {
    await users.updateOne({ chatId }, { $set: { first: false } });

    return bot.sendPhoto(chatId,
      "file_0000000045e871fd8c54554c27771884",
      {
        caption: "👋 Вітаю вас у PV Empire",
        ...mainMenu()
      }
    );
  }

  if (text === "⬅ BACK") {
    await users.updateOne({ chatId }, { $set: { state: null } });
    return bot.sendMessage(chatId, "🔙", mainMenu());
  }

  // COINS
  if (text === "🪙 Coins") return bot.sendMessage(chatId, "🪙 Menu", coinsMenu());

  if (text === "⛏ FARM") {
    u.coins += 10;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, "+10", coinsMenu());
  }

  if (text === "💼 WORK") {
    const now = Date.now();
    if (now - u.lastWork < 3600000) {
      const left = Math.ceil((3600000 - (now - u.lastWork)) / 60000);
      return bot.sendMessage(chatId, `⏳ ${left} хв`);
    }

    u.coins += 20;
    u.lastWork = now;
    await users.updateOne({ chatId }, { $set: u });

    return bot.sendMessage(chatId, "+20", coinsMenu());
  }

  if (text === "📦 CASE") {
    const now = Date.now();
    if (now - u.lastCase < 21600000) {
      const left = Math.ceil((21600000 - (now - u.lastCase)) / 60000);
      return bot.sendMessage(chatId, `⏳ ${left} хв`);
    }

    const r = Math.random() < 0.7 ? 15 : 40;
    u.coins += r;
    u.lastCase = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.sendMessage(chatId, `+${r}`, coinsMenu());
  }

  // PROFILE
  if (text === "👤 Profile") {
    return bot.sendMessage(chatId,
`👤 PROFILE

💰 ${u.coins}
💎 ${u.diamonds}`, mainMenu());
  }

  // CASINO
  if (text === "🎰 Casino") {
    return bot.sendMessage(chatId,
`🎰 CASINO

🎲 Cubes`, {
      reply_markup: {
        keyboard: [["🎲 Cubes"], ["⬅ BACK"]],
        resize_keyboard: true
      }
    });
  }

  if (text === "🎲 Cubes") {
    await users.updateOne({ chatId }, { $set: { state: "casino_bet" } });
    return bot.sendMessage(chatId, "💎 Введи ставку");
  }

  // DONATE
  if (text === "💳 Donate") {
    return bot.sendMessage(chatId, "💳 Bank:", bankMenu());
  }

  if (text === "Abank" || text === "Pumb") {
    const card = text === "Abank"
      ? "4400005550111519"
      : "5355280028902177";

    await users.updateOne({ chatId }, { $set: { state: "donate_amount", card } });

    return bot.sendMessage(chatId, "💎 Введи кількість 💎");
  }

  // NUMBER HANDLER
  const num = parseFloat(text);

  if (!isNaN(num)) {

    // DONATE
    if (u.state === "donate_amount") {
      if (num < 3) return bot.sendMessage(chatId, "❌ мін 3💎");

      const price = Math.ceil(num * 44.3 * 1.05);

      await payments.insertOne({
        chatId,
        amount: num,
        price,
        card: u.card,
        status: "photo"
      });

      await users.updateOne({ chatId }, { $set: { state: null } });

      return bot.sendMessage(chatId,
`💳 ${u.card}

💎 ${num}
📊 Курс: 1💎 = 1$ = 44.3₴
➕ Комісія: +5%

💰 До оплати: ${price}₴

📩 Кинь квитанцію`);
    }

    // CASINO
    if (u.state === "casino_bet") {
      if (u.diamonds < num) {
        return bot.sendMessage(chatId, "❌ недостатньо 💎");
      }

      const id = Math.random().toString(36).substring(2, 8);
      const me = await bot.getMe();

      const link = `https://t.me/${me.username}?start=join_${id}`;

      games.set(id, {
        creator: chatId,
        bet: num,
        opponent: null,
        accepted: [],
        rolls: {}
      });

      await users.updateOne({ chatId }, { $set: { state: null } });

      return bot.sendMessage(chatId,
`🎲 Гра створена

💎 ${num}

🔗 ${link}`);
    }
  }
});

// ================= OTHER =================
// (callback, roll, receipt, admin — залиш як було у тебе, вони вже ок)

console.log("🚀 PV EMPIRE READY");
