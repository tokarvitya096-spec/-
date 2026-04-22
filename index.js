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

  if (text === "⬅ BACK") return bot.sendMessage(chatId, "🔙", mainMenu());

  // ================= COINS =================
  if (text === "🪙 Coins") return bot.sendMessage(chatId, "🪙 Menu", coinsMenu());

  if (text === "⛏ FARM") {
    u.coins += 10;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, "+10", coinsMenu());
  }

  if (text === "💼 WORK") {
    u.coins += 20;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, "+20", coinsMenu());
  }

  if (text === "📦 CASE") {
    const r = Math.random() < 0.7 ? 15 : 40;
    u.coins += r;
    await users.updateOne({ chatId }, { $set: u });
    return bot.sendMessage(chatId, `+${r}`, coinsMenu());
  }

  // ================= PROFILE =================
  if (text === "👤 Profile") {
    return bot.sendMessage(chatId,
`👤 PROFILE

💰 Coins: ${u.coins}
💎 Diamonds: ${u.diamonds}`,
      mainMenu()
    );
  }

  // ================= CASINO =================
  if (text === "🎰 Casino") {
    if (u.diamonds <= 0) {
      return bot.sendMessage(chatId, "❌ 0💎", mainMenu());
    }

    return bot.sendMessage(chatId,
`🎰 CASINO

🎲 /dice
🎯 /dart`,
      mainMenu()
    );
  }

  // ================= DONATE =================
  if (text === "💳 Donate") {
    return bot.sendMessage(chatId, "💳 Bank:", bankMenu());
  }

  if (text === "Abank" || text === "Pumb") {
    const card =
      text === "Abank"
        ? "4400005550111519"
        : "5355280028902177";

    await payments.insertOne({
      chatId,
      card,
      amount: 0,
      status: "amount"
    });

    return bot.sendMessage(chatId, "💎 Enter amount", bankMenu());
  }

  const amount = Number(text);

  if (!isNaN(amount)) {
    const pay = await payments.findOne({ chatId, status: "amount" });
    if (!pay) return;

    if (amount < 3) return bot.sendMessage(chatId, "❌ min 3💎");

    await payments.updateOne(
      { _id: pay._id },
      { $set: { amount, status: "photo" } }
    );

    return bot.sendMessage(chatId,
`💳 Card:
${pay.card}

💰 Pay: ${amount}₴

📩 Send receipt`,
      mainMenu()
    );
  }
});

// ================= DICE =================
bot.onText(/\/dice/, async (msg) => {
  const u = await getUser(msg.chat.id);

  if (u.diamonds <= 0) return;

  bot.sendDice(msg.chat.id).then(async (m) => {
    const v = m.dice.value;

    const reward = [1.1,1.2,1.4,1.6,1.8,2][v-1];

    await users.updateOne(
      { chatId: msg.chat.id },
      { $inc: { diamonds: reward } }
    );

    bot.sendMessage(msg.chat.id, `🎲 ${v} → +${reward}💎`);
  });
});

// ================= DART =================
bot.onText(/\/dart/, async (msg) => {
  const u = await getUser(msg.chat.id);

  if (u.diamonds <= 0) return;

  bot.sendDice(msg.chat.id, { emoji: "🎯" }).then(async (m) => {
    const v = m.dice.value;

    const reward = v === 6 ? 1.5 : 1.05;

    await users.updateOne(
      { chatId: msg.chat.id },
      { $inc: { diamonds: reward } }
    );

    bot.sendMessage(msg.chat.id,
`🎯 ${v === 6 ? "CENTER" : "MISS"}
+${reward}💎`);
  });
});

// ================= RECEIPT =================
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = process.env.ADMIN_ID;

  const pay = await payments.findOne({ chatId, status: "photo" });
  if (!pay) return;

  await payments.updateOne(
    { _id: pay._id },
    { $set: { status: "pending" } }
  );

  bot.sendPhoto(ADMIN_ID, msg.photo.at(-1).file_id, {
    caption: `💳 ${pay.amount}💎`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅", callback_data: `approve_${pay._id}` },
          { text: "❌", callback_data: `reject_${pay._id}` }
        ]
      ]
    }
  });

  bot.sendMessage(chatId, "📩 sent");
});

// ================= ADMIN CALLBACK =================
bot.on("callback_query", async (q) => {
  const data = q.data;

  if (!data.startsWith("approve_") && !data.startsWith("reject_")) return;

  const id = data.split("_")[1];

  bot.answerCallbackQuery(q.id, { text: "OK" });

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

    bot.sendMessage(pay.chatId, `✅ +${pay.amount}💎`);
  }

  if (data.startsWith("reject_")) {
    await payments.updateOne(
      { _id: pay._id },
      { $set: { status: "rejected" } }
    );

    bot.sendMessage(pay.chatId, "❌ rejected");
  }
});

// ================= ADMIN BALANCES =================
bot.onText(/\/balances/, async (msg) => {
  const chatId = msg.chat.id;

  if (String(chatId) !== String(process.env.ADMIN_ID)) {
    return bot.sendMessage(chatId, "❌ no access");
  }

  const list = await users.find({}).limit(50).toArray();

  if (!list.length) {
    return bot.sendMessage(chatId, "Empty DB");
  }

  let text = "📊 ALL BALANCES\n\n";

  for (const u of list) {
    text += `👤 ${u.username || u.chatId}\n💰 ${u.coins || 0} | 💎 ${u.diamonds || 0}\n\n`;
  }

  bot.sendMessage(chatId, text);
});

console.log("🚀 FULL GAME + ADMIN READY");
