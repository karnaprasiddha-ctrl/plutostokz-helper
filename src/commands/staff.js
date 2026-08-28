// src/commands/staff.js

const { SlashCommandBuilder } = require('discord.js');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const store = require('../store');
const sellauth = require('../sellauth');
const embeds = require('../utils/embeds');
const { getChannel } = require('../utils/channels');

/**
 * Approve an order. Returns { ok, error?, order? }.
 * Guards against double-approval and missing/invalid orders.
 */
async function approveOrder(orderNumber, staffId, guild) {
  const order = store.getOrder(orderNumber);
  if (!order) return { ok: false, error: `Order \`${orderNumber}\` not found.` };
  if (order.status === 'completed') return { ok: false, error: `Order \`${orderNumber}\` was already approved.` };
  if (order.status === 'rejected') return { ok: false, error: `Order \`${orderNumber}\` was already rejected.` };

  order.status = 'completed';
  order.approvedBy = staffId;
  order.approvedAt = Date.now();
  store.saveOrder(order);

  // Best-effort fulfillment note. SellAuth fulfills USD/Stripe checkouts
  // automatically once paid; for manual NPR orders there is nothing to
  // call in SellAuth, so we just record the approval.
  if (order.currency === 'USD' && order.invoiceId) {
    const status = await sellauth.getInvoiceStatus(order.invoiceId);
    if (!status.ok) {
      logger.warn(`Could not verify SellAuth invoice status for ${orderNumber}`, status.error);
    }
  }

  if (guild) {
    const logsChannel = await getChannel(guild, 'logsChannelId');
    if (logsChannel) {
      await logsChannel
        .send({
          embeds: [
            embeds.logEmbed(
              '✅ ORDER APPROVED',
              [
                { name: 'Order', value: order.orderNumber, inline: true },
                { name: 'Customer', value: `<@${order.customerId}>`, inline: true },
                { name: 'Staff', value: `<@${staffId}>`, inline: true },
              ],
              config.colors.success
            ),
          ],
        })
        .catch((err) => logger.error('Failed to send approval log', err));
    }
  }

  return { ok: true, order };
}

async function rejectOrder(orderNumber, staffId, reason, guild) {
  const order = store.getOrder(orderNumber);
  if (!order) return { ok: false, error: `Order \`${orderNumber}\` not found.` };
  if (order.status === 'completed') return { ok: false, error: `Order \`${orderNumber}\` was already approved.` };
  if (order.status === 'rejected') return { ok: false, error: `Order \`${orderNumber}\` was already rejected.` };

  order.status = 'rejected';
  order.rejectedBy = staffId;
  order.rejectedAt = Date.now();
  order.rejectReason = reason || null;
  store.saveOrder(order);

  if (guild) {
    const logsChannel = await getChannel(guild, 'logsChannelId');
    if (logsChannel) {
      await logsChannel
        .send({
          embeds: [
            embeds.logEmbed(
              '❌ ORDER REJECTED',
              [
                { name: 'Order', value: order.orderNumber, inline: true },
                { name: 'Customer', value: `<@${order.customerId}>`, inline: true },
                { name: 'Staff', value: `<@${staffId}>`, inline: true },
                { name: 'Reason', value: reason || '_not provided_', inline: false },
              ],
              config.colors.error
            ),
          ],
        })
        .catch((err) => logger.error('Failed to send rejection log', err));
    }
  }

  return { ok: true, order };
}

const slashApprove = new SlashCommandBuilder()
  .setName('approve')
  .setDescription('[Staff] Approve a submitted payment.')
  .addStringOption((o) => o.setName('order').setDescription('Order number, e.g. PLUTO-0001').setRequired(true));

const slashReject = new SlashCommandBuilder()
  .setName('reject')
  .setDescription('[Staff] Reject a submitted payment.')
  .addStringOption((o) => o.setName('order').setDescription('Order number, e.g. PLUTO-0001').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason for rejection').setRequired(false));

const slashReload = new SlashCommandBuilder().setName('reload').setDescription('[Staff] Reload product cache & configuration.');
const slashHelp = new SlashCommandBuilder().setName('help').setDescription('Show the Plutostokz Helper command menu.');

function helpEmbed(isStaffMember) {
  const embed = embeds
    .baseEmbed(config.colors.premium)
    .setTitle(`💎 ${config.botName.toUpperCase()} — HELP`)
    .addFields({
      name: '🛍️ Customer Commands',
      value: ['`/shop` — Browse the store', '`/products` — List products', '`/stock` — Live stock levels', '`/ticket` — Open a support ticket', '`/close` — Close your ticket'].join(
        '\n'
      ),
    });

  if (isStaffMember) {
    embed.addFields({
      name: '🛠️ Staff Commands',
      value: [
        '`/setup` — Provision server structure',
        '`/sync` — Re-sync SellAuth products',
        '`/approve` — Approve a payment',
        '`/reject` — Reject a payment',
        '`/setnpr` — Set a custom NPR price',
        '`/setpayment` — Configure NPR payment methods',
        '`/addstock` — Append deliverables',
        '`/orders` — View recent orders',
        '`/reload` — Reload cache & config',
      ].join('\n'),
    });
  }

  return embed;
}

module.exports = {
  approveOrder,
  rejectOrder,
  slashApprove,
  slashReject,
  slashReload,
  slashHelp,
  helpEmbed,
};
