import { Telegraf } from "telegraf";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

mongoose.connect(process.env.MONGO_URL);

// ================= DB =================
const userSchema = new mongoose.Schema({
  id: Number,
  coins: { type: Number, default: 0 },
  donated: { type: Number, default: 0 }
});

const Users = mongoose.model("users", userSchema);

// ================= DONATE SESSION =================
const sessions = {};

// ================= START =================
bot.start(async (ctx) => {
  let user = await Users.findOne({ id: ctx.from.id });

  if (!user) {
    user = await Users.create({ id: ctx.from.id });
  }

  return mainMenu(ctx);
});

// ================= MENU =================
function mainMenu(ctx) {
  return ctx.reply("🎮 MENU", {
    reply_markup: {
      keyboard: [
        ["💰 Coins", "🎰 Casino"],
        ["💎 Donate", "👤 Profile"]
      ],
      resize_keyboard: true
    }
  });
}

// ================= BACK BUTTON =================
bot.hears("⬅️ Menu", (ctx) => mainMenu(ctx));

// ================= COINS MENU =================
bot.hears("💰 Coins", (ctx) => {
  ctx.reply("💰 Coins:", {
    reply_markup: {
      keyboard: [
        ["🛠 Work", "🌾 Farm"],
        ["📦 Case"],
        ["⬅️ Menu"]
      ],
      resize_keyboard: true
    }
  });
});

// ================= WORK =================
bot.hears("🛠 Work", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  const earn = Math.floor(Math.random() * 10) + 5;

  user.coins += earn;
  await user.save();

  ctx.reply(`🛠 +${earn} 💰`);
});

// ================= FARM =================
bot.hears("🌾 Farm", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  const earn = 3;

  user.coins += earn;
  await user.save();

  ctx.reply("🌾 +3 💰");
});

// ================= CASE =================
bot.hears("📦 Case", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  const rewards = [1, 5, 10, 20, -5, 0];
  const reward = rewards[Math.floor(Math.random() * rewards.length)];

  user.coins += reward;
  await user.save();

  ctx.reply(`📦 ${reward >= 0 ? "+" : ""}${reward} 💰`);
});

// ================= CASINO =================
bot.hears("🎰 Casino", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  const bet = 10;

  if (user.coins < bet) {
    return ctx.reply("❌ Not enough coins");
  }

  const win = Math.random() < 0.45;

  if (win) {
    user.coins += bet;
    await user.save();
    ctx.reply("🎰 WIN +10 💰");
  } else {
    user.coins -= bet;
    await user.save();
    ctx.reply("🎰 LOSE -10 💰");
  }
});

// ================= DONATE MENU =================
bot.hears("💎 Donate", (ctx) => {
  ctx.reply("💎 Choose bank:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏦 PrivatBank", callback_data: "bank_privat" }],
        [{ text: "🏦 A-Bank", callback_data: "bank_abank" }]
      ]
    }
  });
});

// ================= BANK CHOICE =================
bot.action(["bank_privat", "bank_abank"], (ctx) => {
  sessions[ctx.from.id] = {
    bank: ctx.callbackQuery.data,
    step: "amount"
  };

  ctx.reply("💎 Enter amount (min 3)");
  ctx.answerCbQuery();
});

// ================= AMOUNT INPUT =================
bot.on("text", async (ctx) => {
  const s = sessions[ctx.from.id];

  if (!s || s.step !== "amount") return;

  const amount = Number(ctx.message.text);

  if (!amount || amount < 3) {
    return ctx.reply("❌ Min 3");
  }

  s.amount = amount;
  s.step = "receipt";

  ctx.reply("📸 Send receipt photo");
});

// ================= RECEIPT =================
bot.on("photo", async (ctx) => {
  const s = sessions[ctx.from.id];
  if (!s || s.step !== "receipt") return;

  const adminId = process.env.ADMIN_ID;

  bot.telegram.sendPhoto(adminId, ctx.message.photo[0].file_id, {
    caption: `
💎 DONATE REQUEST
👤 ID: ${ctx.from.id}
🏦 Bank: ${s.bank}
💎 Amount: ${s.amount}
    `
  });

  ctx.reply("✅ Sent for verification");

  delete sessions[ctx.from.id];
});

// ================= PROFILE =================
bot.hears("👤 Profile", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  ctx.reply(
    `👤 PROFILE\n💰 Coins: ${user.coins}\n💎 Donated: ${user.donated}`
  );
});

// ================= ADMIN ADD COINS =================
bot.command("addcoins", async (ctx) => {
  if (ctx.from.id != process.env.ADMIN_ID) return;

  const [_, userId, amount] = ctx.message.text.split(" ");

  const user = await Users.findOne({ id: Number(userId) });

  if (!user) return ctx.reply("Not found");

  user.coins += Number(amount);
  await user.save();

  ctx.reply("✅ Added");
});

// ================= BOT START =================
bot.launch();
console.log("Bot started");
