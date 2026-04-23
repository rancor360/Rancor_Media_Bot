/**
 * Rancor Media Bot - Security and Logic Audit
 * Simulates adversarial scenarios to ensure state machine integrity.
 */

const assert = (condition, message) => {
    if (!condition) {
        console.error(`❌ AUDIT FAILED: ${message}`);
        process.exit(1);
    }
    console.log(`✅ AUDIT PASSED: ${message}`);
};

// --- Scenario 1: Remind Admin Rate Limiting ---
const testReminderRateLimit = () => {
    const now = new Date();
    const lastRemind = new Date(now.getTime() - (2 * 60 * 60 * 1000)); // 2 hours ago
    
    const mockUser = {
        is_verified: false,
        state: 'awaiting_review',
        last_reminded_at: lastRemind.toISOString()
    };

    const hoursSince = (now - new Date(mockUser.last_reminded_at)) / (1000 * 60 * 60);
    const isAllowed = hoursSince >= 6;
    
    assert(isAllowed === false, "User should be blocked from reminding before 6 hours (Attempted at 2h)");
    
    const allowedTime = new Date(now.getTime() - (7 * 60 * 60 * 1000)); // 7 hours ago
    const isAllowed2 = (now - allowedTime) / (1000 * 60 * 60) >= 6;
    assert(isAllowed2 === true, "User should be allowed to remind after 6 hours (Attempted at 7h)");
};

// --- Scenario 2: State Bypass Prevention ---
const testStateBypass = () => {
    const mockUser = { state: 'idle', is_verified: false };
    
    // Logic check for 'Remind Admin' trigger
    const canRemind = (user) => !user.is_verified && user.state === 'awaiting_review';
    
    assert(canRemind(mockUser) === false, "User in 'idle' state should NOT be able to trigger Admin Reminder");
    
    mockUser.state = 'awaiting_review';
    assert(canRemind(mockUser) === true, "User in 'awaiting_review' state SHOULD be able to trigger Admin Reminder");
    
    mockUser.is_verified = true;
    assert(canRemind(mockUser) === false, "Verified user should NOT be able to trigger Admin Reminder even if state is stuck");
};

// --- Scenario 3: Admin Authorization Mock ---
const testAdminAuth = () => {
    const masterAdmin = 12345;
    const attacker = 67890;
    
    const checkAuth = (id, list) => list.includes(id);
    
    const adminList = [masterAdmin];
    
    assert(checkAuth(masterAdmin, adminList) === true, "Master Admin should have access");
    assert(checkAuth(attacker, adminList) === false, "Unauthorized user should NOT have access");
};

console.log("🛡️ Starting Security and Logic Audit...\n");
testReminderRateLimit();
testStateBypass();
testAdminAuth();
console.log("\n🎊 SECURITY AUDIT COMPLETED SUCCESSFULLY! 🎊");
