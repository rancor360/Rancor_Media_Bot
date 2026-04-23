-- Add last_reminded_at to track pings
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMP WITH TIME ZONE;

-- Update RPC to handle state reset atomically
CREATE OR REPLACE FUNCTION verify_user_and_reward(u_id BIGINT, r_id BIGINT, amt INTEGER)
RETURNS void AS $$
BEGIN
    -- 1. Activate the user and reset state
    UPDATE users SET 
        is_verified = TRUE, 
        state = 'idle' 
    WHERE telegram_id = u_id;
    
    -- 2. If there is a referrer, give them the bonus
    IF r_id IS NOT NULL THEN
        UPDATE users 
        SET balance = balance + amt, 
            total_referrals = total_referrals + 1 
        WHERE telegram_id = r_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
