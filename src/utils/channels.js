// src/utils/channels.js
// Resolves channel/category IDs by checking persisted setup data first
// (created by !setup at runtime) and falling back to environment variables.

const { config } = require('../config');
const store = require('../store');

const KEYS = [
  'ticketCategoryId',
  'shopCategoryId',
  'shopChannelId',
  'ordersChannelId',
  'logsChannelId',
  'supportChannelId',
  'announcementsChannelId',
];

function getResolvedIds() {
  const setup = store.getSetup();
  const resolved = {};
  for (const key of KEYS) {
    resolved[key] = setup[key] || config[key] || null;
  }
  return resolved;
}

function getResolvedId(key) {
  const setup = store.getSetup();
  return setup[key] || config[key] || null;
}

async function getChannel(guild, key) {
  const id = getResolvedId(key);
  if (!id) return null;
  try {
    return await guild.channels.fetch(id);
  } catch {
    return null;
  }
}

module.exports = { getResolvedIds, getResolvedId, getChannel, KEYS };
