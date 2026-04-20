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

const mainMenu = Markup.keyboard([
  ['📊 My Stats', '💰 Balance'],
  ['🔗 Referral Link', '💸 Redeem'],
  ['📜 Policies']
]).resize();

const cancelInline = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Cancel Action', 'cancel_action')]
]);

// --- MIDDLEWARE ---

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const { data: user } = await supabase.from('users').select('is_banned').eq('telegram_id', ctx.from.id).single();
  if (user && user.is_banned) {
    return ctx.reply('🚫 *Account Banned*\n\nYour account has been suspended for violating our policies.', { parse_mode: 'Markdown' });
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
    let referredBy = null;
    if (startPayload && !isNaN(startPayload) && parseInt(startPayload) !== telegram_id) {
      referredBy = parseInt(startPayload);
    }
    await supabase.from('users').insert({
      telegram_id, username, first_name, referred_by: referredBy, is_verified: false, state: 'awaiting_whatsapp'
    });
    return ctx.reply(`👋 *Welcome to Rancor Media Leverage!*\n\nTo start earning, please send us your *WhatsApp Number* (e.g., +234...) so an admin can verify you.`, { parse_mode: 'Markdown' });
  }

  if (user.state === 'awaiting_whatsapp') {
    return ctx.reply('Please send your *WhatsApp Number* to continue.', { parse_mode: 'Markdown' });
  }

  if (!user.is_verified) {
    return ctx.reply('⏳ *Verification Pending*\n\nAn admin is currently reviewing your WhatsApp registration. Please make sure you have joined our group.', { parse_mode: 'Markdown' });
  }

  return ctx.reply(`Welcome back, ${first_name}! What would you like to do?`, mainMenu);
});

// --- MENU HANDLERS ---

bot.hears('📊 My Stats', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Your account is not yet verified by an admin.');

  const { data: referrals } = await supabase.from('users').select('first_name').eq('referred_by', ctx.from.id).eq('is_verified', true);
  let list = referrals.length > 0 ? referrals.map(r => `• ${r.first_name}`).join('\n') : 'No verified referrals yet.';
  ctx.reply(`📊 *Your Stats*\n\nTotal Verified Referrals: ${user.total_referrals}\n\n*Referral List:*\n${list}`, { parse_mode: 'Markdown' });
});

bot.hears('💰 Balance', async (ctx) => {
  const { data: user } = await supabase.from('users').select('balance, is_verified').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');
  ctx.reply(`💰 *Your Balance:* ₦${user.balance || 0}`, { parse_mode: 'Markdown' });
});

bot.hears('🔗 Referral Link', async (ctx) => {
  const { data: user } = await supabase.from('users').select('is_verified').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');

  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  ctx.reply(`🔗 *Your Referral Link:*\n\n\`${link}\`\n\nShare this! You earn when your friends join and get verified by an admin.`, { parse_mode: 'Markdown' });
});

bot.hears('💸 Redeem', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');

  if (user.total_referrals < 3) return ctx.reply('⚠️ You need at least *3 verified referrals* to redeem.', { parse_mode: 'Markdown' });
  if (user.balance <= 0) return ctx.reply('⚠️ Your balance is ₦0.');

  await supabase.from('users').update({ state: 'awaiting_bank' }).eq('telegram_id', ctx.from.id);
  ctx.reply('🏦 *Bank Details Request*\n\nPlease send your bank details (Bank, Account #, Name):', { parse_mode: 'Markdown', ...cancelInline, reply_markup: { remove_keyboard: true } });
});

bot.hears('📜 Policies', (ctx) => {
  ctx.reply(`📜 *Policies*\n\n1. One account per person.\n2. Admin must manually verify your WhatsApp number.\n3. Min 3 referrals to cash out.\n4. Fraud results in a ban.`, { parse_mode: 'Markdown' });
});

// --- STATE & TEXT HANDLERS ---

