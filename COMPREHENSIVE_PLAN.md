# Rancor Media Bot — Comprehensive Operational Plan

## 1. Explicit User Onboarding Flow
To ensure users follow every step exactly, the bot will use a sequential, explicit guidance system:

**Step-by-Step Registration:**
1.  **Phase A (WhatsApp Number):** User registers by providing their WhatsApp number.
2.  **Phase B (Group & Contact):** 
    - The bot explicitly sends: "Step 2: Click [Join Group](URL) to join our community."
    - Then, a second message: "Step 3: Click [Save My Contact](URL) to save my official contact number to your phone. *Crucial:* Once saved, send a screenshot of you saving my contact to me on WhatsApp."
3.  **Phase C (Admin Verification):** The bot explicitly tells the user: "Step 4: Once you've sent the screenshot to me on WhatsApp, please wait. An admin will manually verify your registration and activate your account."

## 2. Comprehensive Admin Dashboard (`/admin`)
An expanded suite of admin tools for complete control:

- **`/listusers`**: Displays all users in a clean, summarized list.
    - Format: `👤 Name | Status | Referrals | Earnings`
- **`/verify <user_id>`**: Manually activates a user account (triggers rewards/notifications).
- **`/unverified`**: Shows only users who have registered but are awaiting verification.
- **`/setlink <type> <url>`**: 
    - Usage: `/setlink group <url>` or `/setlink contact <url>`
- **`/payouts`**: Shows pending payouts with full user details (Name, WA Number, Bank Details).
- **`/ban <id>` / `/unban <id>`**: Security management.

## 3. Fraud Prevention & Data Management
- **Duplicate Bank Tracking:** Bot automatically checks if bank details are already in the system and alerts admins.
- **Verification List:** Admin command `/unverified` acts as a "To-Do" list for you.

## 4. Implementation Steps
1.  **Database Updates**: Run SQL `ALTER TABLE` to add `contact_link` and modify settings.
2.  **Logic Update (`api/index.js`)**:
    - Update `/start` to send the new, explicit 3-step instructions.
    - Implement `/listusers` command with status filtering.
    - Update `/setlink` to support `group` vs `contact` types.
    - Ensure all admin lists (payouts/unverified) show the WhatsApp number.
3.  **Commit & Push**: Deploy the final comprehensive suite to GitHub.

---

### Verification Request
Does this explicit, 3-step registration flow and the expanded admin dashboard meet your exact requirements? 
- [ ] Explicit instructions for joining group, saving contact, and sending screenshot.
- [ ] Comprehensive admin list for all users (status, referrals, earnings).
- [ ] Admin control to edit both group and contact links.

**Please verify this plan, and I will implement the changes immediately.**
