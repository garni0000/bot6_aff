require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const User = require('./models/user'); // À créer dans un dossier models
const Withdrawal = require('./models/withdrawal'); // À créer dans un dossier models

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = process.env.ADMIN_ID;
const CHANNELS = [
  { id: '-1001923341484', name: 'Canal 1', url: 'https://t.me/+NS16bwRVpBs1ZGM0' },
  { id: '-1002191790432', name: 'Canal 2', url: 'https://t.me/+rSXyxHTwcN5lNWE0' }
];

// Initialisation
const bot = new Telegraf(BOT_TOKEN);
const withdrawalProcess = new Map();

// Connexion MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => {
    console.error('❌ Erreur MongoDB:', err);
    process.exit(1);
  });

// Middleware de sécurité
bot.use(async (ctx, next) => {
  try {
    // Log des activités
    console.log(`[${new Date().toISOString()}] Update reçu:`, JSON.stringify(ctx.update));
    
    // Vérification utilisateur bloqué
    if (ctx.update.my_chat_member?.new_chat_member.status === 'kicked') {
      console.log(`🚫 Utilisateur ${ctx.from.id} a bloqué le bot`);
      return;
    }
    
    await next();
  } catch (err) {
    console.error('🔥 Erreur middleware:', err);
  }
});

// Fonctions utilitaires
async function checkChannelsMembership(userId) {
  try {
    const results = await Promise.all(
      CHANNELS.map(ch => bot.telegram.getChatMember(ch.id, userId))
    );
    
    return results.every(m => ['member', 'administrator', 'creator'].includes(m.status));
  } catch (err) {
    console.error('❌ Erreur vérification canaux:', err);
    return false;
  }
}

async function handleNewUser(userId, username, referrerId) {
  try {
    const existingUser = await User.findOne({ id: userId });
    if (existingUser) return;

    const newUser = await User.create({
      id: userId,
      username,
      referrer_id: referrerId
    });

    if (referrerId) {
      await User.updateOne(
        { id: referrerId },
        { $inc: { invited_count: 1, tickets: 1 } }
      );
      await updateBalance(referrerId);
      await sendNotification(referrerId, userId);
    }

    console.log(`✅ Nouvel utilisateur: ${userId}`);
    return newUser;
  } catch (err) {
    console.error('❌ Erreur création utilisateur:', err);
  }
}

// Commandes principales
bot.start(async (ctx) => {
  try {
    const { id, username } = ctx.from;
    const referrerId = ctx.startPayload;

    await handleNewUser(id, username, referrerId);

    await ctx.reply(
      '🌟 Bienvenue sur GxGcash ! Rejoignez nos canaux :',
      Markup.inlineKeyboard([
        ...CHANNELS.map(ch => [Markup.button.url(ch.name, ch.url)]),
        [Markup.button.callback('✅ Vérifier', 'check_channels')]
      ])
    );
  } catch (err) {
    console.error('❌ Erreur commande /start:', err);
  }
});

// Gestion des actions
bot.action('check_channels', async (ctx) => {
  try {
    const userId = ctx.from.id;
    
    if (await checkChannelsMembership(userId)) {
      await User.updateOne({ id: userId }, { joined_channels: true });
      
      await ctx.editMessageText('✅ Accès autorisé !', 
        Markup.keyboard([
          ['💳 Mon compte', '📢 Inviter'],
          ['🎰 Play to win', '💸 Retrait'],
          ['📞 Support', '📚 Tutoriel']
        ]).resize()
      );
    } else {
      await ctx.answerCbQuery('❌ Veuillez rejoindre tous les canaux');
    }
  } catch (err) {
    console.error('❌ Erreur vérification canaux:', err);
  }
});

// Système de retrait
bot.hears('💸 Retrait', async (ctx) => {
  try {
    const user = await User.findOne({ id: ctx.from.id });
    
    if (!user) return ctx.reply('❌ Utilisateur non trouvé');
    if (user.balance < 30000) return ctx.reply('❌ Minimum: 30 000 Fcfa');

    withdrawalProcess.set(user.id, { step: 'method' });
    await ctx.reply('💸 Choisissez votre méthode de paiement :',
      Markup.keyboard(['Mobile Money', 'Virement Bancaire', 'PayPal'])
        .oneTime()
        .resize()
    );
  } catch (err) {
    console.error('❌ Erreur retrait:', err);
  }
});

// Gestion des messages
bot.on('message', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const state = withdrawalProcess.get(userId);
    if (!state) return;

    const steps = {
      method: { next: 'country', prompt: '🌍 Pays de résidence :' },
      country: { next: 'phone', prompt: '📞 Numéro de téléphone :' },
      phone: { next: 'email', prompt: '📧 Adresse email :' },
      email: async () => {
        const withdrawal = new Withdrawal({
          userId,
          amount: ctx.user.balance,
          ...state
        });
        await withdrawal.save();
        
        await ctx.reply('✅ Demande enregistrée !');
        await notifyAdmin(ctx, withdrawal);
        withdrawalProcess.delete(userId);
      }
    };

    if (steps[state.step]) {
      state[state.step] = ctx.message.text;
      const nextStep = steps[state.step].next;
      
      if (nextStep) {
        state.step = nextStep;
        await ctx.reply(steps[nextStep].prompt);
      } else {
        await steps[state.step].fn();
      }
    }
  } catch (err) {
    console.error('❌ Erreur processus retrait:', err);
  }
});

// Fonctions admin
bot.command('admin', async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) return;

  await ctx.reply('🔧 Panel Admin :',
    Markup.inlineKeyboard([
      [Markup.button.callback('👥 Utilisateurs', 'admin_users')],
      [Markup.button.callback('📢 Diffusion', 'admin_broadcast')]
    ])
  );
});

// Lancement du bot
bot.launch()
  .then(() => console.log('🤖 Bot démarré'))
  .catch(err => {
    console.error('💥 Erreur démarrage bot:', err);
    process.exit(1);
  });

// Gestion des arrêts
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Functions supplémentaires
async function updateBalance(userId) {
  const user = await User.findOne({ id: userId });
  if (!user) return;

  const bonus = user.invited_count >= 11 ? 3000 :
                user.invited_count >= 6 ? 2500 : 2000;
  
  user.balance = user.invited_count * bonus;
  await user.save();
}

async function notifyAdmin(ctx, withdrawal) {
  try {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💸 Nouvelle demande de retrait\n\n` +
      `👤 Utilisateur: @${ctx.from.username || 'N/A'}\n` +
      `💰 Montant: ${withdrawal.amount} Fcfa\n` +
      `📱 Méthode: ${withdrawal.paymentMethod}\n` +
      `🌍 Pays: ${withdrawal.country}\n` +
      `📞 Téléphone: ${withdrawal.phone}\n` +
      `📧 Email: ${withdrawal.email}`
    );
  } catch (err) {
    console.error('❌ Erreur notification admin:', err);
  }
}
