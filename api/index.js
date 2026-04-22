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

// --- GLOBAL ERROR HANDLER ---
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('⚠️ *Service Alert*\n\nWe encountered a temporary technical issue. Please try your last action again in a few seconds.', { parse_mode: 'Markdown' });
});

const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

// --- KEYBOARDS ---

const mainMenu = Markup.keyboard([
  ['📊 My Stats', '💰 Balance'],
  ['🔗 Referral Link', '💸 Redeem'],
  ['📜 Policies']
]).resize();

const adminMenu = Markup.keyboard([
  ['⏳ Verifications', '💸 Payout Queue'],
  ['👥 User Directory', '⚙️ Settings'],
  ['➕ More Tools', '🏠 Home']
]).resize();

const adminMoreMenu = Markup.keyboard([
  ['✅ Verify by ID', '🚫 Ban User'],
  ['💰 Set Reward', '💸 Approve Payout'],
  ['📱 Set Group Link', '👤 Set Contact Link'],
  ['⬅️ Back']
]).resize();

const cancelInline = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Cancel Action', 'cancel_action')]
]);

// --- MIDDLEWARE ---

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  
  // 1. Check for Ban
  const { data: user } = await supabase.from('users').select('is_banned').eq('telegram_id', ctx.from.id).single();
  if (user && user.is_banned) {
    return ctx.reply('🚫 *Account Banned*\n\nYour account has been suspended for violating our policies.', { parse_mode: 'Markdown' });
  }

  // 2. Refresh Admin Status
  const envAdminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
  const masterAdmin = envAdminIds[0];

  if (envAdminIds.includes(ctx.from.id)) {
    ctx.isAdmin = true;
    ctx.isSuperAdmin = (ctx.from.id === masterAdmin);
  } else {
    const { data: admin } = await supabase.from('admins').select('telegram_id').eq('telegram_id', ctx.from.id).single();
    ctx.isAdmin = !!admin;
    ctx.isSuperAdmin = false;
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
      `✅ *Note:* After sending proof, please check back within 24 hours (do steady checks to see that you have been verified). An admin will activate your account!`;
    
    const links = Markup.inlineKeyboard([
      [Markup.button.url('📱 Join Group', settings.group_link)],
      [Markup.button.url('👤 Save My Contact', settings.contact_link)]
    ]);
    
    await ctx.reply(instruct, { parse_mode: 'Markdown', ...links });
    return ctx.reply('Use the menu below to explore our policies and referral bonuses:', mainMenu);
  }

  return ctx.reply(`Welcome back, ${first_name}! Choose an option:`, mainMenu);
});

// --- MENU HANDLERS ---

bot.hears('📊 My Stats', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not yet verified. Please check back within 24 hours (do steady checks to see that you have been verified).');

  const { data: referrals } = await supabase.from('users').select('first_name').eq('referred_by', ctx.from.id).eq('is_verified', true);
  let list = referrals.length > 0 ? referrals.map(r => `• ${r.first_name}`).join('\n') : 'No verified referrals yet.';
  ctx.reply(`📊 *Your Stats*\n\nTotal Verified Referrals: ${user.total_referrals}\n\n*Referral List:*\n${list}`, { parse_mode: 'Markdown' });
});

bot.hears('💰 Balance', async (ctx) => {
  const { data: user } = await supabase.from('users').select('total_referrals, is_verified').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not yet verified.');

  const { data: settings } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
  const currentBalance = (user.total_referrals || 0) * settings.reward_amount;
  
  ctx.reply(`💰 *Current Balance:* ₦${currentBalance}\n\n_(Calculated at the current rate of ₦${settings.reward_amount} per referral)_`, { parse_mode: 'Markdown' });
});

bot.hears('🔗 Referral Link', async (ctx) => {
  const { data: user } = await supabase.from('users').select('is_verified').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');

  const { data: settings } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  ctx.reply(`🔗 *Your Referral Link:*\n\n\`${link}\`\n\nShare this! You earn ₦${settings.reward_amount} for every friend who joins, saves my contact, and gets verified.`, { parse_mode: 'Markdown' });
});

