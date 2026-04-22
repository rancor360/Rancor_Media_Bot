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

// --- GLOBAL BUTTON LIST (For exclusion) ---
const allButtons = [
  '📊 My Stats', '💰 Balance', '🔗 Referral Link', '💸 Redeem', '📜 Policies',
  '⏳ Verifications', '💸 Payout Queue', '👥 User Directory', '📥 Download Report',
  '⚙️ Settings', '➕ More Tools', '🏠 Home', '✅ Verify by ID', '🚫 Ban User',
  '💰 Set Reward', '💸 Approve Payout', '📱 Set Group Link', '👤 Set Contact Link',
  '⬅️ Back', '❌ Cancel', '📢 Broadcast'
];

// --- KEYBOARDS ---

const mainMenu = Markup.keyboard([
  ['📊 My Stats', '💰 Balance'],
  ['🔗 Referral Link', '💸 Redeem'],
  ['📜 Policies']
]).resize();

const adminMenu = Markup.keyboard([
  ['⏳ Verifications', '💸 Payout Queue'],
  ['👥 User Directory', '📥 Download Report'],
  ['⚙️ Settings', '➕ More Tools'],
  ['🏠 Home']
]).resize();

const adminMoreMenu = Markup.keyboard([
  ['✅ Verify by ID', '🚫 Ban User'],
  ['💰 Set Reward', '💸 Approve Payout'],
  ['📱 Set Group Link', '👤 Set Contact Link'],
  ['📢 Broadcast', '⬅️ Back']
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
    const instruct = `⏳ <b>Verification in Progress</b>\n\nPlease complete these final steps:\n\n` +
      `<b>Step 2:</b> Join our WhatsApp Group below.\n` +
      `<b>Step 3:</b> Click "Save My Contact", save the number, and <b>send me a screenshot right here</b> in this chat as proof.\n\n` +
      `✅ <b>Note:</b> After sending proof, an admin will activate your account within 24 hours. Check back steady!`;
    
    const links = Markup.inlineKeyboard([
      [Markup.button.url('📱 Join Group', settings.group_link)],
      [Markup.button.url('👤 Save My Contact', settings.contact_link)]
    ]);
    
    await ctx.reply(instruct, { parse_mode: 'HTML', ...links });
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
    `3️⃣ Send a screenshot proof <b>right here in this bot</b>.\n` +
    `4️⃣ Earn <b>₦${settings.reward_amount}</b> for every friend who gets verified!\n\n` +
    `⚖️ <b>Rules:</b>\n` +
    `• One account per person only.\n` +
    `• Min 3 referrals required to cash out.\n` +
    `• Fraud or duplicate accounts = Instant Ban.\n\n` +
    `🔗 <b>Group Link:</b> ${settings.group_link}\n` +
    `👤 <b>Admin Contact:</b> ${settings.contact_link}`;

  ctx.reply(msg, { parse_mode: 'HTML' });
});

// --- ADMIN MENU ACTIONS ---

bot.hears('/admin', (ctx) => ctx.isAdmin && ctx.reply('⚙️ <b>Admin Panel</b>', { parse_mode: 'HTML', ...adminMenu }));
bot.hears('⬅️ Back', (ctx) => ctx.isAdmin && ctx.reply('⚙️ <b>Admin Panel</b>', { parse_mode: 'HTML', ...adminMenu }));
bot.hears('🏠 Home', (ctx) => ctx.reply('🏠 <b>User Menu</b>', { parse_mode: 'HTML', ...mainMenu }));
bot.hears('➕ More Tools', (ctx) => ctx.isAdmin && ctx.reply('🛠 <b>Advanced Tools</b>', { parse_mode: 'HTML', ...adminMoreMenu }));

bot.hears('⚙️ Settings', async (ctx) => {
  if (!ctx.isAdmin) return;
  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();
  return ctx.reply(`⚙️ <b>Bot Settings</b>\n\n💰 Reward: ₦${settings.reward_amount}\n📱 Group: ${settings.group_link}\n👤 Contact: ${settings.contact_link}`, { parse_mode: 'HTML', ...adminMenu });
});

bot.hears('⏳ Verifications', async (ctx) => {
  if (!ctx.isAdmin) return;
  const { data: list } = await supabase.from('users').select('*').eq('is_verified', false).not('whatsapp_number', 'is', null);
  if (!list || list.length === 0) return ctx.reply('No pending verifications.');
  let msg = list.map(u => `👤 ${u.first_name}\nID: <code>${u.telegram_id}</code>\nWA: ${u.whatsapp_number}`).join('\n\n');
  return ctx.reply(`⏳ <b>Verification Queue</b>\n\n${msg}`, { parse_mode: 'HTML' });
});

