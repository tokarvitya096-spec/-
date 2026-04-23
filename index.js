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

// PvP games
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
      lastCase: 0
    };
    await users.insertOne(u);
  }

  if (typeof u.coins !== "number") u.coins = 0;
  if (typeof u.diamonds !== "number") u.diamonds = 0;
  if (typeof u.lastWork !== "number") u.lastWork = 0;
  if (typeof u.lastCase !== "number") u.lastCase = 0;

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
  bot.sendMessage(msg.chat.id, `🎮 GAME\n💎 ${u.diamonds}`, mainMenu());
});

// JOIN via link
bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const param = match[1];

  if (param.startsWith("join_")) {
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
  }
});

// ================= MAIN =================
bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith("/")) return;

  const u = await getUser(chatId, msg.from.username);

  if (text === "⬅ BACK") return bot.sendMessage(chatId, "🔙", mainMenu());

  // COINS
  if (text === "🪙 Coins") return bot.sendMessage(chatId, "🪙 Menu", coinsMenu());

  if (text === "⛏ FARM") {
    u.coins += 10;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, "+10", coinsMenu());
  }

  if (text === "💼 WORK") {
    const now = Date.now();
    const cd = 3600000;

    if (now - u.lastWork < cd) {
      const left = Math.ceil((cd - (now - u.lastWork)) / 60000);
      return bot.sendMessage(chatId, `⏳ ${left} хв`);
    }

    u.coins += 20;
    u.lastWork = now;
    await users.updateOne({ chatId }, { $set: u });

    return bot.sendMessage(chatId, "+20", coinsMenu());
  }

  if (text === "📦 CASE") {
    const now = Date.now();
    const cd = 6 * 3600000;

    if (now - u.lastCase < cd) {
      const left = Math.ceil((cd - (now - u.lastCase)) / 60000);
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

  // CREATE GAME
  if (text === "🎲 Cubes") {
    return bot.sendMessage(chatId, "💎 Введи ставку (мін 0.10)");
  }

  const bet = parseFloat(text);

  if (!isNaN(bet) && bet >= 0.1) {
    if (u.diamonds < bet) {
      return bot.sendMessage(chatId, "❌ недостатньо 💎");
    }

    const id = Math.random().toString(36).substring(2, 8);
    const me = await bot.getMe();

    const link = `https://t.me/${me.username}?start=join_${id}`;

    games.set(id, {
      creator: chatId,
      bet,
      opponent: null,
      accepted: [],
      rolls: {}
    });

    return bot.sendMessage(chatId,
`🎲 Гра створена

💎 ${bet}

🔗 ${link}`);
  }

  // DONATE
  if (text === "💳 Donate") {
    return bot.sendMessage(chatId, "💳 Bank:", bankMenu());
  }

  if (text === "Abank" || text === "Pumb") {
    const card = text === "Abank"
      ? "4400005550111519"
      : "5355280028902177";

    await payments.insertOne({
      chatId,
      card,
      status: "amount"
    });

    return bot.sendMessage(chatId, "💎 Введи кількість 💎");
  }

  const diamonds = Number(text);

  if (!isNaN(diamonds)) {
    const pay = await payments.findOne({ chatId, status: "amount" });
    if (!pay) return;

    if (diamonds < 3) return bot.sendMessage(chatId, "❌ мін 3💎");

    const price = Math.ceil(diamonds * 44.3 * 1.05);

    await payments.updateOne(
      { _id: pay._id },
      { $set: { amount: diamonds, price, status: "photo" } }
    );

    return bot.sendMessage(chatId,
`💳 ${pay.card}
💎 ${diamonds}
💰 ${price}₴

📩 Кинь квитанцію`);
  }
});

// JOIN command
bot.onText(/\/join (.+)/, async (msg, match) => {
  const id = match[1];
  const game = games.get(id);

  if (!game) return;

  const chatId = msg.chat.id;
  const u = await getUser(chatId);

  if (u.diamonds < game.bet) return;

  game.opponent = chatId;

  bot.sendMessage(game.creator, "👤 гравець зайшов", acceptMenu(id));
  bot.sendMessage(chatId, "👤 ви зайшли", acceptMenu(id));
});

// CALLBACK
bot.on("callback_query", async (q) => {
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  if (data.startsWith("accept_") || data.startsWith("decline_")) {
    const id = data.split("_")[1];
    const game = games.get(id);
    if (!game) return;

    if (data.startsWith("decline_")) {
      games.delete(id);
      return;
    }

    const uid = q.message.chat.id;

    if (!game.accepted.includes(uid)) {
      game.accepted.push(uid);
    }

    if (game.accepted.length === 2) {
      bot.sendMessage(game.creator, "🎲 /roll");
    }
  }

  if (data.startsWith("approve_") || data.startsWith("reject_")) {
    const id = data.split("_")[1];
    const pay = await payments.findOne({ _id: new ObjectId(id) });

    if (!pay || pay.status !== "pending") return;

    if (data.startsWith("approve_")) {
      await users.updateOne(
        { chatId: pay.chatId },
        { $inc: { diamonds: pay.amount } }
      );

      await payments.updateOne(
        { _id: pay._id },
        { $set: { status: "approved" } }
      );

      bot.sendMessage(pay.chatId, `+${pay.amount}💎`);
    }

    if (data.startsWith("reject_")) {
      await payments.updateOne(
        { _id: pay._id },
        { $set: { status: "rejected" } }
      );
    }
  }
});

// ROLL
bot.onText(/\/roll/, async (msg) => {
  const chatId = msg.chat.id;

  const entry = [...games.entries()].find(([id, g]) =>
    g.creator === chatId || g.opponent === chatId
  );

  if (!entry) return;

  const [id, g] = entry;

  bot.sendDice(chatId).then(async (m) => {
    const v = m.dice.value;

    if (chatId === g.creator) {
      g.rolls.c = v;
      bot.sendMessage(g.opponent, "🎲 /roll");
    } else {
      g.rolls.o = v;

      const winner = g.rolls.c > g.rolls.o ? g.creator : g.opponent;

      await users.updateOne(
        { chatId: winner },
        { $inc: { diamonds: g.bet * 2 } }
      );

      bot.sendMessage(g.creator, `🏆 ${winner}`);
      bot.sendMessage(g.opponent, `🏆 ${winner}`);

      games.delete(id);
    }
  });
});

// RECEIPT
bot.on("photo", async (msg) => {
  const pay = await payments.findOne({ chatId: msg.chat.id, status: "photo" });
  if (!pay) return;

  await payments.updateOne(
    { _id: pay._id },
    { $set: { status: "pending" } }
  );

  bot.sendPhoto(process.env.ADMIN_ID, msg.photo.at(-1).file_id, {
    caption: `💎 ${pay.amount} | ${pay.price}₴`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅", callback_data: `approve_${pay._id}` },
          { text: "❌", callback_data: `reject_${pay._id}` }
        ]
      ]
    }
  });
});

// ADMIN
bot.onText(/\/balances/, async (msg) => {
  if (String(msg.chat.id) !== String(process.env.ADMIN_ID)) return;

  const list = await users.find({}).limit(50).toArray();

  let t = "📊\n\n";

  for (const u of list) {
    t += `${u.chatId} | 💰${u.coins} | 💎${u.diamonds}\n`;
  }

  bot.sendMessage(msg.chat.id, t);
});

console.log("🚀 FULL PvP CASINO + DONATE READY");
