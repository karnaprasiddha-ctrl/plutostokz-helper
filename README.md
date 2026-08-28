# 🌌 Plutostokz Helper

A polished, premium Discord commerce/support bot for digital-product shops, backed by [SellAuth](https://sellauth.com).

---

## ✨ Features

- Dynamic product shop synced live from SellAuth (never hard-coded)
- One-command server setup (`!setup` / `/setup`) — idempotent, never duplicates channels
- Private per-order ticket system with a full payment workflow
- USD checkout via SellAuth, manual NPR payment (Khalti / eSewa) with staff approval
- Staff approval/rejection flow with duplicate-protection
- Stock levels, order history, product sync, and stock top-ups
- Health check endpoint for Render Web Services
- Consistent, vibrant embed branding throughout

---

## 🚀 Quick Start

```bash
npm install
cp .env.example .env   # then fill in your values
npm start
```

You should see:

```
🌌 Plutostokz Helper is starting...
✅ Discord connected
✅ Commands registered
✅ SellAuth connected
✅ Products synchronized: N
✨ Plutostokz Helper is online
```

---

## 🔑 Environment Variables

See `.env.example` for the full list. Required to start:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your bot's token from the Discord Developer Portal |
| `CLIENT_ID` | Your application's client ID |
| `SELLAUTH_API_KEY` | SellAuth API key (dashboard → API) |
| `SELLAUTH_SHOP_ID` | Your numeric SellAuth shop ID |

Optional but recommended:

- `GUILD_ID` — if set, slash commands register instantly to that server (guild commands). If omitted, commands register globally, which can take up to an hour to propagate.
- `STAFF_ROLE_ID` — role treated as staff. Server administrators always count as staff regardless of this setting.
- Channel/category IDs — leave blank on first run. `!setup` creates everything and stores the IDs in `data/setup.json`. For persistence across redeploys (see below), copy the printed IDs into your environment variables too.

---

## 🔌 Discord Developer Portal Setup

**Privileged Gateway Intents** (Bot → Privileged Gateway Intents):
- ✅ Message Content Intent (required — prefix commands read message content)
- ✅ Server Members Intent (used for reliable staff-role checks)

**Bot Permissions** (minimum, for the invite link):
- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Manage Channels (required for `!setup` and ticket creation/deletion)
- Manage Roles (only needed if you want the bot to manage permission overwrites beyond its own created channels)
- Use Slash Commands

Recommended invite scope: `bot applications.commands`

---

## 🛒 Command Overview

**Customers:** `/shop` `/products` `/stock` `/ticket` `/close`
(and `!shop` `!stock` `!ticket` `!close`)

**Staff:** `/setup` `/sync` `/reload` `/approve` `/reject` `/setnpr` `/setpayment` `/addstock` `/orders`
(and `!setup` `!sync` `!reload` `!approve` `!reject` `!setnpr` `!setpayment` `!addstock` `!orders`)

Staff-only commands are enforced server-side — a customer running them (slash or prefix) receives a permission error, and they aren't shown as staff options in `/help` for non-staff members.

---

## 🗃️ Data & Persistence

Orders, NPR pricing, payment settings, and channel IDs are stored as JSON files in `./data`.

**⚠️ Render filesystem note:** Render Web Services use an *ephemeral* filesystem by default — anything written to disk is wiped on redeploy and most restarts. For real persistence:

1. Attach a [Render Disk](https://render.com/docs/disks) to this service and set `DATA_DIR` to its mount path (e.g. `/var/data`), **or**
2. Swap `src/store.js` for a real database client (Postgres, Redis, etc). Every other file in the project calls only the functions exported from `store.js`, so that's the only file you need to change.

---

## 🌐 Deploying to Render

1. Push this repo to GitHub.
2. Create a new **Web Service** on Render, pointing at the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all environment variables from `.env.example` in the Render dashboard.
6. (Optional but recommended) Attach a Render Disk for `./data` persistence — see above.

Render pings your service over HTTP, so the built-in `/health` endpoint (served alongside the Discord bot) keeps the service marked healthy.

---

## 🧩 Project Structure

```
plutostokz-helper/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── index.js            # entry point: Discord client + HTTP server
│   ├── config.js           # environment/config loader
│   ├── store.js            # JSON persistence layer
│   ├── sellauth.js         # SellAuth API client
│   ├── commands/
│   │   ├── shop.js
│   │   ├── setup.js
│   │   ├── ticket.js
│   │   ├── payment.js
│   │   ├── orders.js
│   │   └── staff.js
│   ├── handlers/
│   │   ├── interactions.js # buttons / selects / modals / slash routing
│   │   ├── messages.js     # !prefix command routing
│   │   └── errors.js       # global process error safety net
│   └── utils/
│       ├── embeds.js
│       ├── permissions.js
│       ├── channels.js
│       └── logger.js
└── data/                   # JSON persistence (gitignored)
```

---

## 🛡️ Security Notes

- `DISCORD_TOKEN` and `SELLAUTH_API_KEY` are read only from environment variables and are never logged (the logger actively scrubs these patterns) or sent to Discord.
- All staff commands verify permissions server-side before doing anything.
- Approvals/rejections are guarded against double-processing.
- All customer-facing errors are generic and reference an order number for staff follow-up; technical details are logged privately, never shown to customers.
