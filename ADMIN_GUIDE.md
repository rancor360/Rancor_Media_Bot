# Rancor Media Bot — Admin Operational Guide

This guide explains how to manage your referral bot directly from Telegram.

## 1. Accessing the Admin Panel
Only Telegram IDs listed in the `ADMIN_IDS` environment variable on Vercel can use these commands.
*   **Command:** `/admin`
*   **Result:** Displays a summary of all available admin commands.

## 2. Managing the Referral Program
You can change the core settings of the program at any time:

*   **Change Secret Code:** `/setcode <new_code>`
    *   *Example:* `/setcode RANCOR2024`
    *   *Usage:* Updates the code users must find in WhatsApp to verify their account.
*   **Change Reward Amount:** `/setreward <amount>`
    *   *Example:* `/setreward 200`
    *   *Usage:* Changes how much a user earns per verified referral (in Naira).
*   **Update WhatsApp Link:** `/setlink <url>`
    *   *Example:* `/setlink https://chat.whatsapp.com/new-link`
    *   *Usage:* Updates the "Join WhatsApp" button link for all users.

## 3. Handling Payouts (The Payout Cycle)
1.  **View Requests:** Type `/payouts`.
2.  **Review Details:** The bot will show the User's Name, WhatsApp Number, Amount, and Bank Details.
3.  **Approve:** Copy the unique ID provided for that request and type: `/approve <ID>`.
    *   *Action:* This marks the request as "approved" in the database and sends a success notification to the user.

## 4. Security & Fraud Control
The bot has built-in features to help you spot cheaters:

*   **Duplicate Bank Alert:** If a user submits bank details that have *already been used* by another Telegram account, the bot will send a **🚨 FRAUD ALERT** message to all admins.
*   **Banning Users:** If you catch a cheater, copy their Telegram ID and type:
    *   `/ban <user_id>`
    *   *Result:* The user is immediately blocked from all bot functions and told they are suspended.
*   **Unbanning:** If you made a mistake, type `/unban <user_id>`.

## 5. Adding New Admins
To add another person as an admin:
1.  Get their Telegram ID (via @userinfobot).
2.  Go to **Vercel Settings > Environment Variables**.
3.  Edit `ADMIN_IDS` and add their ID after a comma (no spaces).
    *   *Example:* `8204006525,123456789`
4.  **Redeploy** the project for changes to take effect.
