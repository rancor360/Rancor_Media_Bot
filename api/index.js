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
    return ctx.reply(`👋 *Welcome to Rancor Media Leverage!*\n\nI will guide you through the 3 steps to activate your account.\n\n*Step 1:* Please send me your *WhatsApp Number* (e.g., +234...) to begin.`, { parse_mode: 'Markdown' });
  }

  if (user.state === 'awaiting_whatsapp') {
    return ctx.reply('Please send your *WhatsApp Number* to proceed to Step 2.', { parse_mode: 'Markdown' });
  }

  if (!user.is_verified) {
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
    const instruct = `⏳ *Verification in Progress*\n\nPlease complete these final steps:\n\n` +
      `*Step 2:* Join our WhatsApp Group below.\n` +
      `*Step 3:* Click "Save My Contact", save the number, and *send me a screenshot* on WhatsApp as proof.\n\n` +
      `Once done, an admin will verify and activate your account!`;
    
    const links = Markup.inlineKeyboard([
      [Markup.button.url('📱 Join Group', settings.group_link)],
      [Markup.button.url('👤 Save My Contact', settings.contact_link)]
    ]);
    
    return ctx.reply(instruct, { parse_mode: 'Markdown', ...links });
  }

  return ctx.reply(`Welcome back, ${first_name}! Choose an option:`, mainMenu);
});

// --- MENU HANDLERS ---

bot.hears('📊 My Stats', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not yet verified.');

  const { data: referrals } = await supabase.from('users').select('first_name').eq('referred_by', ctx.from.id).eq('is_verified', true);
  let list = referrals.length > 0 ? referrals.map(r => `• ${r.first_name}`).join('\n') : 'No verified referrals yet.';
  ctx.reply(`📊 *Your Stats*\n\nTotal Verified Referrals: ${user.total_referrals}\n\n*Referral List:*\n${list}`, { parse_mode: 'Markdown' });
});

bot.hears('💰 Balance', async (ctx) => {
  const { data: user } = await supabase.from('users').select('balance, is_verified').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');
  ctx.reply(`💰 *Current Balance:* ₦${user.balance || 0}`, { parse_mode: 'Markdown' });
});

bot.hears('🔗 Referral Link', async (ctx) => {
  const { data: user } = await supabase.from('users').select('is_verified').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');

  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  ctx.reply(`🔗 *Your Referral Link:*\n\n\`${link}\`\n\nShare this! You earn ₦150 for every friend who joins, saves my contact, and gets verified.`, { parse_mode: 'Markdown' });
});

bot.hears('💸 Redeem', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');

  if (user.total_referrals < 3) return ctx.reply('⚠️ Min 3 verified referrals required to redeem.', { parse_mode: 'Markdown' });
  if (user.balance <= 0) return ctx.reply('⚠️ Your balance is ₦0.');

  await supabase.from('users').update({ state: 'awaiting_bank' }).eq('telegram_id', ctx.from.id);
  ctx.reply('🏦 *Bank Details Request*\n\nPlease send your bank details (Bank Name, Account #, Account Name):', { parse_mode: 'Markdown', ...cancelInline, reply_markup: { remove_keyboard: true } });
});

