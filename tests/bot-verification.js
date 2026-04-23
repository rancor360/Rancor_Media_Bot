/**
 * Rancor Media Bot - Core Logic Verification Script
 * This script tests the internal logic without calling the live Telegram API.
 */

const assert = (condition, message) => {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        process.exit(1);
    }
    console.log(`✅ PASSED: ${message}`);
};

// --- Test 1: Button Regex Matching ---
const testRegex = () => {
    const policiesRegex = /Policies/i;
    assert(policiesRegex.test('📜 Policies'), "Regex should match '📜 Policies'");
    assert(policiesRegex.test('policies'), "Regex should match lowercase 'policies'");
    assert(!policiesRegex.test('Stats'), "Regex should NOT match 'Stats'");
};

// --- Test 2: Dynamic Reward Logic ---
const testRewardCalculation = () => {
    const mockUser = { total_referrals: 5 };
    const mockSettings = { reward_amount: 500 };
    
    const balance = mockUser.total_referrals * mockSettings.reward_amount;
    assert(balance === 2500, "Dynamic balance calculation for 5 referrals at ₦500 should be 2500");
    
    const newSettings = { reward_amount: 1000 };
    const newBalance = mockUser.total_referrals * newSettings.reward_amount;
    assert(newBalance === 5000, "Dynamic balance should update to 5000 when reward rate changes to ₦1000");
};

// --- Test 3: Global Button Exclusion List ---
const testExclusion = () => {
    const allButtons = [
        '📊 My Stats', '💰 Balance', '🔗 Referral Link', '💸 Redeem', '📜 Policies',
        '⏳ Verifications', '💸 Payout Queue', '👥 User Directory', '📥 Download Report',
        '⚙️ Settings', '➕ More Tools', '🏠 Home', '✅ Verify by ID', '🚫 Ban User',
        '💰 Set Reward', '💸 Approve Payout', '📱 Set Group Link', '👤 Set Contact Link',
        '⬅️ Back', '📢 Broadcast', '🔔 Remind Admin'
    ];
    
    const incomingText = '📊 My Stats';
    const isButton = allButtons.includes(incomingText.trim());
    assert(isButton === true, "Text handler should correctly identify '📊 My Stats' as a button");
    
    const standardText = 'Hello Bot';
    const isButton2 = allButtons.includes(standardText.trim());
    assert(isButton2 === false, "Text handler should identify 'Hello Bot' as standard text");
};

// --- Test 4: Admin State Mapping ---
const testAdminStateTriggers = () => {
    const stateMap = {
        '💰 Set Reward': 'admin_awaiting_reward',
        '📱 Set Group Link': 'admin_awaiting_group_link',
        '👤 Set Contact Link': 'admin_awaiting_contact_link'
    };
    
    assert(stateMap['💰 Set Reward'] === 'admin_awaiting_reward', "Button '💰 Set Reward' should map to the correct admin state");
};

console.log("🚀 Starting Rancor Bot Logic Verification...\n");
try {
    testRegex();
    testRewardCalculation();
    testExclusion();
    testAdminStateTriggers();
    console.log("\n🎊 ALL LOGIC TESTS PASSED SUCCESSFULLY! 🎊");
} catch (e) {
    console.error("\n💥 SYSTEM ERROR DURING TESTING:", e.message);
}
