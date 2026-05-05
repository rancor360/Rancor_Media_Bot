# Implementation Plan - Fix Payout/Balance Bug

## Objective
Fix the issue where user balances are not cleared/updated correctly after payout approval, and they remain in the payout queue.

## Proposed Solution (The "Right Way")
Shift the source of truth for the user's available funds from a calculated value (`total_referrals * reward_amount`) to the persistent `balance` column in the `users` table.

## Steps

### 1. Research & Analysis
- [ ] Confirm all handlers using `total_referrals * reward_amount`.
- [ ] Verify `verify_user_and_reward` RPC function correctly increments `balance`.

### 2. Implementation
- [ ] **Modify `api/index.js`**:
    - [ ] Update `bot.hears('💰 Balance', ...)` to use `user.balance`.
    - [ ] Update `bot.hears('💸 Redeem', ...)` to check `user.balance` instead of recalculating.
    - [ ] Update `bot.hears('📥 Download Report', ...)` to export the `balance` column directly.
    - [ ] Update `bot.hears('admin_awaiting_approve_id', ...)`:
        - [ ] Change status to `completed`.
        - [ ] (Optional) Add notification to user.
- [ ] **Add Rejection Handler (Refunder)**:
    - [ ] Implement a way for admins to reject payouts and refund the user's balance.

### 3. Verification
- [ ] Create a script `tests/verify_fix.js` to simulate the flow:
    - [ ] User earns rewards (balance increases).
    - [ ] User redeems (balance decreases/clears).
    - [ ] Admin approves (status updates).
    - [ ] Verify balance remains 0 (or deducted amount).

## Success Criteria
- [ ] User's `💰 Balance` shows ₦0 after a successful "Redeem" action.
- [ ] User's `💰 Balance` remains ₦0 after admin approval.
- [ ] Payout disappears from `pending` queue upon approval.