bot.hears('📜 Policies', (ctx) => {
  ctx.reply(`📜 *Rancor Media Rules*\n\n1. One account per person.\n2. You must join the group AND save our contact (send proof).\n3. Admin verifies all accounts manually.\n4. Min 3 referrals to cash out.\n5. Fraud = Instant Ban.`, { parse_mode: 'Markdown' });
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

  // 1. Awaiting WhatsApp -> Step 2 & 3
  if (user.state === 'awaiting_whatsapp') {
    await supabase.from('users').update({ whatsapp_number: text, state: 'idle' }).eq('telegram_id', telegram_id);
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
    
    const instruct = `✅ *WhatsApp Saved!*\n\nNow follow these final steps:\n\n` +
      `*Step 2:* Click below to Join our WhatsApp Group.\n` +
      `*Step 3:* Click below to Save My Contact. *Important:* Send me a screenshot on WhatsApp as proof that you saved it!\n\n` +
      `After you send the proof on WhatsApp, an admin will verify your account here.`;
    
    const links = Markup.inlineKeyboard([
      [Markup.button.url('📱 Join Group', settings.group_link)],
      [Markup.button.url('👤 Save My Contact', settings.contact_link)]
    ]);
    
    return ctx.reply(instruct, { parse_mode: 'Markdown', ...links });
  }

  // 2. Awaiting Bank Details
  if (user.state === 'awaiting_bank') {
    const { data: existing } = await supabase.from('payout_requests').select('telegram_id').eq('bank_details', text).neq('telegram_id', telegram_id).limit(1);
    if (existing && existing.length > 0) {
       adminIds.forEach(aid => { ctx.telegram.sendMessage(aid, `🚨 *FRAUD ALERT*\nUser ${telegram_id} using bank account from User ${existing[0].telegram_id}.`); });
    }
    await supabase.from('payout_requests').insert({ telegram_id, amount: user.balance, bank_details: text });
    await supabase.from('users').update({ state: 'idle', balance: 0 }).eq('telegram_id', telegram_id);
    return ctx.reply('✅ *Request Submitted!* Admin will review.', mainMenu);
  }

  // 3. Admin Commands
  if (adminIds.includes(telegram_id)) {
    if (text === '/admin') {
      return ctx.reply(`⚙️ *Full Admin Panel*\n\n• \`/unverified\` — Queue for verification.\n• \`/verify <ID>\` — Activate user.\n• \`/listusers\` — See all users & stats.\n• \`/payouts\` — Pending payouts.\n• \`/approve <ID>\` — Complete payout.\n• \`/setlink group <url>\`\n• \`/setlink contact <url>\`\n• \`/setreward <amt>\`\n• \`/ban <ID>\``);
    }
    if (text === '/unverified') {
      const { data: list } = await supabase.from('users').select('*').eq('is_verified', false).not('whatsapp_number', 'is', null);
      if (!list || list.length === 0) return ctx.reply('No pending verifications.');
      let msg = list.map(u => `👤 ${u.first_name}\nID: \`${u.telegram_id}\`\nWA: ${u.whatsapp_number}`).join('\n\n');
      return ctx.reply(`⏳ *Verification Queue*\n\n${msg}`, { parse_mode: 'Markdown' });
    }
    if (text === '/listusers') {
      const { data: list } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (!list || list.length === 0) return ctx.reply('No users.');
      let msg = list.map(u => `${u.is_verified ? '✅' : '⏳'} *${u.first_name}*\nID: \`${u.telegram_id}\` | WA: ${u.whatsapp_number || 'N/A'}\nRefs: ${u.total_referrals} | Earned: ₦${u.balance}`).join('\n\n');
      // Truncate if too long for Telegram
      if (msg.length > 4000) msg = msg.substring(0, 3900) + '... (List too long)';
      return ctx.reply(`👥 *User Directory*\n\n${msg}`, { parse_mode: 'Markdown' });
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
          try { ctx.telegram.sendMessage(target.referred_by, `🎉 Your referral ${target.first_name} verified! ₦${settings.reward_amount} added.`, { parse_mode: 'Markdown' }); } catch(e) {}
        }
        try { ctx.telegram.sendMessage(uid, '🎊 *Account Verified!* Start referring now.', mainMenu); } catch(e) {}
        return ctx.reply(`✅ User \`${uid}\` verified.`);
      }
    }
    if (text.startsWith('/setreward ')) {
      const amt = parseInt(text.split(' ')[1]);
      await supabase.from('settings').update({ reward_amount: amt }).eq('id', 1);
      return ctx.reply(`✅ Reward updated: ₦${amt}`);
    }
    if (text.startsWith('/setlink ')) {
      const parts = text.split(' ');
      const type = parts[1]; // 'group' or 'contact'
      const url = parts[2];
      if (type === 'group') await supabase.from('settings').update({ group_link: url }).eq('id', 1);
      else if (type === 'contact') await supabase.from('settings').update({ contact_link: url }).eq('id', 1);
      else return ctx.reply('Usage: /setlink group <url> OR /setlink contact <url>');
      return ctx.reply(`✅ ${type} link updated.`);
    }
    if (text.startsWith('/ban ')) {
      const uid = text.split(' ')[1];
      await supabase.from('users').update({ is_banned: true }).eq('telegram_id', uid);
      return ctx.reply(`🚫 Banned: \`${uid}\``, { parse_mode: 'Markdown' });
    }
    if (text === '/payouts') {
      const { data: reqs } = await supabase.from('payout_requests').select('*, users(first_name, whatsapp_number)').eq('status', 'pending');
      if (!reqs || reqs.length === 0) return ctx.reply('No payouts.');
      let msg = reqs.map(r => `ID: \`${r.id}\`\nUser: ${r.users.first_name} | WA: ${r.users.whatsapp_number}\nAmt: ₦${r.amount}\nDetails: ${r.bank_details}`).join('\n\n');
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/approve ')) {
      const pid = text.split(' ')[1];
      const { data: req } = await supabase.from('payout_requests').update({ status: 'approved' }).eq('id', pid).select().single();
      if (req) {
        try { ctx.telegram.sendMessage(req.telegram_id, '🎊 Payout Sent!', mainMenu); } catch(e) {}
        return ctx.reply('✅ Approved.');
      }
    }
  }
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (err) { res.status(500).send('Error'); }
};
