const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Bot
const bot = new Telegraf(process.env.BOT_TOKEN);
const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

// --- KEYBOARDS ---

// Persistent Main Menu (Reply Keyboard)
const mainMenu = Markup.keyboard([
  ['📊 My Stats', '💰 Balance'],
  ['🔗 Referral Link', '💸 Redeem'],
  ['📜 Policies']
]).resize();

// Cancel Button (Inline)
const cancelInline = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Cancel Action', 'cancel_action')]
]);

// --- MIDDLEWARE ---

// Check if user is banned
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  
  const { data: user } = await supabase.from('users').select('is_banned').eq('telegram_id', ctx.from.id).single();
  
  if (user && user.is_banned) {
    return ctx.reply('🚫 *Account Banned*\n\nYour account has been suspended for violating our policies (e.g., multiple accounts or fake referrals).', { parse_mode: 'Markdown' });
  }
  return next();
});

// --- COMMANDS ---

bot.start(async (ctx) => {
  const telegram_id = ctx.from.id;
  const first_name = ctx.from.first_name;
  const username = ctx.from.username || null;
  const startPayload = ctx.payload;

  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (!user) {
    // Start Onboarding
    let referredBy = null;
    if (startPayload && !isNaN(startPayload) && parseInt(startPayload) !== telegram_id) {
      referredBy = parseInt(startPayload);
    }

    await supabase.from('users').insert({
      telegram_id, username, first_name, referred_by: referredBy, is_verified: false, state: 'awaiting_whatsapp'
    });

    return ctx.reply(`👋 *Welcome to Rancor Media Leverage!*\n\nYou've been invited to earn rewards by growing our community. \n\n*Step 1:* Please send us your *WhatsApp Number* (with country code, e.g., +234...) to continue.`, { parse_mode: 'Markdown' });
  }

  if (user.state === 'awaiting_whatsapp') {
    return ctx.reply('Please send your *WhatsApp Number* to continue registration.', { parse_mode: 'Markdown' });
  }

  if (!user.is_verified) {
    const { data: settings } = await supabase.from('settings').select('whatsapp_link').eq('id', 1).single();
    return ctx.reply(`⏳ *Verification Pending*\n\n1️⃣ Join our WhatsApp group: ${settings.whatsapp_link}\n2️⃣ Type the *Secret Code* found in the pinned message here.`, { parse_mode: 'Markdown' });
  }

  return ctx.reply(`Welcome back, ${first_name}! What would you like to do?`, mainMenu);
});

// --- MENU HANDLERS ---

bot.hears('📊 My Stats', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Please verify your account first.');

  const { data: referrals } = await supabase.from('users').select('first_name, username').eq('referred_by', ctx.from.id).eq('is_verified', true);
  let list = referrals.length > 0 ? referrals.map(r => `• ${r.first_name}`).join('\n') : 'No verified referrals yet.';
  
  ctx.reply(`📊 *Your Stats*\n\nTotal Verified Referrals: ${user.total_referrals}\n\n*Referral List:*\n${list}`, { parse_mode: 'Markdown' });
});

bot.hears('💰 Balance', async (ctx) => {
  const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
  ctx.reply(`💰 *Your Balance:* ₦${user.balance || 0}`, { parse_mode: 'Markdown' });
});

bot.hears('🔗 Referral Link', async (ctx) => {
  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  ctx.reply(`🔗 *Your Unique Referral Link:*\n\n\`${link}\`\n\nShare this link! You earn when your friends join and verify their accounts.`, { parse_mode: 'Markdown' });
});

bot.hears('💸 Redeem', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  
  if (user.total_referrals < 3) {
    return ctx.reply('⚠️ *Threshold Not Met*\nYou need at least *3 verified referrals* to request a payout.', { parse_mode: 'Markdown' });
  }
  if (user.balance <= 0) {
    return ctx.reply('⚠️ Your balance is currently ₦0.', mainMenu);
  }

  await supabase.from('users').update({ state: 'awaiting_bank' }).eq('telegram_id', ctx.from.id);
  ctx.reply('🏦 *Bank Details Request*\n\nPlease send your bank details in this format:\n\n*Bank Name*\n*Account Number*\n*Account Name*', { parse_mode: 'Markdown', ...cancelInline, reply_markup: { remove_keyboard: true } });
});

bot.hears('📜 Policies', (ctx) => {
  const policyText = `📜 *Rancor Media Policies*\n\n1. *One Account Only:* Strictly prohibited. One account per person/device.\n2. *Verification:* Referrals only count once the new user provides their *WhatsApp Number*, joins the group, and enters the *Secret Code*.\n3. *Payouts:* Minimum 3 verified referrals required. Reviewed manually within 24-48 hours.\n4. *Fraud:* Fake referrals or duplicate bank details will result in a permanent ban.`;
  ctx.reply(policyText, { parse_mode: 'Markdown' });
});

// --- STATE & TEXT HANDLERS ---

