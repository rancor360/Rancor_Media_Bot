-- --- CONSOLIDATED SUPABASE SETUP (v2.1 - Idempotent & Secure) ---
-- Run this in your Supabase SQL Editor to prepare your database.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    referred_by BIGINT REFERENCES users(telegram_id),
    balance INTEGER DEFAULT 0,
    total_referrals INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    state TEXT DEFAULT 'idle',
    whatsapp_number TEXT,
    last_reminded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Payout Requests Table
CREATE TABLE IF NOT EXISTS payout_requests (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id),
    amount INTEGER NOT NULL,
    bank_details TEXT NOT NULL,
    status TEXT DEFAULT 'pending', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    reward_amount INTEGER DEFAULT 150,
    group_link TEXT DEFAULT 'https://chat.whatsapp.com/example',
    contact_link TEXT DEFAULT 'https://wa.me/example'
);

-- 4. Admins Table (Sub-Admins)
CREATE TABLE IF NOT EXISTS admins (
    telegram_id BIGINT PRIMARY KEY,
    added_by BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. SAFETY MIGRATIONS (Run if columns are missing)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS group_link TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_link TEXT;

-- 6. RPC FUNCTION: Idempotent Verification & Reward
-- This ensures user activation and referral bonus happen exactly once.
DROP FUNCTION IF EXISTS verify_user_and_reward(bigint, bigint, integer);

CREATE OR REPLACE FUNCTION verify_user_and_reward(u_id BIGINT, r_id BIGINT, amt INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    -- 1. Try to activate the user ONLY if they are currently unverified
    UPDATE users SET 
        is_verified = TRUE, 
        state = 'idle' 
    WHERE telegram_id = u_id AND is_verified = FALSE;
    
    -- Capture how many rows were actually changed
    GET DIAGNOSTICS rows_affected = ROW_COUNT;

    -- 2. Only proceed with the reward if we actually performed the verification
    IF rows_affected > 0 THEN
        IF r_id IS NOT NULL THEN
            UPDATE users 
            SET balance = balance + amt, 
                total_referrals = total_referrals + 1 
            WHERE telegram_id = r_id;
        END IF;
        RETURN TRUE; -- Success
    END IF;

    RETURN FALSE; -- Already verified, did nothing
END;
$$ LANGUAGE plpgsql;

-- 7. RPC FUNCTION: Atomic Payout Request
CREATE OR REPLACE FUNCTION create_payout_request(u_id BIGINT, amt INTEGER, bank TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    SELECT balance INTO current_balance FROM users WHERE telegram_id = u_id FOR UPDATE;
    
    IF current_balance < amt OR amt <= 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE users SET balance = balance - amt, state = 'idle' WHERE telegram_id = u_id;
    INSERT INTO payout_requests (telegram_id, amount, bank_details, status)
    VALUES (u_id, amt, bank, 'pending');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 8. INITIAL CONFIGURATION
INSERT INTO settings (id, reward_amount, group_link, contact_link) 
VALUES (1, 150, 'https://chat.whatsapp.com/your-link', 'https://wa.me/your-number')
ON CONFLICT (id) DO NOTHING;
