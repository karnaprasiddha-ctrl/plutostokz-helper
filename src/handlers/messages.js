// src/handlers/messages.js
// Handles legacy `!command` style messages, mirroring the slash commands.

const { config } = require('../config');
const { logger } = require('../utils/logger');
const { isStaff } = require('../utils/permissions');
const store = require('../store');

const shopCmd = require('../commands/shop');
const setupCmd = require('../commands/setup');
const ticketCmd = require('../commands/ticket');
const paymentCmd = require('../commands/payment');
const ordersCmd = require('../commands/orders');
const staffCmd = require('../commands/staff');
const embeds = require('../utils/embeds');

const STAFF_ONLY = new Set(['setup', 'sync', 'approve', 'reject', 'setnpr', 'setpayment', 'addstock', 'orders', 'reload']);

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  if (STAFF_ONLY.has(commandName) && !isStaff(message.member)) {
    return message.reply('❌ You do not have permission to use this command.');
  }

  try {
    switch (commandName) {
      case 'shop': {
        await shopCmd.postShopPanel(message.channel);
        break;
      }
      case 'help': {
        await message.reply({ embeds: [staffCmd.helpEmbed(isStaff(message.member))] });
        break;
      }
      case 'setup': {
        const processing = await message.reply('⏳ Processing...');
        const result = await setupCmd.runSetup(message.guild);
        await processing.edit({ content: null, embeds: [setupCmd.setupSummaryEmbed(result)] });
        break;
      }
      case 'ticket': {
        const channel = await ticketCmd.createSupportTicket(message.guild, message.author);
        await message.reply(`🎫 Your support ticket has been created: ${channel}`);
        break;
      }
      case 'close': {
        const order = store.getOrderByTicketChannelId(message.channel.id);
        const isOwner = order ? order.customerId === message.author.id : message.channel.topic?.includes(message.author.id);
        if (!isStaff(message.member) && !isOwner) {
          return message.reply('❌ Only the ticket owner or staff can close this ticket.');
        }
        await ticketCmd.closeTicket(message.channel);
        break;
      }
      case 'stock': {
        const embed = await ordersCmd.buildStockEmbed();
        await message.reply({ embeds: [embed] });
        break;
      }
      case 'orders': {
        await message.reply({ embeds: [ordersCmd.buildOrdersEmbed()] });
        break;
      }
      case 'sync': {
        const processing = await message.reply('⏳ Processing...');
        const result = await ordersCmd.performSync();
        await processing.edit({ content: null, embeds: [ordersCmd.syncResultEmbed(result)] });
        break;
      }
      case 'reload': {
        const result = await ordersCmd.performSync();
        await message.reply(
          result.ok
            ? `✅ Reloaded. Products: ${result.productCount}, Variants: ${result.variantCount}.`
            : `⚠️ Reload completed with a warning: ${result.error}`
        );
        break;
      }
      case 'setnpr': {
        await paymentCmd.executeSetNprPrefix(message, args);
        break;
      }
      case 'setpayment': {
        await paymentCmd.executeSetPaymentPrefix(message, args);
        break;
      }
      case 'addstock': {
        await ordersCmd.executeAddStockPrefix(message, args);
        break;
      }
      case 'approve': {
        const orderNumber = args[0];
        if (!orderNumber) return message.reply('Usage: `!approve <order_number>`');
        const result = await staffCmd.approveOrder(orderNumber, message.author.id, message.guild);
        if (!result.ok) return message.reply(`❌ ${result.error}`);
        await message.reply({ embeds: [embeds.orderCompletedEmbed(result.order, message.author.id)] });
        break;
      }
      case 'reject': {
        const orderNumber = args[0];
        const reason = args.slice(1).join(' ') || null;
        if (!orderNumber) return message.reply('Usage: `!reject <order_number> [reason]`');
        const result = await staffCmd.rejectOrder(orderNumber, message.author.id, reason, message.guild);
        if (!result.ok) return message.reply(`❌ ${result.error}`);
        await message.reply({ embeds: [embeds.orderRejectedEmbed(result.order, reason)] });
        break;
      }
      default:
        // Unknown prefix command — silently ignore to avoid noise in busy channels.
        break;
    }
  } catch (err) {
    logger.error(`Prefix command "${commandName}" failed`, err);
    await message.reply({ embeds: [embeds.errorEmbed()] }).catch(() => {});
  }
}

module.exports = { handleMessage };
