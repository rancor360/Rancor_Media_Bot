-- --- CONSOLIDATED SUPABASE SETUP ---
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Payout Requests Table
-- Note: Using SERIAL for ID makes it easier for admins to type IDs on mobile.
CREATE TABLE IF NOT EXISTS payout_requests (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id),
    amount INTEGER NOT NULL,
    bank_details TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    reward_amount INTEGER DEFAULT 150,
    group_link TEXT DEFAULT 'https://chat.whatsapp.com/example',
    contact_link TEXT DEFAULT 'https://wa.me/example'
);

-- 4. Initial Configuration
INSERT INTO settings (id, reward_amount, group_link, contact_link) 
VALUES (1, 150, 'https://chat.whatsapp.com/your-link', 'https://wa.me/your-number')
ON CONFLICT (id) DO NOTHING;

-- 5. Safety Migrations (if tables already exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS group_link TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_link TEXT;
