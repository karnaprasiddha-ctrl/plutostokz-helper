// src/handlers/interactions.js
//
// Routes every button / select menu / modal / slash command interaction.
// All interaction handling funnels through here so custom IDs, staff
// checks, and error handling stay consistent in one place.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { config } = require('../config');
const { logger } = require('../utils/logger');
const { isStaff } = require('../utils/permissions');
const { getChannel } = require('../utils/channels');
const store = require('../store');
const sellauth = require('../sellauth');
const embeds = require('../utils/embeds');

const shopCmd = require('../commands/shop');
const setupCmd = require('../commands/setup');
const ticketCmd = require('../commands/ticket');
const paymentCmd = require('../commands/payment');
const ordersCmd = require('../commands/orders');
const staffCmd = require('../commands/staff');

const SLASH_HANDLERS = {
  shop: shopCmd.executeShopSlash,
  products: shopCmd.executeProductsSlash,
  setup: async (interaction) => handleSetupSlash(interaction),
  ticket: async (interaction) => handleTicketSlash(interaction),
  close: async (interaction) => handleCloseSlash(interaction),
  setpayment: paymentCmd.executeSetPaymentSlash,
  setnpr: paymentCmd.executeSetNprSlash,
  stock: ordersCmd.executeStockSlash,
  orders: ordersCmd.executeOrdersSlash,
  sync: ordersCmd.executeSyncSlash,
  addstock: ordersCmd.executeAddStockSlash,
  approve: async (interaction) => handleApproveSlash(interaction),
  reject: async (interaction) => handleRejectSlash(interaction),
  reload: async (interaction) => handleReloadSlash(interaction),
  help: async (interaction) => {
    await interaction.reply({ embeds: [staffCmd.helpEmbed(isStaff(interaction.member))], ephemeral: true });
  },
};

const STAFF_ONLY_COMMANDS = new Set(['setup', 'sync', 'approve', 'reject', 'setnpr', 'setpayment', 'addstock', 'orders', 'reload']);

async function handleSlashCommand(interaction) {
  const name = interaction.commandName;
  const handler = SLASH_HANDLERS[name];
  if (!handler) {
    return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
  }

  if (STAFF_ONLY_COMMANDS.has(name) && !isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
  }

  try {
    await handler(interaction);
  } catch (err) {
    await safeErrorReply(interaction, err, `slash:${name}`);
  }
}

async function handleSetupSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const result = await setupCmd.runSetup(interaction.guild);
  await interaction.editReply({ embeds: [setupCmd.setupSummaryEmbed(result)] });
}

async function handleTicketSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = await ticketCmd.createSupportTicket(interaction.guild, interaction.user);
  await interaction.editReply({ content: `🎫 Your support ticket has been created: ${channel}` });
}

async function handleCloseSlash(interaction) {
  const channel = interaction.channel;
  const order = store.getOrderByTicketChannelId(channel.id);
  const isOwner = order ? order.customerId === interaction.user.id : channel.topic?.includes(interaction.user.id);
  if (!isStaff(interaction.member) && !isOwner) {
    return interaction.reply({ content: '❌ Only the ticket owner or staff can close this ticket.', ephemeral: true });
  }
  await ticketCmd.closeTicket(channel, interaction);
}

async function handleApproveSlash(interaction) {
  const orderNumber = interaction.options.getString('order', true);
  await interaction.deferReply({ ephemeral: true });
  const result = await staffCmd.approveOrder(orderNumber, interaction.user.id, interaction.guild);
  if (!result.ok) return interaction.editReply({ content: `❌ ${result.error}` });
  await interaction.editReply({ content: `✅ Order ${orderNumber} approved.` });
  await finalizeApprovedOrder(interaction.guild, result.order, interaction.user.id);
}

async function handleRejectSlash(interaction) {
  const orderNumber = interaction.options.getString('order', true);
  const reason = interaction.options.getString('reason') || null;
  await interaction.deferReply({ ephemeral: true });
  const result = await staffCmd.rejectOrder(orderNumber, interaction.user.id, reason, interaction.guild);
  if (!result.ok) return interaction.editReply({ content: `❌ ${result.error}` });
  await interaction.editReply({ content: `❌ Order ${orderNumber} rejected.` });
  await finalizeRejectedOrder(interaction.guild, result.order, reason);
}

async function handleReloadSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const result = await ordersCmd.performSync();
  await interaction.editReply({
    content: result.ok
      ? `✅ Reloaded. Products: ${result.productCount}, Variants: ${result.variantCount}. Configuration & payment settings re-read from disk.`
      : `⚠️ Reload completed with a warning: ${result.error}`,
  });
}

