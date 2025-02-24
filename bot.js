const { Telegraf } = require('telegraf');
const http = require('http');
const { User, Withdrawal } = require('./database');

const bot = new Telegraf('7693938099:AAHdfvjtHj0HGukmfVfF5jNv-WWceB3Ka9c'); // Remplacez par votre token
const withdrawalProcess = new Map();
const ADMIN_ID = '1613186921'; // Remplacez par votre ID Telegram admin (en string)

// Middleware de débogage et gestion d'erreurs
bot.use(async (ctx, next) => {
  try {
    console.log(`Update reçu: ${JSON.stringify(ctx.update)}`);
    await next();
  } catch (error) {
    if (error.response?.error_code === 403 && error.response?.description.includes('blocked by the user')) {
      console.log(`⚠️ Utilisateur ${ctx.from?.id} a bloqué le bot. Suppression de l'utilisateur.`);
      await User.deleteOne({ id: ctx.from?.id });
    } else {
      console.error('❌ Erreur middleware:', error);
    }
  }
});

// Fonction utilitaire pour envoyer un message avec gestion d'erreur
async function sendMessage(chatId, text, options = {}) {
  try {
    await bot.telegram.sendMessage(chatId, text, options);
  } catch (err) {
    if (err.response && err.response.error_code === 403) {
      console.log(`⚠️ Utilisateur ${chatId} a bloqué le bot. Suppression de l'utilisateur de la base de données.`);
      await User.deleteOne({ id: chatId });
    } else {
      console.error(`❌ Erreur lors de l'envoi d'un message à ${chatId} :`, err);
    }
  }
}

// Vérifie si l'utilisateur est abonné aux deux canaux
async function isUserInChannels(userId) {
  try {
    const member1 = await bot.telegram.getChatMember('-1001923341484', userId);
    const member2 = await bot.telegram.getChatMember('-1002191790432', userId);
    return ['member', 'administrator', 'creator'].includes(member1.status) &&
           ['member', 'administrator', 'creator'].includes(member2.status);
  } catch (err) {
    console.error('❌ Erreur vérification canaux:', err);
    return false;
  }
}

// Enregistre l'utilisateur et gère le parrainage
async function registerUser(userId, username, referrerId) {
  try {
    let user = await User.findOne({ id: userId });
    if (!user) {
      user = await User.create({ id: userId, username, referrer_id: referrerId });
      console.log(`✅ Utilisateur ${userId} enregistré`);
      if (referrerId) {
        await User.updateOne({ id: referrerId }, { $inc: { invited_count: 1, tickets: 1 } });
        await updateUserBalance(referrerId);
        await notifyReferrer(referrerId, userId);
      }
    }
  } catch (err) {
    console.error('❌ Erreur enregistrement utilisateur:', err);
  }
}

// Met à jour le solde de l'utilisateur selon le nombre d'invitations
async function updateUserBalance(userId) {
  const user = await User.findOne({ id: userId });
  if (user) {
    let bonus = 2000;
    if (user.invited_count >= 11) {
      bonus = 3000;
    } else if (user.invited_count >= 6) {
      bonus = 2500;
    }
    await User.updateOne({ id: userId }, { balance: user.invited_count * bonus });
  }
}

// Notifie le parrain lors d'une inscription via son lien
async function notifyReferrer(referrerId, newUserId) {
  try {
    await sendMessage(referrerId, `🎉 Un nouvel utilisateur (${newUserId}) s'est inscrit via votre lien de parrainage !`);
  } catch (err) {
    console.error('❌ Erreur notification parrain:', err);
  }
}

// Commande /start
bot.start(async (ctx) => {
  const userId = ctx.message.from.id;
  const username = ctx.message.from.username || 'Utilisateur';
  const referrerId = ctx.startPayload ? parseInt(ctx.startPayload) : null;

  await registerUser(userId, username, referrerId);

  await sendMessage(userId, `Bienvenue sur GxGcash ! Rejoignez nos canaux :`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Canal 1', url: 'https://t.me/+NS16bwRVpBs1ZGM0' }],
        [{ text: 'Canal 2', url: 'https://t.me/+rSXyxHTwcN5lNWE0' }],
        [{ text: '✅ Vérifier', callback_data: 'check' }]
      ]
    }
  });
});

