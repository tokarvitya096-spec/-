import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");
const battles = db.collection("battles");

// ===== USER =====
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 100,
      xp: 0
    };
    await users.insertOne(u);
  }

  return u;
}

// ===== LEVEL =====
const level = (xp) => Math.floor(xp / 100) + 1;

// ===== MENU =====
function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎲 CREATE BATTLE", callback_data: "create_battle" }],
        [{ text: "⚔️ BATTLES", callback_data: "battles_list" }],
        [{ text: "👤 PROFILE", callback_data: "profile" }]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "⚔️ PvP CASINO READY", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ================= PROFILE
  if (q.data === "profile") {
    return bot.editMessageText(
`👤 PROFILE

💰 ${u.coins}
⭐ XP ${u.xp}
📊 LVL ${level(u.xp)}`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= CREATE BATTLE
  if (q.data === "create_battle") {
    const battle = {
      creator: chatId,
      opponent: null,
      bet: 10,
      status: "waiting",
      createdAt: Date.now()
    };

    const res = await battles.insertOne(battle);

    return bot.editMessageText(
`⚔️ BATTLE CREATED

Bet: 10 coins
ID: ${res.insertedId}

Waiting opponent...`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 JOIN", callback_data: `join_${res.insertedId}` }],
            [{ text: "⬅ BACK", callback_data: "back" }]
          ]
        }
      }
    );
  }

  // ================= LIST
  if (q.data === "battles_list") {
    const list = await battles.find({ status: "waiting" }).toArray();

    if (!list.length) {
      return bot.editMessageText("No battles", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    return bot.editMessageText(
`⚔️ BATTLES:

${list.map(b => `ID: ${b._id}`).join("\n")}`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= JOIN
  if (q.data.startsWith("join_")) {
    const id = q.data.split("_")[1];

    let battle;
    try {
      battle = await battles.findOne({ _id: new ObjectId(id) });
    } catch {
      return bot.answerCallbackQuery(q.id, {
        text: "Invalid battle",
        show_alert: true
      });
    }

    if (!battle) {
      return bot.answerCallbackQuery(q.id, {
        text: "Not found",
        show_alert: true
      });
    }

    if (battle.creator === chatId) {
      return bot.answerCallbackQuery(q.id, {
        text: "You can't join yourself",
        show_alert: true
      });
    }

    if (battle.status !== "waiting") {
      return bot.answerCallbackQuery(q.id, {
        text: "Already started",
        show_alert: true
      });
    }

    await battles.updateOne(
      { _id: battle._id },
      { $set: { opponent: chatId, status: "playing" } }
    );

    const roll1 = Math.floor(Math.random() * 6) + 1;
    const roll2 = Math.floor(Math.random() * 6) + 1;

    let text = `🎲 DICE BATTLE\n\n`;
    text += `Player 1: ${roll1}\nPlayer 2: ${roll2}\n\n`;

    let winner = null;

    if (roll1 > roll2) winner = battle.creator;
    else if (roll2 > roll1) winner = chatId;

    if (winner) {
      await users.updateOne(
        { chatId: winner },
        { $inc: { coins: battle.bet * 2 } }
      );

      text += `🏆 Winner: ${winner}`;
    } else {
      text += "🤝 Draw";
    }

    await battles.updateOne(
      { _id: battle._id },
      { $set: { status: "finished" } }
    );

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= BACK
  if (q.data === "back") {
    return bot.editMessageText("🎮 MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }
});

console.log("⚔️ PvP CASINO RUNNING (STABLE)");
