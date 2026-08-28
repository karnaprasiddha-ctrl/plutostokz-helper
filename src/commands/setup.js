// src/commands/setup.js
//
// !setup / (staff only) provisions the entire server structure needed by
// the bot. It is fully idempotent: re-running it will never create
// duplicate channels, it reuses anything that already exists (by stored
// ID first, then by name search as a fallback).

const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const store = require('../store');
const { getResolvedId } = require('../utils/channels');
const embeds = require('../utils/embeds');
const shopCmd = require('./shop');

const PLAN = [
  { key: 'shopCategoryId', kind: 'category', name: '🌌 PLUTOSTOKZ' },
  { key: 'ticketCategoryId', kind: 'category', name: '🎫 TICKETS' },
  { key: 'shopChannelId', kind: 'channel', name: '🛒・shop', categoryKey: 'shopCategoryId' },
  { key: 'supportChannelId', kind: 'channel', name: '🎫・support', categoryKey: 'shopCategoryId' },
  { key: 'ordersChannelId', kind: 'channel', name: '🧾・orders', categoryKey: 'shopCategoryId', staffOnly: true },
  { key: 'logsChannelId', kind: 'channel', name: '📊・logs', categoryKey: 'shopCategoryId', staffOnly: true },
  { key: 'announcementsChannelId', kind: 'channel', name: '📢・announcements', categoryKey: 'shopCategoryId' },
];

async function findExisting(guild, id, kind, name) {
  if (id) {
    try {
      const existing = await guild.channels.fetch(id);
      if (existing && (kind === 'category' ? existing.type === ChannelType.GuildCategory : true)) {
        return existing;
      }
    } catch {
      // stale ID, fall through to name search
    }
  }
  const byName = guild.channels.cache.find(
    (c) => c.name === name && (kind === 'category' ? c.type === ChannelType.GuildCategory : c.type !== ChannelType.GuildCategory)
  );
  return byName || null;
}

function staffOnlyOverwrites(guild) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
  ];
  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
    });
  }
  return overwrites;
}

/** Runs the full idempotent setup. Returns a summary object for logging/reply. */
async function runSetup(guild) {
  const created = [];
  const reused = [];
  const results = {};

  for (const item of PLAN) {
    const currentId = getResolvedId(item.key);
    let channel = await findExisting(guild, currentId, item.kind, item.name);

    if (channel) {
      reused.push(item.name);
    } else {
      const options = { name: item.name, type: item.kind === 'category' ? ChannelType.GuildCategory : ChannelType.GuildText };
      if (item.categoryKey && results[item.categoryKey]) {
        options.parent = results[item.categoryKey].id;
      }
      if (item.staffOnly) {
        options.permissionOverwrites = staffOnlyOverwrites(guild);
      }
      try {
        channel = await guild.channels.create(options);
        created.push(item.name);
      } catch (err) {
        logger.error(`Failed creating channel for ${item.key}`, err);
        continue;
      }
    }

    // If a channel already existed but its category plan expects a parent, move it under it.
    if (item.categoryKey && results[item.categoryKey] && channel.parentId !== results[item.categoryKey].id) {
      try {
        await channel.setParent(results[item.categoryKey].id, { lockPermissions: false });
      } catch (err) {
        logger.warn(`Could not move ${item.name} under its category`, err.message);
      }
    }

    results[item.key] = channel;
  }

  const idMap = {};
  for (const key of Object.keys(results)) idMap[key] = results[key].id;
  store.saveSetup(idMap);

  // Post / refresh the shop panel in the shop channel.
  let panelPosted = false;
  if (results.shopChannelId) {
    try {
      await shopCmd.postShopPanel(results.shopChannelId);
      panelPosted = true;
    } catch (err) {
      logger.error('Failed to post shop panel during setup', err);
    }
  }

  return { created, reused, idMap, panelPosted };
}

function setupSummaryEmbed({ created, reused, panelPosted }) {
  return embeds
    .baseEmbed(config.colors.success)
    .setTitle('✅ SETUP COMPLETE')
    .addFields(
      { name: '🆕 Created', value: created.length ? created.join('\n') : '_none — everything already existed_' },
      { name: '♻️ Reused', value: reused.length ? reused.join('\n') : '_none_' },
      { name: '🛒 Shop Panel', value: panelPosted ? 'Posted ✅' : 'Not posted (channel missing) ⚠️' }
    )
    .setDescription('Tip: copy the IDs below into your `.env` / Render environment so restarts reuse them.');
}

const slashSetup = new SlashCommandBuilder().setName('setup').setDescription('[Staff] Provision the shop server structure.');

module.exports = { runSetup, setupSummaryEmbed, slashSetup };