bot.action('cancel_action', async (ctx) => {
  await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', ctx.from.id);
  await ctx.answerCbQuery('Action Canceled');
  ctx.reply('❌ Action canceled. Returning to main menu.', mainMenu);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const telegram_id = ctx.from.id;
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (!user || ['📊 My Stats', '💰 Balance', '🔗 Referral Link', '💸 Redeem', '📜 Policies'].includes(text)) return;

  // 1. Awaiting WhatsApp Number
  if (user.state === 'awaiting_whatsapp') {
    await supabase.from('users').update({ whatsapp_number: text, state: 'idle' }).eq('telegram_id', telegram_id);
    const { data: settings } = await supabase.from('settings').select('whatsapp_link').eq('id', 1).single();
    return ctx.reply(`✅ *WhatsApp Saved!*\n\nNow for the final step:\n\n1️⃣ Join our WhatsApp Group: ${settings.whatsapp_link}\n2️⃣ Find the *Secret Code* in the pinned message and type it here.`, { parse_mode: 'Markdown' });
  }

  // 2. Awaiting Bank Details
  if (user.state === 'awaiting_bank') {
    // Duplicate Bank Check (Fraud Prevention)
    const { data: existing } = await supabase.from('payout_requests').select('telegram_id').eq('bank_details', text).neq('telegram_id', telegram_id).limit(1);
    
    if (existing && existing.length > 0) {
       // Notify admins of potential fraud
       adminIds.forEach(aid => {
         ctx.telegram.sendMessage(aid, `🚨 *FRAUD ALERT*\nUser ${telegram_id} tried to use a bank account already linked to User ${existing[0].telegram_id}.`, { parse_mode: 'Markdown' });
       });
    }

    await supabase.from('payout_requests').insert({ telegram_id, amount: user.balance, bank_details: text });
    await supabase.from('users').update({ state: 'idle', balance: 0 }).eq('telegram_id', telegram_id);
    return ctx.reply('✅ *Success!*\nYour payout request has been submitted for admin review.', mainMenu);
  }

  // 3. Verification Code (if not verified)
  if (!user.is_verified) {
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (text.toLowerCase() === settings.secret_code.toLowerCase()) {
      await supabase.from('users').update({ is_verified: true }).eq('telegram_id', telegram_id);
      
      if (user.referred_by) {
        const { data: referrer } = await supabase.from('users').select('*').eq('telegram_id', user.referred_by).single();
        if (referrer) {
          await supabase.from('users').update({
            balance: referrer.balance + settings.reward_amount,
            total_referrals: referrer.total_referrals + 1
          }).eq('telegram_id', user.referred_by);
          
          try {
            await ctx.telegram.sendMessage(user.referred_by, `🎉 *New Verified Referral!*\n\n${user.first_name} has joined and verified. ₦${settings.reward_amount} added to your balance.`, { parse_mode: 'Markdown' });
          } catch(e) {}
        }
      }
      return ctx.reply('🎊 *Account Verified!*\n\nYou are now ready to start earning. Use the menu below to get your link.', mainMenu);
    } else {
      return ctx.reply('❌ *Invalid Code*\nPlease check the pinned message in our WhatsApp group again.');
    }
  }

  // 4. Admin Commands
  if (adminIds.includes(telegram_id)) {
    if (text === '/admin') {
      const adminHelp = `⚙️ *Admin Control Panel*\n\n` +
        `• \`/payouts\` — See pending payout requests.\n` +
        `• \`/approve <ID>\` — Approve a payout request.\n` +
        `• \`/setcode <new_code>\` — Update the secret code.\n` +
        `• \`/setreward <amount>\` — Change amount per referral.\n` +
        `• \`/setlink <url>\` — Change WhatsApp group link.\n` +
        `• \`/ban <user_id>\` — Ban a fraudulent user.\n` +
        `• \`/unban <user_id>\` — Unban a user.\n\n` +
        `_Note: Do not include brackets (< >) in your commands._`;
      return ctx.reply(adminHelp, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/setcode ')) {
      const code = text.split(' ')[1];
      await supabase.from('settings').update({ secret_code: code }).eq('id', 1);
      return ctx.reply(`✅ Verification code updated to: \`${code}\``, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/setreward ')) {
      const amt = parseInt(text.split(' ')[1]);
      await supabase.from('settings').update({ reward_amount: amt }).eq('id', 1);
      return ctx.reply(`✅ Reward updated to: ₦${amt}`);
    }
    if (text.startsWith('/setlink ')) {
      const link = text.split(' ')[1];
      await supabase.from('settings').update({ whatsapp_link: link }).eq('id', 1);
      return ctx.reply(`✅ WhatsApp link updated to: ${link}`);
    }
    if (text.startsWith('/ban ')) {
      const uid = text.split(' ')[1];
      await supabase.from('users').update({ is_banned: true }).eq('telegram_id', uid);
      return ctx.reply(`🚫 User \`${uid}\` has been banned.`, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/unban ')) {
      const uid = text.split(' ')[1];
      await supabase.from('users').update({ is_banned: false }).eq('telegram_id', uid);
      return ctx.reply(`✅ User \`${uid}\` has been unbanned.`, { parse_mode: 'Markdown' });
    }
    if (text === '/payouts') {
      const { data: requests } = await supabase.from('payout_requests').select('*, users(first_name, whatsapp_number)').eq('status', 'pending');
      if (!requests || requests.length === 0) return ctx.reply('No pending payouts.');
      let list = requests.map(r => `ID: \`${r.id}\`\nUser: ${r.users.first_name}\nWA: ${r.users.whatsapp_number}\nAmt: ₦${r.amount}\nDetails: ${r.bank_details}`).join('\n\n');
      return ctx.reply(`📋 *Pending Payouts*\n\n${list}\n\nApprove with: \`/approve ID\``, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/approve ')) {
      const pid = text.split(' ')[1];
      const { data: req } = await supabase.from('payout_requests').update({ status: 'approved' }).eq('id', pid).select().single();
      if (req) {
        try { ctx.telegram.sendMessage(req.telegram_id, '🎊 *Payout Approved!*\nYour money is on the way. Check your bank.', { parse_mode: 'Markdown' }); } catch(e) {}
        return ctx.reply('✅ Approved successfully.');
      }
    }
  }
});

// Vercel Export
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
};
