# Rancor Media Bot - Project Identity & Instructions

## Core Mandates
- **Identity:** This is the Rancor Media Referral Bot. It manages user registrations, referrals, and payouts via Telegram, with verification happening through WhatsApp.
- **Security:** NEVER compromise the `/admin` commands. Admin checks MUST always verify the user's ID against the `ADMIN_IDS` environment variable.
- **Persistence:** Use Supabase for all data. Any schema changes MUST be documented in `SUPABASE_SETUP.sql` or new migration files.
- **Onboarding Flow:** Maintain the sequential onboarding flow (WhatsApp number -> Group/Contact Save -> Admin Verification).

## Tech Stack
- **Framework:** [Telegraf.js](https://telegraf.js.org/) for Telegram bot logic.
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL).
- **Deployment:** Vercel (Serverless Functions).

## Directory Structure
- `api/index.js`: Main entry point and bot logic.
- `SUPABASE_SETUP.sql`: Database schema and initial setup.
- `COMPREHENSIVE_PLAN.md`: The roadmap for feature implementation.
- `ADMIN_GUIDE.md`: Operational instructions for the bot admins.
- `VERIFIED_FIXES.md`: History of resolved bugs and structural changes.
- `tests/`: Directory containing verification and security audit scripts.

## Workflows
- **Code Changes:** Before modifying `api/index.js`, ensure you understand the existing middleware and command structures.
- **Database Changes:** If you add columns or tables, update the SQL setup files in the root.
- **Testing:** Since this runs on Vercel, be mindful of serverless execution limits and environment variable dependencies.

## Key Environment Variables
- `BOT_TOKEN`: Telegram Bot API Token.
- `SUPABASE_URL` / `SUPABASE_KEY`: Supabase connection details.
- `ADMIN_IDS`: Comma-separated list of Telegram IDs with admin privileges.
- `WHATSAPP_GROUP_LINK` / `CONTACT_SAVE_LINK`: Used in onboarding.
