-- Table: users
CREATE TABLE users (
    telegram_id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    referred_by BIGINT REFERENCES users(telegram_id),
    balance INTEGER DEFAULT 0,
    total_referrals INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    state TEXT DEFAULT 'idle',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: payout_requests
CREATE TABLE payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT REFERENCES users(telegram_id),
    amount INTEGER NOT NULL,
    bank_details TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: settings
CREATE TABLE settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    secret_code TEXT NOT NULL DEFAULT 'RANCOR77',
    reward_amount INTEGER DEFAULT 150
);

-- Insert initial settings
INSERT INTO settings (id, secret_code, reward_amount) 
VALUES (1, 'RANCOR77', 150)
ON CONFLICT (id) DO NOTHING;
