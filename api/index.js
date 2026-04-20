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

// Admin IDs (from env)
const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

// Helper: Main Menu
const mainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📊 My Stats', 'stats'), Markup.button.callback('💰 Balance', 'balance')],
  [Markup.button.callback('🔗 Referral Link', 'referral'), Markup.button.callback('💸 Redeem', 'redeem')],
  [Markup.button.url('📱 Join WhatsApp', process.env.WHATSAPP_LINK || 'https://t.me')]
]);

// Start Command
bot.start(async (ctx) => {
  const telegram_id = ctx.from.id;
  const username = ctx.from.username || null;
  const first_name = ctx.from.first_name;
  const startPayload = ctx.payload; // For referral tracking

  // Check if user already exists
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();

  if (!user) {
    // New User
    let referredBy = null;
    if (startPayload && !isNaN(startPayload) && parseInt(startPayload) !== telegram_id) {
      referredBy = parseInt(startPayload);
    }

    await supabase.from('users').insert({
      telegram_id,
      username,
      first_name,
      referred_by: referredBy,
      is_verified: false
    });

    return ctx.reply(`Welcome ${first_name} to Rancor Media Leverage! \n\nTo start earning, you MUST join our WhatsApp group and find the secret code pinned there.`, mainMenu());
  }

  return ctx.reply(`Welcome back, ${first_name}!`, mainMenu());
});

// Callback Handlers
bot.action('stats', async (ctx) => {
  const { data: user } = await supabase.from('users').select('total_referrals').eq('telegram_id', ctx.from.id).single();
  // Get list of referrals
  const { data: referrals } = await supabase.from('users').select('first_name, username').eq('referred_by', ctx.from.id).eq('is_verified', true);
  
  let list = referrals.length > 0 
    ? referrals.map(r => `• ${r.first_name} (@${r.username || 'N/A'})`).join('\n')
    : 'No verified referrals yet.';

  await ctx.answerCbQuery();
  ctx.reply(`📊 *Your Stats*\n\nTotal Verified Referrals: ${user.total_referrals}\n\n*Verified Referrals:*\n${list}`, { parse_mode: 'Markdown' });
});

bot.action('balance', async (ctx) => {
  const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
  await ctx.answerCbQuery();
  ctx.reply(`💰 *Current Balance:* ₦${user.balance}`, { parse_mode: 'Markdown' });
});

bot.action('referral', async (ctx) => {
  const botInfo = await ctx.telegram.getMe();
  const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  await ctx.answerCbQuery();
  ctx.reply(`🔗 *Your Referral Link:*\n\n${link}\n\nShare this link to earn! Each verified referral gets you ₦150.`, { parse_mode: 'Markdown' });
});

bot.action('redeem', async (ctx) => {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).single();
  
  if (user.total_referrals < 3) {
    await ctx.answerCbQuery('Minimum 3 referrals required!');
    return ctx.reply('⚠️ You need at least 3 verified referrals to request a payout.');
  }

  await supabase.from('users').update({ state: 'awaiting_bank_details' }).eq('telegram_id', ctx.from.id);
  await ctx.answerCbQuery();
  ctx.reply('🏦 Please enter your Bank Details in this format:\n\n*Bank Name*\n*Account Number*\n*Account Name*', { parse_mode: 'Markdown' });
});

// Message Handler for Verification and Bank Details
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const telegram_id = ctx.from.id;

  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();

  if (!user) return;

  // Handle Bank Details
  if (user.state === 'awaiting_bank_details') {
    await supabase.from('payout_requests').insert({
      telegram_id,
      amount: user.balance,
      bank_details: text
    });
    await supabase.from('users').update({ state: 'idle', balance: 0 }).eq('telegram_id', telegram_id);
    return ctx.reply('✅ Payout request submitted! An admin will review and process it shortly.');
  }

  // Handle Verification Code
  if (!user.is_verified) {
    const { data: settings } = await supabase.from('settings').select('secret_code, reward_amount').eq('id', 1).single();
    if (text.toLowerCase() === settings.secret_code.toLowerCase()) {
      await supabase.from('users').update({ is_verified: true }).eq('telegram_id', telegram_id);
      
      // Credit Referrer
      if (user.referred_by) {
        const { data: referrer } = await supabase.from('users').select('*').eq('telegram_id', user.referred_by).single();
        if (referrer) {
          await supabase.from('users').update({
            balance: referrer.balance + settings.reward_amount,
            total_referrals: referrer.total_referrals + 1
          }).eq('telegram_id', user.referred_by);
          
          // Notify Referrer
          try {
            await ctx.telegram.sendMessage(user.referred_by, `🎉 Your referral ${user.first_name} has been verified! ₦${settings.reward_amount} has been added to your balance.`);
          } catch (e) {}
        }
      }
      
      return ctx.reply('✅ Verification successful! Your account is now active and you can start referring others.');
    }
  }

  // Admin Commands
  if (adminIds.includes(telegram_id)) {
    if (text.startsWith('/setcode ')) {
      const newCode = text.split(' ')[1];
      await supabase.from('settings').update({ secret_code: newCode }).eq('id', 1);
      return ctx.reply(`✅ Secret code updated to: ${newCode}`);
    }
    if (text.startsWith('/setreward ')) {
      const newReward = parseInt(text.split(' ')[1]);
      await supabase.from('settings').update({ reward_amount: newReward }).eq('id', 1);
      return ctx.reply(`✅ Reward amount updated to: ₦${newReward}`);
    }
    if (text === '/payouts') {
      const { data: requests } = await supabase.from('payout_requests').select('*, users(first_name)').eq('status', 'pending');
      if (!requests || requests.length === 0) return ctx.reply('No pending payouts.');
      let list = requests.map(r => `ID: ${r.id}\nUser: ${r.users.first_name}\nAmount: ₦${r.amount}\nDetails: ${r.bank_details}`).join('\n\n');
      return ctx.reply(`📋 *Pending Payouts*\n\n${list}\n\nUse /approve ID to complete.`, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/approve ')) {
      const pid = text.split(' ')[1];
      const { data: request } = await supabase.from('payout_requests').update({ status: 'approved' }).eq('id', pid).select().single();
      if (request) {
        await ctx.telegram.sendMessage(request.telegram_id, '🎊 Your payout request has been approved and processed! Check your bank account.');
        return ctx.reply('✅ Payout marked as approved.');
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
    res.status(500).send('Internal Server Error');
  }
};