// Vérification de l'abonnement aux canaux
bot.action('check', async (ctx) => {
  const userId = ctx.from.id;
  if (await isUserInChannels(userId)) {
    await User.updateOne({ id: userId }, { joined_channels: true });
    // Construction du clavier principal
    let keyboard = [
      [{ text: 'Mon compte 💳' }, { text: 'Inviter📢' }],
      [{ text: 'Play to win 🎰' }, { text: 'Withdrawal💸' }],
      [{ text: 'Support📩' }, { text: 'Tuto 📖' }],
      [{ text: 'Tombola 🎟️' }]
    ];
    // Bouton Admin visible uniquement pour l'admin
    if (String(userId) === ADMIN_ID) {
      keyboard.push([{ text: 'Admin' }]);
    }
    ctx.reply('✅ Accès autorisé !', {
      reply_markup: {
        keyboard: keyboard,
        resize_keyboard: true
      }
    });
  } else {
    ctx.reply('❌ Rejoignez les canaux d\'abord !');
  }
});

// Gestion des commandes textuelles de base
bot.hears(
  ['Mon compte 💳', 'Inviter📢', 'Play to win 🎰', 'Withdrawal💸', 'Support📩', 'Tuto 📖', 'Tombola 🎟️', 'Admin'],
  async (ctx) => {
    const userId = ctx.message.from.id;
    const user = await User.findOne({ id: userId });
    if (!user) return ctx.reply('❌ Utilisateur non trouvé.');

    switch (ctx.message.text) {
      case 'Mon compte 💳':
        return ctx.reply(`💰 Solde: ${user.balance} Fcfa\n📈 Invités: ${user.invited_count}\n🎟️ Tickets: ${user.tickets}`);
      case 'Inviter📢':
        return ctx.reply(`🔗 Lien de parrainage : https://t.me/cashXelitebot?start=${userId}`);
      case 'Play to win 🎰':
        return ctx.reply(`🎮 Jouer ici : https://t.me/cashXelitebot/cash?ref=${userId}`);
      case 'Withdrawal💸':
        if (user.balance >= 30000) {
          withdrawalProcess.set(userId, { step: 'awaiting_payment_method' });
          return ctx.reply('💸 Méthode de paiement :');
        } else {
          return ctx.reply('❌ Minimum 30 000 Fcfa');
        }
      case 'Support📩':
        return ctx.reply('📩 Contact : @Medatt00');
      case 'Tuto 📖':
        return ctx.reply('📖 Guide : https://t.me/gxgcaca');
      case 'Tombola 🎟️':
        return ctx.reply('🎟️ 1 invitation = 1 ticket');
      case 'Admin':
        if (String(ctx.message.from.id) === ADMIN_ID) {
          await ctx.replyWithMarkdown('🔧 *Menu Admin*', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '👥 Total Utilisateurs', callback_data: 'admin_users' }],
                [{ text: '📅 Utilisateurs/mois', callback_data: 'admin_month' }],
                [{ text: '📢 Diffuser message', callback_data: 'admin_broadcast' }]
              ]
            }
          });
        } else {
          return ctx.reply('❌ Accès refusé. Vous n\'êtes pas administrateur.');
        }
        break;
    }
  }
);

// Commande /admin (alternative via commande)
bot.command('admin', async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply('❌ Accès refusé. Vous n\'êtes pas administrateur.');
  }
  await ctx.replyWithMarkdown('🔧 *Menu Admin*', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👥 Total Utilisateurs', callback_data: 'admin_users' }],
        [{ text: '📅 Utilisateurs/mois', callback_data: 'admin_month' }],
        [{ text: '📢 Diffuser message', callback_data: 'admin_broadcast' }]
      ]
    }
  });
});

// Commande /send pour diffuser un message à tous les utilisateurs
bot.command('send', async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_ID) {
    return ctx.reply('❌ Accès refusé. Vous n\'êtes pas administrateur.');
  }
  // Récupération du message (texte après /send)
  const messageToSend = ctx.message.text.split(' ').slice(1).join(' ');
  if (!messageToSend) {
    return ctx.reply('Veuillez fournir le message à envoyer. Exemple: /send Votre message ici');
  }
  const users = await User.find().select('id');
  let successCount = 0;
  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.id, messageToSend);
      successCount++;
    } catch (error) {
      console.error(`Erreur envoi message à ${user.id}:`, error.message);
    }
  }
  ctx.reply(`✅ Message envoyé à ${successCount}/${users.length} utilisateurs.`);
});