bot.hears('👥 User Directory', async (ctx) => {
  if (!ctx.isAdmin) return;
  const { data: list } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(20);
  let msg = list.map(u => `${u.is_verified ? '✅' : '⏳'} <b>${u.first_name}</b> (<code>${u.telegram_id}</code>)\nRefs: ${u.total_referrals} | Earned: ₦${u.balance}`).join('\n\n');
  return ctx.reply(`👥 <b>Recent Users</b>\n\n${msg}`, { parse_mode: 'HTML' });
});

bot.hears('💸 Payout Queue', async (ctx) => {
  if (!ctx.isAdmin) return;
  const { data: reqs } = await supabase.from('payout_requests').select('*, users(first_name, whatsapp_number)').eq('status', 'pending');
  if (!reqs || reqs.length === 0) return ctx.reply('No payouts.');
  let msg = reqs.map(r => `ID: <code>${r.id}</code>\nUser: ${r.users.first_name}\nAmt: ₦${r.amount}\nDetails: ${r.bank_details}`).join('\n\n');
  return ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.hears('📥 Download Report', async (ctx) => {
  if (!ctx.isAdmin) return;
  const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  const { data: settings } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
  
  let csv = 'Telegram_ID,First_Name,Username,WhatsApp,Referred_By,Total_Refs,Balance,Verified,Banned,Joined\n';
  users.forEach(u => {
    const bal = (u.total_referrals || 0) * settings.reward_amount;
    csv += `${u.telegram_id},"${u.first_name || ''}","${u.username || ''}","${u.whatsapp_number || ''}",${u.referred_by || ''},${u.total_referrals || 0},${bal},${u.is_verified},${u.is_banned},"${new Date(u.created_at).toLocaleDateString()}"\n`;
  });

  const buffer = Buffer.from(csv, 'utf-8');
  return ctx.replyWithDocument({ source: buffer, filename: `Rancor_User_Report_${new Date().toISOString().split('T')[0]}.csv` });
});

bot.hears('📢 Broadcast', async (ctx) => {
  if (!ctx.isAdmin) return;
  await supabase.from('users').update({ state: 'admin_awaiting_broadcast' }).eq('telegram_id', ctx.from.id);
  ctx.reply('📢 <b>Broadcast System</b>\n\nPlease send the message you want to broadcast to ALL verified users:', { parse_mode: 'HTML', ...Markup.keyboard([['❌ Cancel']]).resize() });
});

// --- ACTION HANDLERS ---

bot.action('cancel_action', async (ctx) => {
  await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', ctx.from.id);
  await ctx.answerCbQuery('Canceled');
  ctx.reply('❌ Action canceled.');
});

bot.on('photo', async (ctx) => {
  const telegram_id = ctx.from.id;
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (user && !user.is_verified) {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    ctx.reply('📩 *Proof Submitted!*\nAn admin will review your screenshot shortly.', { parse_mode: 'Markdown' });

    const envAdminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
    const { data: dbAdmins } = await supabase.from('admins').select('telegram_id');
    const allAdmins = [...envAdminIds, ...(dbAdmins || []).map(a => a.telegram_id)];

    const verifyButtons = Markup.inlineKeyboard([
      [
        Markup.button.callback(`✅ Verify`, `verify_user_${telegram_id}`),
        Markup.button.callback(`❌ Reject`, `reject_user_${telegram_id}`)
      ]
    ]);

    allAdmins.forEach(aid => {
      try {
        ctx.telegram.sendPhoto(aid, photo.file_id, {
          caption: `📸 <b>New Verification Proof</b>\n\nUser: ${ctx.from.first_name}\nID: <code>${telegram_id}</code>\nWA: ${user.whatsapp_number}`,
          parse_mode: 'HTML',
          ...verifyButtons
        });
      } catch (e) {}
    });
  }
});

bot.action(/^verify_user_(\d+)$/, async (ctx) => {
  if (!ctx.isAdmin) return ctx.answerCbQuery('🚫 Unauthorized');
  const uid = parseInt(ctx.match[1]);
  const { data: target } = await supabase.from('users').select('*').eq('telegram_id', uid).single();
  if (target && !target.is_verified) {
    const { data: s } = await supabase.from('settings').select('reward_amount').eq('id', 1).single();
    const { error } = await supabase.rpc('verify_user_and_reward', { u_id: uid, r_id: target.referred_by || null, amt: parseInt(s.reward_amount) });
    if (error) return ctx.answerCbQuery('❌ Error activating user.');
    try { await ctx.telegram.sendMessage(uid, `🎊 <b>Account Verified!</b>\nYou can now start referring.`, { parse_mode: 'HTML', ...mainMenu }); } catch(e) {}
    await ctx.editMessageCaption(`✅ <b>User Verified</b>\nBy: ${ctx.from.first_name}`, { parse_mode: 'HTML' });
    ctx.answerCbQuery('User Activated!');
  }
});

bot.action(/^reject_user_(\d+)$/, async (ctx) => {
  if (!ctx.isAdmin) return ctx.answerCbQuery('🚫 Unauthorized');
  const uid = ctx.match[1];
  const reasons = Markup.inlineKeyboard([
    [Markup.button.callback('🖼 Blurry Photo', `reject_reason_${uid}_photo`)],
    [Markup.button.callback('👥 Not in Group', `reject_reason_${uid}_group`)],
    [Markup.button.callback('👤 Contact Not Saved', `reject_reason_${uid}_contact`)],
    [Markup.button.callback('❌ Cancel', `cancel_action`)]
  ]);
  await ctx.editMessageCaption('❌ <b>Select Rejection Reason:</b>', { parse_mode: 'HTML', ...reasons });
});

bot.action(/^reject_reason_(\d+)_(.+)$/, async (ctx) => {
  if (!ctx.isAdmin) return ctx.answerCbQuery('🚫 Unauthorized');
  const uid = parseInt(ctx.match[1]);
  const reasonCode = ctx.match[2];
  const reasons = { 'photo': 'Blurry/wrong photo.', 'group': 'Not in group.', 'contact': 'Contact not saved.' };
  const reason = reasons[reasonCode] || 'Invalid proof.';
  try { await ctx.telegram.sendMessage(uid, `❌ <b>Rejected:</b> ${reason}\nPlease try again.`, { parse_mode: 'HTML' }); } catch (e) {}
  await ctx.editMessageCaption(`❌ <b>Rejected:</b> ${reason}`, { parse_mode: 'HTML' });
});

// --- TEXT & STATE HANDLER (MUST BE LAST) ---

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const telegram_id = ctx.from.id;
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (!user || allButtons.includes(text) || /Policies/i.test(text)) return;

  // States
  if (user.state === 'awaiting_whatsapp') {
    await supabase.from('users').update({ whatsapp_number: text, state: 'idle' }).eq('telegram_id', telegram_id);
    return ctx.reply('✅ WhatsApp Saved! Now join the group and send proof.', { parse_mode: 'HTML' });
  }

  if (user.state === 'awaiting_bank') {
    await supabase.from('payout_requests').insert({ telegram_id, amount: user.balance, bank_details: text });
    await supabase.from('users').update({ state: 'idle', balance: 0 }).eq('telegram_id', telegram_id);
    return ctx.reply('✅ Request Submitted!', mainMenu);
  }

  if (ctx.isAdmin && user.state.startsWith('admin_awaiting_')) {
    if (text === '❌ Cancel') {
      await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
      return ctx.reply('Canceled.', adminMenu);
    }

    if (user.state === 'admin_awaiting_broadcast') {
      const { data: targets } = await supabase.from('users').select('telegram_id').eq('is_verified', true);
      await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
      
      ctx.reply(`🚀 Starting broadcast to ${targets.length} users...`);
      
      let count = 0;
      for (const t of targets) {
        try {
          await ctx.telegram.sendMessage(t.telegram_id, `📢 <b>ANNOUNCEMENT</b>\n\n${text}`, { parse_mode: 'HTML' });
          count++;
        } catch (e) {}
      }
      return ctx.reply(`✅ <b>Broadcast Complete</b>\nSent to ${count} users.`, { parse_mode: 'HTML', ...adminMenu });
    }

    if (user.state === 'admin_awaiting_reward') {
       await supabase.from('settings').update({ reward_amount: parseInt(text) || 0 }).eq('id', 1);
       await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
       return ctx.reply('✅ Reward Updated.', adminMenu);
    }

    if (user.state === 'admin_awaiting_group_link') {
       await supabase.from('settings').update({ group_link: text }).eq('id', 1);
       await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
       return ctx.reply('✅ Group Link Updated.', adminMenu);
    }

    if (user.state === 'admin_awaiting_contact_link') {
       await supabase.from('settings').update({ contact_link: text }).eq('id', 1);
       await supabase.from('users').update({ state: 'idle' }).eq('telegram_id', telegram_id);
       return ctx.reply('✅ Contact Link Updated.', adminMenu);
    }
  }
});

module.exports = async (req, res) => {
  try { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (err) { res.status(500).send('Error'); }
};