// ---------- Shared post-decision actions ----------

async function finalizeApprovedOrder(guild, order, staffId) {
  const channel = order.ticketChannelId ? await guild.channels.fetch(order.ticketChannelId).catch(() => null) : null;
  if (channel) {
    await channel.send({ content: `<@${order.customerId}>`, embeds: [embeds.orderCompletedEmbed(order, staffId)] }).catch(() => {});
  }
  const ordersChannel = await getChannel(guild, 'ordersChannelId');
  if (ordersChannel) {
    await ordersChannel
      .send({
        embeds: [
          embeds.logEmbed(
            '💎 ORDER FULFILLED',
            [
              { name: 'Order', value: order.orderNumber, inline: true },
              { name: 'Customer', value: `<@${order.customerId}>`, inline: true },
              { name: 'Total', value: order.currency === 'NPR' ? `NPR ${order.total}` : `$${order.total}`, inline: true },
            ],
            config.colors.success
          ),
        ],
      })
      .catch(() => {});
  }
}

async function finalizeRejectedOrder(guild, order, reason) {
  if (!order.ticketChannelId || !guild) return;
  try {
    const channel = await guild.channels.fetch(order.ticketChannelId).catch(() => null);
    if (channel) {
      await channel.send({ content: `<@${order.customerId}>`, embeds: [embeds.orderRejectedEmbed(order, reason)] });
    }
  } catch (err) {
    logger.error('Failed to notify ticket about rejection', err);
  }
}

// ---------- Buttons ----------

async function handleButton(interaction) {
  const id = interaction.customId;
  try {
    if (id === 'shop_refresh') return void (await shopCmd.executeShopSlash(interaction));
    if (id === 'shop_open_support') {
      await interaction.deferReply({ ephemeral: true });
      const channel = await ticketCmd.createSupportTicket(interaction.guild, interaction.user);
      return void (await interaction.editReply({ content: `🎫 Ticket created: ${channel}` }));
    }
    if (id.startsWith('shop_buy_')) return void (await handleBuyButton(interaction, id));
    if (id.startsWith('pay_npr_method_')) return void (await handleNprMethodButton(interaction, id));
    if (id.startsWith('pay_npr_')) return void (await handleNprPaymentButton(interaction, id));
    if (id.startsWith('pay_usd_')) return void (await handleUsdPaymentButton(interaction, id));
    if (id.startsWith('paid_confirm_')) return void (await handlePaidConfirmButton(interaction, id));
    if (id.startsWith('order_approve_')) return void (await handleOrderApproveButton(interaction, id));
    if (id.startsWith('order_reject_')) return void (await handleOrderRejectButton(interaction, id));
    if (id.startsWith('ticket_close_support_')) return void (await handleSupportCloseButton(interaction, id));
    if (id.startsWith('ticket_close_')) return void (await handleTicketCloseButton(interaction, id));

    await interaction.reply({ content: '❌ This button is no longer valid.', ephemeral: true });
  } catch (err) {
    await safeErrorReply(interaction, err, `button:${id}`);
  }
}

async function handleBuyButton(interaction, id) {
  // shop_buy_{productId}_{variantId}
  const [, , productId, variantId] = id.split('_');
  const modal = new ModalBuilder()
    .setCustomId(`quantity_modal_${productId}_${variantId}`)
    .setTitle('🛒 Enter Quantity');

  const input = new TextInputBuilder()
    .setCustomId('quantity_input')
    .setLabel('How many would you like?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('1')
    .setRequired(true)
    .setMaxLength(4);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleNprPaymentButton(interaction, id) {
  // pay_npr_{orderNumber}
  const orderNumber = id.replace('pay_npr_', '');
  const order = store.getOrder(orderNumber);
  if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });

  const settings = store.getPaymentSettings();
  const row = new ActionRowBuilder();
  if (settings.khalti?.enabled) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`pay_npr_method_khalti_${orderNumber}`).setLabel('Khalti').setEmoji('🟣').setStyle(ButtonStyle.Primary)
    );
  }
  if (settings.esewa?.enabled) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`pay_npr_method_esewa_${orderNumber}`).setLabel('eSewa').setEmoji('🟢').setStyle(ButtonStyle.Success)
    );
  }
  if (!row.components.length) {
    return interaction.reply({ content: '⚠️ No NPR payment methods are currently enabled. Please contact staff.', ephemeral: true });
  }

  await interaction.reply({ embeds: [embeds.paymentMethodPickerEmbed(order)], components: [row], ephemeral: true });
}