// Processus de retrait via messages texte
bot.on('text', async (ctx) => {
  const userId = ctx.message.from.id;
  const userState = withdrawalProcess.get(userId);
  if (!userState) return;

  const user = await User.findOne({ id: userId });
  if (!user) {
    withdrawalProcess.delete(userId);
    return ctx.reply('❌ Utilisateur non trouvé');
  }

  switch (userState.step) {
    case 'awaiting_payment_method':
      userState.paymentMethod = ctx.message.text;
      userState.step = 'awaiting_country';
      await ctx.reply('🌍 Pays de résidence :');
      break;
    case 'awaiting_country':
      userState.country = ctx.message.text;
      userState.step = 'awaiting_phone';
      await ctx.reply('📞 Téléphone (avec indicatif) :');
      break;
    case 'awaiting_phone':
      userState.phone = ctx.message.text;
      userState.step = 'awaiting_email';
      await ctx.reply('📧 Email :');
      break;
    case 'awaiting_email':
      userState.email = ctx.message.text;
      const withdrawal = new Withdrawal({
        userId,
        amount: user.balance,
        ...userState
      });
      await withdrawal.save();

      await ctx.reply('✅ Demande enregistrée !');
      await sendMessage(
        ADMIN_ID,
        `💸 Nouveau retrait\n\n` +
        `👤 Utilisateur: @${ctx.from.username || 'N/A'}\n` +
        `💰 Montant: ${user.balance} Fcfa\n` +
        `📱 Méthode: ${userState.paymentMethod}\n` +
        `🌍 Pays: ${userState.country}\n` +
        `📞 Tél: ${userState.phone}\n` +
        `📧 Email: ${userState.email}`
      );
      withdrawalProcess.delete(userId);
      break;
  }
});

// Gestion des callbacks admin pour statistiques et diffusion
const broadcastState = new Map();
bot.on('callback_query', async (ctx) => {
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;

  if (userId === ADMIN_ID) {
    try {
      if (data === 'admin_users') {
        const count = await User.countDocuments();
        await ctx.replyWithMarkdown(`👥 *Total utilisateurs:* ${count}`);
      } else if (data === 'admin_month') {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const count = await User.countDocuments({ createdAt: { $gte: start } });
        await ctx.replyWithMarkdown(`📅 *Ce mois-ci:* ${count}`);
      } else if (data === 'admin_broadcast') {
        broadcastState.set(userId, { step: 'awaiting_message' });
        await ctx.reply('📤 Envoyez le message à diffuser :');
      } else if (data === 'broadcast_cancel') {
        broadcastState.delete(userId);
        await ctx.reply('Diffusion annulée.');
      } else if (data.startsWith('broadcast_')) {
        const [_, chatId, messageId] = data.split('_');
        const users = await User.find().select('id');
        let success = 0;
        await ctx.reply(`Début diffusion à ${users.length} utilisateurs...`);
        for (const user of users) {
          try {
            await bot.telegram.copyMessage(user.id, chatId, messageId);
            success++;
          } catch (error) {
            console.error(`Échec à ${user.id}:`, error.message);
          }
        }
        await ctx.reply(`✅ Diffusion terminée : ${success}/${users.length} réussis`);
      }
    } catch (error) {
      console.error('Erreur admin:', error);
      await ctx.reply('❌ Erreur de traitement');
    }
  }
  await ctx.answerCbQuery();
});

// Gestion globale des erreurs
bot.catch((err, ctx) => {
  console.error(`❌ Erreur pour ${ctx.updateType}:`, err);
});

// Démarrage du bot et création du serveur HTTP
bot.launch()
  .then(() => console.log('🚀 Bot démarré !'))
  .catch(err => {
    console.error('❌ Erreur de démarrage:', err);
    process.exit(1);
  });

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot en ligne');
}).listen(8080);