bot.hears('💸 Redeem', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  if (!user || !user.is_verified) return ctx.reply('⚠️ Account not verified.');

  if (user.total_referrals < 3) return ctx.reply('⚠️ Min 3 verified referrals required to redeem.', { parse_mode: 'Markdown' });
  
  const { data: settings } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
  const currentBalance = (user.total_referrals || 0) * settings.reward_amount;
  if (currentBalance <= 0) return ctx.reply('⚠️ Your balance is ₦0.');

  await supabase.from('users').update({ state: 'awaiting_bank' }).eq('telegram_id', ctx.from.id);
  ctx.reply('🏦 *Bank Details Request*\n\nPlease send your bank details (Bank Name, Account #, Account Name):', { parse_mode: 'Markdown', ...cancelInline, reply_markup: { remove_keyboard: true } });
});

bot.hears(/Policies/i, async (ctx) => {
  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
  
  const msg = `<b>📜 Rancor Media Policies & Guide</b>\n\n` +
    `🚀 <b>How it Works:</b>\n` +
    `1️⃣ Share your link from the "Referral Link" button.\n` +
    `2️⃣ Your friend must join the group and save our contact.\n` +
    `3️⃣ Send a screenshot proof to an admin (via WhatsApp or here).\n` +
    `4️⃣ Earn <b>₦${settings.reward_amount}</b> for every friend who gets verified!\n\n` +
    `⚖️ <b>Rules:</b>\n` +
    `• One account per person only.\n` +
    `• Min 3 referrals required to cash out.\n` +
    `• Fraud or duplicate accounts = Instant Ban.\n\n` +
    `🔗 <b>Group Link:</b> ${settings.group_link}\n` +
    `👤 <b>Admin Contact:</b> ${settings.contact_link}`;

  ctx.reply(msg, { parse_mode: 'HTML' });
});

// --- STATE & TEXT HANDLERS ---

bot.action('cancel_action', async (ctx) => {
  await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', ctx.from.id);
  await ctx.answerCbQuery('Canceled');
  ctx.reply('❌ Action canceled.', mainMenu);
});

// --- PHOTO HANDLER (For Verification) ---
bot.on('photo', async (ctx) => {
  const telegram_id = ctx.from.id;
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (user && !user.is_verified) {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get highest resolution
    
    // Notify user
    ctx.reply('📩 *Proof Submitted!*\nAn admin will review your screenshot shortly. You will be notified once activated.', { parse_mode: 'Markdown' });

    // Notify Admins
    const envAdminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
    const { data: dbAdmins } = await supabase.from('admins').select('telegram_id');
    const allAdmins = [...envAdminIds, ...(dbAdmins || []).map(a => a.telegram_id)];

    const verifyButton = Markup.inlineKeyboard([
      [Markup.button.callback(`✅ Verify ${ctx.from.first_name}`, `verify_user_${telegram_id}`)]
    ]);

    allAdmins.forEach(aid => {
      try {
        ctx.telegram.sendPhoto(aid, photo.file_id, {
          caption: `📸 *New Verification Proof*\nUser: ${ctx.from.first_name}\nID: \`${telegram_id}\`\nWA: ${user.whatsapp_number}`,
          parse_mode: 'Markdown',
          ...verifyButton
        });
      } catch (e) {}
    });
  }
});

