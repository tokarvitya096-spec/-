// Telegram Tapalka Bot (Node.js + MongoDB)
// npm i node-telegram-bot-api mongoose dotenv

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== MongoDB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

const userSchema = new mongoose.Schema({
  userId: Number,
  username: String,
  coins: { type: Number, default: 0 },
  crystals: { type: Number, default: 0 },
  first: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ===== Helpers =====
async function getUser(from) {
  let user = await User.findOne({ userId: from.id });

  if (!user) {
    user = await User.create({
      userId: from.id,
      username: from.username || 'no_username',
      first: true
    });
  }

  return user;
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const user = await getUser(msg.from);

  // first time user
  if (user.first) {
    await User.updateOne(
      { userId: msg.from.id },
      { $set: { first: false } }
    );

    return bot.sendMessage(
      msg.chat.id,
      "▶️ Натисни START щоб почати",
      {
        reply_markup: {
          keyboard: [["▶️ START"]],
          resize_keyboard: true
        }
      }
    );
  }

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 Грати', callback_data: 'play' }],
        [{ text: '💎 Донат', callback_data: 'donate' }]
      ]
    }
  };

  bot.sendMessage(
    msg.chat.id,
    `Привіт ${msg.from.first_name}!\nТвій баланс: ${user.coins} 💰 | ${user.crystals} 💎`,
    options
  );
});

// ===== START BUTTON =====
bot.on('message', async (msg) => {
  if (msg.text !== '▶️ START') return;

  const user = await getUser(msg.from);

  return bot.sendMessage(msg.chat.id, "🎮 GAME STARTED", {
    reply_markup: {
      remove_keyboard: true
    }
  });
});

// ===== Buttons =====
bot.on('callback_query', async (query) => {
  const user = await getUser(query.from);

  if (query.data === 'play') {
    user.coins += 1;
    await user.save();

    bot.answerCallbackQuery(query.id, { text: '+1 💰' });
  }

  if (query.data === 'donate') {
    bot.sendMessage(
      query.message.chat.id,
      'Введи кількість 💎 для донату (наприклад: 10)'
    );
  }
});

// ===== Donate system =====
bot.on('message', async (msg) => {
  const user = await getUser(msg.from);

  if (!msg.text) return;

  if (!isNaN(msg.text)) {
    const amount = parseInt(msg.text);

    if (amount > 0) {
      const rate = 10;
      const bonus = Math.floor(amount * rate * 0.1);

      user.crystals += amount;
      user.coins += amount * rate + bonus;
      await user.save();

      bot.sendMessage(
        msg.chat.id,
        `💎 Донат прийнято!\n+${amount} 💎\n+${amount * rate + bonus} 💰 (з бонусом)`
      );
    }
  }
});

// ===== Admin =====
const admins = (process.env.ADMINS || '').split(',');

bot.onText(/\/addcoins (.+)/, async (msg, match) => {
  if (!admins.includes(String(msg.from.id))) return;

  const [id, amount] = match[1].split(' ');
  const user = await User.findOne({ userId: id });

  if (!user) return msg.reply('User not found');

  user.coins += Number(amount);
  await user.save();

  msg.reply('Coins added');
});

bot.onText(/\/addcrystals (.+)/, async (msg, match) => {
  if (!admins.includes(String(msg.from.id))) return;

  const [id, amount] = match[1].split(' ');
  const user = await User.findOne({ userId: id });

  if (!user) return msg.reply('User not found');

  user.crystals += Number(amount);
  await user.save();

  msg.reply('Crystals added');
});

console.log('Bot started');