async function handleNprMethodButton(interaction, id) {
  // pay_npr_method_{method}_{orderNumber}
  const rest = id.replace('pay_npr_method_', '');
  const [method, orderNumber] = rest.split(/_(.+)/); // split on first underscore
  const order = store.getOrder(orderNumber);
  if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });

  order.paymentMethod = method;
  store.saveOrder(order);

  const settings = store.getPaymentSettings()[method] || {};
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paid_confirm_${orderNumber}`).setLabel("I've Paid").setEmoji('✅').setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ embeds: [embeds.nprInstructionsEmbed(order, method, settings)], components: [row] });
}

async function handleUsdPaymentButton(interaction, id) {
  const orderNumber = id.replace('pay_usd_', '');
  const order = store.getOrder(orderNumber);
  if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });

  await interaction.deferReply();
  const result = await sellauth.createCheckout({
    productId: order.productId,
    variantId: order.variantId,
    quantity: order.quantity,
  });

  if (!result.ok) {
    return interaction.editReply({ embeds: [embeds.errorEmbed(order.orderNumber)] });
  }

  order.currency = 'USD';
  order.invoiceId = result.data.invoiceId;
  order.invoiceUrl = result.data.invoiceUrl;
  order.paymentMethod = 'usd_sellauth';
  store.saveOrder(order);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Pay with SellAuth').setEmoji('💵').setStyle(ButtonStyle.Link).setURL(result.data.invoiceUrl)
  );

  await interaction.editReply({
    embeds: [
      embeds
        .baseEmbed(config.colors.pending)
        .setTitle('💵 USD PAYMENT')
        .setDescription(`**Order:** ${order.orderNumber}\n\nClick below to complete secure checkout via SellAuth.`),
    ],
    components: [row],
  });
}

async function handlePaidConfirmButton(interaction, id) {
  const orderNumber = id.replace('paid_confirm_', '');
  const order = store.getOrder(orderNumber);
  if (!order) return interaction.reply({ content: '❌ Order not found.', ephemeral: true });

  order.status = 'under_review';
  store.saveOrder(order);

  const staffMention = config.staffRoleId ? `<@&${config.staffRoleId}>` : 'Staff';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`order_approve_${orderNumber}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`order_reject_${orderNumber}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    content: staffMention,
    embeds: [embeds.paymentSubmittedEmbed(order, order.paymentMethod)],
    components: [row],
  });
}

async function handleOrderApproveButton(interaction, id) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ You do not have permission to approve orders.', ephemeral: true });
  }
  const orderNumber = id.replace('order_approve_', '');
  await interaction.deferUpdate();
  const result = await staffCmd.approveOrder(orderNumber, interaction.user.id, interaction.guild);
  if (!result.ok) {
    return interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
  }
  await interaction.editReply({ components: [] }).catch(() => {});
  await interaction.followUp({ embeds: [embeds.orderCompletedEmbed(result.order, interaction.user.id)] });
  await finalizeApprovedOrder(interaction.guild, result.order, interaction.user.id);
}

async function handleOrderRejectButton(interaction, id) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ You do not have permission to reject orders.', ephemeral: true });
  }
  const orderNumber = id.replace('order_reject_', '');
  await interaction.deferUpdate();
  const result = await staffCmd.rejectOrder(orderNumber, interaction.user.id, null, interaction.guild);
  if (!result.ok) {
    return interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
  }
  await interaction.editReply({ components: [] }).catch(() => {});
  await interaction.followUp({ embeds: [embeds.orderRejectedEmbed(result.order, null)] });
}

async function handleTicketCloseButton(interaction, id) {
  const orderNumber = id.replace('ticket_close_', '');
  const order = store.getOrder(orderNumber);
  const isOwner = order && order.customerId === interaction.user.id;
  if (!isStaff(interaction.member) && !isOwner) {
    return interaction.reply({ content: '❌ Only the ticket owner or staff can close this ticket.', ephemeral: true });
  }
  await ticketCmd.closeTicket(interaction.channel, interaction);
}

async function handleSupportCloseButton(interaction, id) {
  const channelId = id.replace('ticket_close_support_', '');
  if (channelId !== interaction.channel.id && channelId !== 'pending') {
    // Stale ID edge case — still allow staff/owner via topic check below.
  }
  const isOwner = interaction.channel.topic?.includes(interaction.user.tag) || interaction.channel.topic?.includes(interaction.user.id);
  if (!isStaff(interaction.member) && !isOwner) {
    return interaction.reply({ content: '❌ Only the ticket owner or staff can close this ticket.', ephemeral: true });
  }
  await ticketCmd.closeTicket(interaction.channel, interaction);
}

// ---------- Select menus ----------

async function handleSelectMenu(interaction) {
  try {
    if (interaction.customId === 'shop_select_product') {
      await interaction.deferReply({ ephemeral: true });
      const productId = interaction.values[0];
      const reply = await shopCmd.buildProductSelectionReply(productId);
      await interaction.editReply(reply);
      return;
    }
    await interaction.reply({ content: '❌ Unknown selection.', ephemeral: true });
  } catch (err) {
    await safeErrorReply(interaction, err, `select:${interaction.customId}`);
  }
}

// ---------- Modals ----------

async function handleModalSubmit(interaction) {
  try {
    if (interaction.customId.startsWith('quantity_modal_')) {
      return void (await handleQuantityModal(interaction));
    }
    await interaction.reply({ content: '❌ Unknown form.', ephemeral: true });
  } catch (err) {
    await safeErrorReply(interaction, err, `modal:${interaction.customId}`);
  }
}

async function handleQuantityModal(interaction) {
  const [, , productId, variantId] = interaction.customId.split('_');
  const raw = interaction.fields.getTextInputValue('quantity_input');
  const quantity = parseInt(raw, 10);

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
    return interaction.reply({ content: '❌ Please enter a valid quantity (1-999).', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const { ok, data: product, error } = await sellauth.fetchProductById(productId);
  if (!ok || !product) {
    return interaction.editReply({ content: `❌ ${error || 'Product no longer available.'}` });
  }

  const variant = Array.isArray(product.variants) ? product.variants.find((v) => String(v.id) === String(variantId)) : null;
  const stock = variant?.stock ?? product.stock ?? null;

  if (stock !== null && stock !== undefined && stock < quantity) {
    return interaction.editReply({ content: `❌ Only **${stock}** in stock — please choose a lower quantity.` });
  }

  const unitPrice = variant?.price ?? product.price ?? 0;
  const nprUnitPrice = store.getNprPrice(productId, variantId || 'base');
  const totalUsd = Number((unitPrice * quantity).toFixed(2));
  const totalNpr = nprUnitPrice ? Number((nprUnitPrice * quantity).toFixed(2)) : null;

  const orderNumber = store.nextOrderNumber(config.orderPrefix);
  const order = {
    orderNumber,
    productId,
    variantId: variantId === 'base' ? null : variantId,
    productName: product.name,
    quantity,
    unitPriceUsd: unitPrice,
    total: totalNpr ?? totalUsd,
    currency: totalNpr ? 'NPR' : 'USD',
    customerId: interaction.user.id,
    status: 'awaiting_payment',
    createdAt: Date.now(),
    ticketChannelId: null,
  };

  try {
    const ticketChannel = await ticketCmd.createOrderTicket(interaction.guild, order);
    order.ticketChannelId = ticketChannel.id;
    store.saveOrder(order);

    const logsChannel = await getChannel(interaction.guild, 'logsChannelId');
    if (logsChannel) {
      await logsChannel
        .send({
          embeds: [
            embeds.logEmbed(
              '💎 NEW ORDER',
              [
                { name: 'Order', value: order.orderNumber, inline: false },
                { name: '👤 Customer', value: `<@${order.customerId}>`, inline: true },
                { name: '📦 Product', value: order.productName, inline: true },
                { name: '💰 Total', value: order.currency === 'NPR' ? `NPR ${order.total}` : `$${order.total}`, inline: true },
                { name: '⏳ Status', value: '⏳ Awaiting Payment', inline: true },
              ],
              config.colors.pending
            ),
          ],
        })
        .catch(() => {});
    }

    await interaction.editReply({ content: `✅ Order created: **${orderNumber}**\nYour private ticket: ${ticketChannel}` });
  } catch (err) {
    logger.error('Failed to create order ticket', err);
    order.status = 'awaiting_payment';
    store.saveOrder(order);
    await interaction.editReply({ embeds: [embeds.errorEmbed(orderNumber)] });
  }
}

// ---------- Error helper ----------

async function safeErrorReply(interaction, err, context) {
  logger.error(`Interaction error [${context}]`, err);
  const payload = { embeds: [embeds.errorEmbed()], ephemeral: true };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => {}));
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // Interaction likely expired — nothing more we can do.
  }
}

module.exports = {
  handleSlashCommand,
  handleButton,
  handleSelectMenu,
  handleModalSubmit,
};