// --- INLINE ACTIONS ---
bot.action(/^verify_user_(\d+)$/, async (ctx) => {
  if (!ctx.isAdmin) return ctx.answerCbQuery('🚫 Unauthorized');
  
  const uid = parseInt(ctx.match[1]);
  const { data: target } = await supabase.from('users').select('*').eq('telegram_id', uid).single();
  
  if (target && !target.is_verified) {
    const { data: s } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
    
    // Use RPC for transaction safety - pass null explicitly if r_id is missing
    const { error } = await supabase.rpc('verify_user_and_reward', {
      u_id: uid,
      r_id: target.referred_by || null,
      amt: parseInt(s.reward_amount)
    });

    if (error) {
      console.error('RPC Error:', error);
      return ctx.answerCbQuery('❌ Error activating user.');
    }

    try { 
      await ctx.telegram.sendMessage(uid, `🎊 *Account Verified!*\n\nYou've been activated. You can now earn ₦${s.reward_amount} for every verified referral.`, mainMenu); 
    } catch(e) {}
    
    await ctx.editMessageCaption(`✅ *User Verified*\nVerified by: ${ctx.from.first_name}\nReward: ₦${s.reward_amount}`, { parse_mode: 'Markdown' });
    ctx.answerCbQuery('User Activated!');
  } else {
    ctx.answerCbQuery('User already verified or not found.');
  }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const telegram_id = ctx.from.id;
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (!user || ['📊 My Stats', '💰 Balance', '🔗 Referral Link', '💸 Redeem'].includes(text) || /Policies/i.test(text)) return;

  // 1. Awaiting WhatsApp -> Step 2 & 3
  if (user.state === 'awaiting_whatsapp') {
    await supabase.from('users').update({ whatsapp_number: text, state: 'idle' }).eq('telegram_id', telegram_id);
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
    
    // Notify Admins
    adminIds.forEach(aid => {
      try {
        ctx.telegram.sendMessage(aid, `🆕 *New User Pending Verification*\n\nName: ${user.first_name}\nID: \`${telegram_id}\`\nWA: ${text}\n\nUse \`/verify ${telegram_id}\` once they send the screenshot proof.`, { parse_mode: 'Markdown' });
      } catch(e) {}
    });

    const instruct = `✅ *WhatsApp Saved!*\n\nNow follow these final steps:\n\n` +
      `*Step 2:* Click below to Join our WhatsApp Group.\n` +
      `*Step 3:* Click below to Save My Contact. *Important:* Send me a screenshot on WhatsApp as proof that you saved it!\n\n` +
      `🕒 *After sending proof, please check back within 24 hours (do steady checks to see that you have been verified).* An admin will activate your account here soon!`;
    
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

  // 3. Admin Handling Logic
  if (ctx.isAdmin) {
    // A. Handle Admin Inputs based on State
    if (user.state.startsWith('admin_awaiting_')) {
      if (text === '❌ Cancel' || text === '/cancel') {
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply('Action canceled.', adminMenu);
      }

      if (user.state === 'admin_awaiting_reward') {
        const amt = parseInt(text);
        if (isNaN(amt) || amt < 0) return ctx.reply('❌ Please enter a valid positive number for the reward.');
        await supabase.from('settings').update({ reward_amount: amt }).eq('id', 1);
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply(`✅ Reward updated to ₦${amt}.`, adminMoreMenu);
      }

      if (user.state === 'admin_awaiting_group_link') {
        if (!text.startsWith('http')) return ctx.reply('❌ Please enter a valid URL starting with http:// or https://');
        await supabase.from('settings').update({ group_link: text }).eq('id', 1);
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply('✅ Group link updated.', adminMoreMenu);
      }

      if (user.state === 'admin_awaiting_contact_link') {
        if (!text.startsWith('http')) return ctx.reply('❌ Please enter a valid URL starting with http:// or https://');
        await supabase.from('settings').update({ contact_link: text }).eq('id', 1);
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply('✅ Contact link updated.', adminMoreMenu);
      }

      if (user.state === 'admin_awaiting_verify_id') {
        const uid = parseInt(text);
        if (isNaN(uid)) return ctx.reply('❌ Invalid ID format. Please enter a numeric Telegram ID.');
        
        const { data: target } = await supabase.from('users').select('*').eq('telegram_id', uid).single();
        if (!target) return ctx.reply(`❌ User with ID \`${uid}\` not found in database.`, Markup.keyboard([['❌ Cancel']]).resize());
        if (target.is_verified) return ctx.reply(`⚠️ User \`${uid}\` is already verified.`, adminMoreMenu);

        const { data: s } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
        const { error } = await supabase.rpc('verify_user_and_reward', { u_id: uid, r_id: target.referred_by, amt: s.reward_amount });
        if (error) return ctx.reply('❌ Database error during activation.');

        try { ctx.telegram.sendMessage(uid, '🎊 *Account Verified!* You can now start referring.', mainMenu); } catch(e) {}
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply(`✅ User \`${uid}\` (${target.first_name}) verified successfully.`, adminMoreMenu);
      }

      if (user.state === 'admin_awaiting_ban_id') {
        const uid = parseInt(text);
        if (isNaN(uid)) return ctx.reply('❌ Invalid ID format.');
        
        const { data: target } = await supabase.from('users').select('telegram_id').eq('telegram_id', uid).single();
        if (!target) return ctx.reply('❌ User not found in database.', Markup.keyboard([['❌ Cancel']]).resize());

        await supabase.from('users').update({ is_banned: true }).eq('telegram_id', uid);
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply(`🚫 User \`${uid}\` has been banned.`, adminMoreMenu);
      }

      if (user.state === 'admin_awaiting_approve_id') {
        const pid = parseInt(text);
        if (isNaN(pid)) return ctx.reply('❌ Invalid Payout ID.');
        
        const { data: req } = await supabase.from('payout_requests').select('*').eq('id', pid).single();
        if (!req) return ctx.reply('❌ Payout request not found.');
        if (req.status === 'approved') return ctx.reply('⚠️ This payout is already approved.', adminMoreMenu);

        await supabase.from('payout_requests').update({ status: 'approved' }).eq('id', pid);
        try { ctx.telegram.sendMessage(req.telegram_id, '🎊 *Payout Sent!* Check your bank account.', mainMenu); } catch(e) {}
        await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
        return ctx.reply(`✅ Payout ID \`${pid}\` approved.`, adminMoreMenu);
      }
    }

    // B. Super Admin Commands
    if (ctx.isSuperAdmin) {
      if (text.startsWith('/addadmin ')) {
        const aid = parseInt(text.split(' ')[1]);
        if (isNaN(aid)) return ctx.reply('Usage: /addadmin <ID>');
        await supabase.from('admins').insert({ telegram_id: aid, added_by: telegram_id });
        return ctx.reply(`✅ Sub-admin \`${aid}\` added.`);
      }
      if (text.startsWith('/removeadmin ')) {
        const aid = parseInt(text.split(' ')[1]);
        await supabase.from('admins').delete().eq('telegram_id', aid);
        return ctx.reply(`🗑 Admin \`${aid}\` removed.`);
      }
      if (text === '/listadmins') {
        const { data: ads } = await supabase.from('admins').select('*');
        let msg = ads.map(a => `• \`${a.telegram_id}\` (Added: ${new Date(a.created_at).toLocaleDateString()})`).join('\n');
        return ctx.reply(`👥 *Sub-Admins*\n\n${msg || 'No sub-admins yet.'}`, { parse_mode: 'Markdown' });
      }
    }

    // C. Menu Navigation
    if (text === '/admin' || text === '⬅️ Back') {
      return ctx.reply('⚙️ *Admin Panel*', adminMenu);
    }
    if (text === '➕ More Tools') {
      return ctx.reply('🛠 *Advanced Tools*', adminMoreMenu);
    }
    if (text === '🏠 Home') {
      return ctx.reply('🏠 *User Menu*', mainMenu);
    }

    if (text === '⚙️ Settings') {
      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
      return ctx.reply(`⚙️ *Bot Settings*\n\n💰 Reward: ₦${settings.reward_amount}\n📱 Group: ${settings.group_link}\n👤 Contact: ${settings.contact_link}`, adminMenu);
    }

    if (text === '⏳ Verifications') {
      const { data: list } = await supabase.from('users').select('*').eq('is_verified', false).not('whatsapp_number', 'is', null);
      if (!list || list.length === 0) return ctx.reply('No pending verifications.');
      let msg = list.map(u => `👤 ${u.first_name}\nID: \`${u.telegram_id}\`\nWA: ${u.whatsapp_number}`).join('\n\n');
      return ctx.reply(`⏳ *Verification Queue*\n\n${msg}`, { parse_mode: 'Markdown' });
    }

    if (text === '👥 User Directory') {
      const { data: list } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(20);
      let msg = list.map(u => `${u.is_verified ? '✅' : '⏳'} *${u.first_name}* (\`${u.telegram_id}\`)\nRefs: ${u.total_referrals} | Earned: ₦${u.balance}`).join('\n\n');
      return ctx.reply(`👥 *Recent Users*\n\n${msg}`, { parse_mode: 'Markdown' });
    }

    if (text === '💸 Payout Queue') {
      const { data: reqs } = await supabase.from('payout_requests').select('*, users(first_name, whatsapp_number)').eq('status', 'pending');
      if (!reqs || reqs.length === 0) return ctx.reply('No payouts.');
      let msg = reqs.map(r => `ID: \`${r.id}\`\nUser: ${r.users.first_name}\nAmt: ₦${r.amount}\nDetails: ${r.bank_details}`).join('\n\n');
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    // D. Trigger Action States
    const stateMap = {
      '💰 Set Reward': 'admin_awaiting_reward',
      '📱 Set Group Link': 'admin_awaiting_group_link',
      '👤 Set Contact Link': 'admin_awaiting_contact_link',
      '✅ Verify by ID': 'admin_awaiting_verify_id',
      '🚫 Ban User': 'admin_awaiting_ban_id',
      '💸 Approve Payout': 'admin_awaiting_approve_id'
    };

    if (stateMap[text]) {
      await supabase.from('users').update({ state: stateMap[text] }).eq('telegram_id', telegram_id);
      return ctx.reply('Please enter the required information or click Cancel:', Markup.keyboard([['❌ Cancel']]).resize());
    }
  }
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (err) { res.status(500).send('Error'); }
};
