const { Telegraf } = require('telegraf');
const http = require('http');
const mongoose = require('mongoose');

// Connexion à MongoDB
mongoose.connect('mongodb+srv://josh:JcipLjQSbhxbruLU@cluster0.hn4lm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ Connecté à MongoDB'))
  .catch(err => {
    console.error('❌ Erreur de connexion MongoDB:', err);
    process.exit(1);
  });

// Définition des modèles MongoDB
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

const withdrawalSchema = new mongoose.Schema({
  userId: Number,
  amount: Number,
  paymentMethod: String,
  country: String,
  phone: String,
  email: String,
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

// Initialisation du bot
const bot = new Telegraf('7693938099:AAHdfvjtHj0HGukmfVfF5jNv-WWceB3Ka9c'); // Remplacez par votre token
const withdrawalProcess = new Map();
const ADMIN_ID = '1613186921'; // Remplacez par votre ID Telegram (en string)

// Middleware de débogage
bot.use(async (ctx, next) => {
  console.log(`Update reçu: ${JSON.stringify(ctx.update)}`);
  await next();
});

// Fonction utilitaire : Vérifie si l'utilisateur est abonné aux deux canaux
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

// Fonction utilitaire : Enregistre l'utilisateur et gère le parrainage
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

// Fonction utilitaire : Met à jour le solde de l'utilisateur selon le nombre d'invitations
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

// Fonction utilitaire : Notifie le parrain lors d'une inscription via son lien
async function notifyReferrer(referrerId, newUserId) {
  try {
    const referrer = await User.findOne({ id: referrerId });
    if (referrer) {
      await bot.telegram.sendMessage(referrerId, `🎉 Un nouvel utilisateur (${newUserId}) s'est inscrit via votre lien de parrainage !`);
    }
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

// Action "check" : Vérification de l'abonnement aux canaux
bot.action('check', async (ctx) => {
  const userId = ctx.from.id;
  if (await isUserInChannels(userId)) {
    await User.updateOne({ id: userId }, { joined_channels: true });
    ctx.reply('✅ Accès autorisé !', {
      reply_markup: {
        keyboard: [
          [{ text: 'Mon compte 💳' }, { text: 'Inviter📢' }],
          [{ text: 'Play to win 🎰' }, { text: 'Withdrawal💸' }],
          [{ text: 'Support📩' }, { text: 'Tuto 📖' }],
          [{ text: 'Tombola 🎟️' }]
        ],
        resize_keyboard: true
      }
    });
  } else {
    ctx.reply('❌ Rejoignez les canaux d\'abord !');
  }
});

// Gestion des commandes textuelles de base
bot.hears(['Mon compte 💳', 'Inviter📢', 'Play to win 🎰', 'Withdrawal💸', 'Support📩', 'Tuto 📖', 'Tombola 🎟️'], async (ctx) => {
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
  }
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
      await bot.telegram.sendMessage(
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

// Démarrage du bot et du serveur HTTP
bot.launch()
  .then(() => console.log('🚀 Bot démarré !'))
  .catch(err => {
    console.error('❌ Erreur de démarrage:', err);
    process.exit(1);
  });

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Bot en ligne');
}).listen(8080);

// Système Admin
bot.command('admin', async (ctx) => {
  console.log('Commande /admin reçue');
  try {
    console.log('ID de l\'utilisateur :', ctx.from.id);
    console.log('ID admin configuré :', ADMIN_ID);

    // Vérifiez si l'utilisateur est admin
    if (String(ctx.from.id) !== ADMIN_ID) {
      console.log('Accès refusé : ID ne correspond pas');
      return ctx.reply('❌ Accès refusé. Vous n\'êtes pas administrateur.');
    }

    // Affichez le menu admin
    await ctx.replyWithMarkdown('🔧 *Menu Admin*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 Total Utilisateurs', callback_data: 'admin_users' }],
          [{ text: '📅 Utilisateurs/mois', callback_data: 'admin_month' }],
          [{ text: '📢 Diffuser message', callback_data: 'admin_broadcast' }]
        ]
      }
    });
  } catch (error) {
    console.error('Erreur dans la commande /admin :', error);
    ctx.reply('❌ Une erreur est survenue. Veuillez réessayer.');
  }
});

const broadcastState = new Map();

bot.on('callback_query', async (ctx) => {
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;

  console.log('Callback reçu :', data);

  if (userId === ADMIN_ID) {
    try {
      if (data === 'admin_users') {
        const count = await User.countDocuments();
        console.log('Nombre total d\'utilisateurs :', count);
        await ctx.replyWithMarkdown(`👥 *Total utilisateurs:* ${count}`);
      } else if (data === 'admin_month') {
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const count = await User.countDocuments({ createdAt: { $gte: start } });
        console.log('Utilisateurs ce mois-ci :', count);
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

bot.on('message', async (msgCtx) => {
  const userId = String(msgCtx.from.id);
  const state = broadcastState.get(userId);

  if (state && state.step === 'awaiting_message') {
    const messageId = msgCtx.message.message_id;
    const chatId = msgCtx.chat.id;

    await msgCtx.replyWithMarkdown('Confirmer la diffusion ?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Oui', callback_data: `broadcast_${chatId}_${messageId}` }],
          [{ text: '❌ Non', callback_data: 'broadcast_cancel' }]
        ]
      }
    });

    broadcastState.delete(userId); // Réinitialiser l'état
  }
});

// Gestion globale des erreurs
bot.catch((err, ctx) => {
  console.error(`❌ Erreur pour ${ctx.updateType}:`, err);
});