bot.action('cancel_action', async (ctx) => {
  await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', ctx.from.id);
  await ctx.answerCbQuery('Canceled');
  ctx.reply('❌ Action canceled.', mainMenu);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const telegram_id = ctx.from.id;
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (!user || ['📊 My Stats', '💰 Balance', '🔗 Referral Link', '💸 Redeem', '📜 Policies'].includes(text)) return;

  // 1. Awaiting WhatsApp -> Wait for Admin
  if (user.state === 'awaiting_whatsapp') {
    await supabase.from('users').update({ whatsapp_number: text, state: 'idle' }).eq('telegram_id', telegram_id);
    const { data: settings } = await supabase.from('settings').select('whatsapp_link').eq('id', 1).single();
    return ctx.reply(`✅ *WhatsApp Received!*\n\nAn admin will now verify your account. Please make sure you have joined the group:\n\n👉 ${settings.whatsapp_link}`, { parse_mode: 'Markdown' });
  }

  // 2. Awaiting Bank Details
  if (user.state === 'awaiting_bank') {
    await supabase.from('payout_requests').insert({ telegram_id, amount: user.balance, bank_details: text });
    await supabase.from('users').update({ state: 'idle', balance: 0 }).eq('telegram_id', telegram_id);
    return ctx.reply('✅ *Success!* Payout request submitted.', mainMenu);
  }

  // 3. Admin Commands
  if (adminIds.includes(telegram_id)) {
    if (text === '/admin') {
      return ctx.reply(`⚙️ *Admin Panel*\n\n• \`/unverified\` — Users waiting for verification.\n• \`/verify <ID>\` — Verify a user.\n• \`/payouts\` — Pending payouts.\n• \`/approve <ID>\` — Approve payout.\n• \`/ban <ID>\` / \`/unban <ID>\``);
    }
    if (text === '/unverified') {
      const { data: list } = await supabase.from('users').select('telegram_id, first_name, whatsapp_number').eq('is_verified', false).not('whatsapp_number', 'is', null);
      if (!list || list.length === 0) return ctx.reply('No users waiting for verification.');
      let msg = list.map(u => `👤 ${u.first_name}\nID: \`${u.telegram_id}\`\nWA: ${u.whatsapp_number}`).join('\n\n');
      return ctx.reply(`⏳ *Unverified Users*\n\n${msg}`, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/verify ')) {
      const uid = parseInt(text.split(' ')[1]);
      const { data: target } = await supabase.from('users').select('*').eq('telegram_id', uid).single();
      if (target && !target.is_verified) {
        const { data: settings } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
        await supabase.from('users').update({ is_verified: true }).eq('telegram_id', uid);
        
        if (target.referred_by) {
          const { data: ref } = await supabase.from('users').select('*').eq('telegram_id', target.referred_by).single();
          await supabase.from('users').update({ balance: ref.balance + settings.reward_amount, total_referrals: ref.total_referrals + 1 }).eq('telegram_id', target.referred_by);
          try { ctx.telegram.sendMessage(target.referred_by, `🎉 Your referral ${target.first_name} was verified! ₦${settings.reward_amount} added.`, { parse_mode: 'Markdown' }); } catch(e) {}
        }
        try { ctx.telegram.sendMessage(uid, '🎊 *Account Verified!* You can now start referring.', mainMenu); } catch(e) {}
        return ctx.reply(`✅ User \`${uid}\` verified.`);
      }
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
      return ctx.reply(`🚫 User \`${uid}\` banned.`);
    }
    if (text === '/payouts') {
      const { data: reqs } = await supabase.from('payout_requests').select('*, users(first_name, whatsapp_number)').eq('status', 'pending');
      if (!reqs || reqs.length === 0) return ctx.reply('No payouts.');
      let msg = reqs.map(r => `ID: \`${r.id}\`\nUser: ${r.users.first_name}\nAmt: ₦${r.amount}\nDetails: ${r.bank_details}`).join('\n\n');
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/approve ')) {
      const pid = text.split(' ')[1];
      const { data: req } = await supabase.from('payout_requests').update({ status: 'approved' }).eq('id', pid).select().single();
      if (req) {
        try { ctx.telegram.sendMessage(req.telegram_id, '🎊 Payout Approved!', mainMenu); } catch(e) {}
        return ctx.reply('✅ Approved.');
      }
    }
  }
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (err) { res.status(500).send('Error'); }
};
