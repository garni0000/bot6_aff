require('dotenv').config();
const { Telegraf } = require('telegraf');
const http = require('http');
const mongoose = require('mongoose');

// Chargement des variables d'environnement
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = process.env.ADMIN_ID;
const CHANNELS = ['-1001923341484', '-1002191790432'];

if (!BOT_TOKEN || !MONGO_URI || !ADMIN_ID) {
  console.error('❌ Erreur: Vérifiez les variables d\'environnement');
  process.exit(1);
}

// Connexion à MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => {
    console.error('❌ Erreur MongoDB:', err);
    process.exit(1);
  });

// Modèles MongoDB
const userSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  username: String,
  referrer_id: Number,
  invited_count: { type: Number, default: 0 },
  tickets: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  joined_channels: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

// Initialisation du bot
const bot = new Telegraf(BOT_TOKEN);

// Vérification d'abonnement aux canaux
async function isUserInChannels(userId) {
  try {
    const results = await Promise.all(CHANNELS.map(channel => bot.telegram.getChatMember(channel, userId)));
    return results.every(res => ['member', 'administrator', 'creator'].includes(res.status));
  } catch (err) {
    console.error('❌ Erreur vérification canaux:', err);
    return false;
  }
}

// Commande /start
bot.start(async (ctx) => {
  const userId = ctx.message.from.id;
  const username = ctx.message.from.username || 'Utilisateur';
  const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;

  let user = await User.findOne({ id: userId });
  if (!user) {
    user = new User({ id: userId, username, referrer_id: referrerId });
    await user.save();
    if (referrerId) {
      await User.updateOne({ id: referrerId }, { $inc: { invited_count: 1, tickets: 1 } });
    }
  }

  ctx.reply(`Bienvenue sur GxGcash ! Rejoignez nos canaux :`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Canal 1', url: 'https://t.me/+NS16bwRVpBs1ZGM0' }],
        [{ text: 'Canal 2', url: 'https://t.me/+rSXyxHTwcN5lNWE0' }],
        [{ text: '✅ Vérifier', callback_data: 'check' }]
      ]
    }
  });
});

bot.action('check', async (ctx) => {
  const userId = ctx.from.id;
  if (await isUserInChannels(userId)) {
    await User.updateOne({ id: userId }, { joined_channels: true });
    ctx.reply('✅ Accès autorisé !');
  } else {
    ctx.reply('❌ Rejoignez les canaux d\'abord !');
  }
});

// Commande /admin
bot.command('admin', async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply('❌ Accès refusé.');
  }
  await ctx.replyWithMarkdown('🔧 *Menu Admin*', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👥 Total Utilisateurs', callback_data: 'admin_users' }],
        [{ text: '📅 Utilisateurs/mois', callback_data: 'admin_month' }],
      ]
    }
  });
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (String(ctx.from.id) !== ADMIN_ID) return;

  try {
    if (data === 'admin_users') {
      const count = await User.countDocuments();
      await ctx.replyWithMarkdown(`👥 *Total utilisateurs:* ${count}`);
    } else if (data === 'admin_month') {
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const count = await User.countDocuments({ createdAt: { $gte: start } });
      await ctx.replyWithMarkdown(`📅 *Ce mois-ci:* ${count}`);
    }
  } catch (error) {
    console.error('Erreur admin:', error);
    await ctx.reply('❌ Erreur de traitement');
  }
  await ctx.answerCbQuery();
});

// Lancement du bot
bot.launch()
  .then(() => console.log('🚀 Bot démarré !'))
  .catch(err => {
    console.error('❌ Erreur de démarrage:', err);
    process.exit(1);
  });

// Serveur pour garder le bot en ligne
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot en ligne');
}).listen(8080);
