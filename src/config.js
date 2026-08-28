// src/config.js
// Central place for all environment-derived configuration.
// This module intentionally never logs secret values.

require('dotenv').config();

function bool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',

  sellauthApiKey: process.env.SELLAUTH_API_KEY || '',
  sellauthShopId: process.env.SELLAUTH_SHOP_ID || '',

  prefix: process.env.PREFIX || '!',
  shopName: process.env.SHOP_NAME || 'Plutostokz',
  botName: 'Plutostokz Helper',
  orderPrefix: process.env.ORDER_PREFIX || 'PLUTO',

  staffRoleId: process.env.STAFF_ROLE_ID || '',

  ticketCategoryId: process.env.TICKET_CATEGORY_ID || '',
  shopCategoryId: process.env.SHOP_CATEGORY_ID || '',
  shopChannelId: process.env.SHOP_CHANNEL_ID || '',
  ordersChannelId: process.env.ORDERS_CHANNEL_ID || '',
  logsChannelId: process.env.LOGS_CHANNEL_ID || '',
  supportChannelId: process.env.SUPPORT_CHANNEL_ID || '',
  announcementsChannelId: process.env.ANNOUNCEMENTS_CHANNEL_ID || '',

  port: parseInt(process.env.PORT || '10000', 10),
};

// Colors used consistently across every embed in the project.
config.colors = {
  shop: 0x9b59ff, // purple
  info: 0x3498ff, // blue
  premium: 0x2ee6d0, // cyan
  success: 0x2ecc71, // green
  pending: 0xf1c40f, // gold
  error: 0xe74c3c, // red
  dark: 0x15111f, // premium dark accent
};

config.emojis = {
  shop: '🛒',
  premium: '💎',
  info: 'ℹ️',
  success: '✅',
  pending: '⏳',
  error: '❌',
  ticket: '🎫',
  order: '🧾',
  stock: '📦',
  logs: '📊',
  lock: '🔒',
  review: '🔎',
  npr: '🇳🇵',
  usd: '💵',
};

function validateStartupConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('CLIENT_ID');
  if (!config.sellauthApiKey) missing.push('SELLAUTH_API_KEY');
  if (!config.sellauthShopId) missing.push('SELLAUTH_SHOP_ID');
  return missing;
}

module.exports = { config, validateStartupConfig };
