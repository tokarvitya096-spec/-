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
  donated: { type: Number, default: 0 },
  started: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false }
});

const Users = mongoose.model("users", userSchema);

// ================= CONFIG =================
const DONATE_RATE = 10; // 1$ = 10 coins (приклад)

// ================= START =================
bot.start(async (ctx) => {
  const id = ctx.from.id;

  let user = await Users.findOne({ id });

  if (!user) {
    user = await Users.create({ id });

    return ctx.reply(
      "👋 Вітаю в грі!\nНатисни Start щоб почати",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "▶️ START", callback_data: "start_game" }]
          ]
        }
      }
    );
  }

  return mainMenu(ctx);
});

// ================= START BUTTON =================
bot.action("start_game", async (ctx) => {
  await Users.updateOne({ id: ctx.from.id }, { started: true });

  await ctx.answerCbQuery();
  return mainMenu(ctx);
});

// ================= MAIN MENU =================
function mainMenu(ctx) {
  return ctx.reply("🎮 MENU:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 Coins", callback_data: "coins" }],
        [{ text: "🎰 Casino", callback_data: "casino" }],
        [{ text: "💎 Donate", callback_data: "donate" }],
        [{ text: "👤 Profile", callback_data: "profile" }]
      ]
    }
  });
}

// ================= COINS =================
bot.action("coins", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });
  return ctx.reply(`💰 Coins: ${user.coins}`);
});

// ================= CASINO =================
bot.action("casino", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  const bet = 10;

  if (user.coins < bet) {
    return ctx.reply("❌ Немає достатньо coins");
  }

  const win = Math.random() < 0.45;

  if (win) {
    user.coins += bet;
    await user.save();
    return ctx.reply("🎰 WIN +10 coins");
  } else {
    user.coins -= bet;
    await user.save();
    return ctx.reply("🎰 LOSE -10 coins");
  }
});

// ================= DONATE SYSTEM =================
bot.action("donate", (ctx) => {
  return ctx.reply(
    "💎 Donate система\nНапиши: /donate 10",
  );
});

bot.command("donate", async (ctx) => {
  const id = ctx.from.id;
  const amount = Number(ctx.message.text.split(" ")[1]);

  if (!amount || amount <= 0) {
    return ctx.reply("❌ Напиши: /donate 10");
  }

  const user = await Users.findOne({ id });

  const coins = amount * DONATE_RATE;

  user.coins += coins;
  user.donated += amount;

  await user.save();

  return ctx.reply(
    `💎 Донат зараховано!\n+${coins} coins`
  );
});

// ================= PROFILE =================
bot.action("profile", async (ctx) => {
  const user = await Users.findOne({ id: ctx.from.id });

  return ctx.reply(
    `👤 PROFILE\n\n💰 Coins: ${user.coins}\n💎 Donated: $${user.donated}`
  );
});

// ================= ADMIN COMMANDS =================
bot.command("addcoins", async (ctx) => {
  const admin = await Users.findOne({ id: ctx.from.id });

  if (!admin?.isAdmin) return;

  const [_, userId, amount] = ctx.message.text.split(" ");

  const user = await Users.findOne({ id: Number(userId) });

  if (!user) return ctx.reply("User not found");

  user.coins += Number(amount);
  await user.save();

  ctx.reply("✅ Added coins");
});

// ================= BOT =================
bot.launch();
console.log("Bot started");
