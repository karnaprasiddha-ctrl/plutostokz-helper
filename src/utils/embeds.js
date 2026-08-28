// src/utils/embeds.js
// Central place for every embed/component the bot sends, so branding and
// styling stay consistent across the whole project.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { config } = require('../config');

function baseEmbed(color) {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: config.botName })
    .setTimestamp();
}

function shopPanelEmbed() {
  return baseEmbed(config.colors.shop)
    .setTitle(`🌌 ${config.shopName.toUpperCase()}`)
    .setDescription(
      [
        `💎 **PREMIUM DIGITAL STORE**`,
        '',
        `⚡ Instant delivery`,
        `🔒 Secure checkout`,
        `💬 Dedicated support`,
        '',
        `Select a product below to begin.`,
      ].join('\n')
    );
}

function shopPanelComponents(products) {
  const rows = [];
  const options = products.slice(0, 25).map((p) => ({
    label: p.name?.slice(0, 100) || `Product ${p.id}`,
    description:
      (p.description ? String(p.description).replace(/\n/g, ' ').slice(0, 90) : 'Digital product') || undefined,
    value: String(p.id),
    emoji: '💎',
  }));

  if (options.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('shop_select_product')
      .setPlaceholder('🛒 Choose a product...')
      .addOptions(options);
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('shop_refresh').setLabel('Refresh Stock').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('shop_open_support').setLabel('Support').setEmoji('🎫').setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

function stockBadge(qty) {
  if (qty === null || qty === undefined) return '⚪ Unknown';
  if (qty <= 0) return '🔴 Out of stock';
  if (qty <= 5) return `🟡 ${qty} available`;
  return `🟢 ${qty} available`;
}

function productDetailEmbed(product, variant, nprPrice) {
  const price = variant?.price ?? product.price;
  const stock = variant?.stock ?? product.stock ?? null;

  const fields = [
    { name: '💵 USD Price', value: price !== undefined ? `$${Number(price).toFixed(2)}` : 'N/A', inline: true },
  ];
  if (nprPrice) {
    fields.push({ name: '🇳🇵 NPR Price', value: `Rs. ${nprPrice}`, inline: true });
  }
  fields.push({ name: '📦 Stock', value: stockBadge(stock), inline: true });

  const embed = baseEmbed(config.colors.premium)
    .setTitle(`💎 ${product.name}`)
    .setDescription(product.description ? String(product.description).slice(0, 400) : 'No description provided.')
    .addFields(fields);

  if (product.image || product.thumbnail) {
    embed.setThumbnail(product.image || product.thumbnail);
  }
  return embed;
}

function orderCreatedEmbed(order) {
  return baseEmbed(config.colors.pending)
    .setTitle('🛒 ORDER CREATED')
    .addFields(
      { name: '📦 Product', value: order.productName, inline: false },
      { name: '🔢 Quantity', value: String(order.quantity), inline: true },
      { name: '💰 Total', value: order.currency === 'NPR' ? `NPR ${order.total}` : `$${order.total}`, inline: true },
      { name: '🧾 Order', value: order.orderNumber, inline: false },
      { name: '👤 Customer', value: `<@${order.customerId}>`, inline: true },
      { name: '⏳ Status', value: statusLabel(order.status), inline: true }
    );
}

function statusLabel(status) {
  const map = {
    awaiting_payment: '⏳ Awaiting Payment',
    under_review: '🔎 Payment Under Review',
    completed: '✅ Completed',
    rejected: '❌ Rejected',
  };
  return map[status] || status;
}

function paymentMethodPickerEmbed(order) {
  return baseEmbed(config.colors.pending)
    .setTitle('🇳🇵 NPR PAYMENT')
    .setDescription(
      [`**Order:** ${order.orderNumber}`, `**Total:** NPR ${order.total}`, '', 'Choose payment method:'].join('\n')
    );
}

function nprInstructionsEmbed(order, method, settings) {
  const title = method === 'khalti' ? '🟣 KHALTI PAYMENT' : '🟢 ESEWA PAYMENT';
  return baseEmbed(config.colors.pending)
    .setTitle(title)
    .setDescription(
      [
        `**Order:** ${order.orderNumber}`,
        '',
        `**Amount:** NPR ${order.total}`,
        '',
        `**Number:** ${settings.number || 'Not configured'}`,
        `**Name:** ${settings.name || 'Not configured'}`,
        '',
        `**Reference:**`,
        order.orderNumber,
        '',
        `After paying, upload your payment screenshot here.`,
      ].join('\n')
    );
}

function paymentSubmittedEmbed(order, method) {
  return baseEmbed(config.colors.info)
    .setTitle('🔎 PAYMENT SUBMITTED')
    .addFields(
      { name: 'Order', value: order.orderNumber, inline: true },
      { name: 'Payment', value: method ? method[0].toUpperCase() + method.slice(1) : 'USD (SellAuth)', inline: true },
      { name: 'Customer', value: `<@${order.customerId}>`, inline: true }
    )
    .setDescription('Staff review required.');
}

function orderCompletedEmbed(order, staffId) {
  return baseEmbed(config.colors.success)
    .setTitle('✅ ORDER COMPLETED')
    .addFields(
      { name: 'Order', value: order.orderNumber, inline: true },
      { name: 'Product', value: order.productName, inline: true },
      { name: 'Quantity', value: String(order.quantity), inline: true },
      { name: 'Total', value: order.currency === 'NPR' ? `NPR ${order.total}` : `$${order.total}`, inline: true },
      { name: 'Approved by', value: `<@${staffId}>`, inline: true }
    )
    .setDescription('Thank you for your purchase! 💎');
}

function orderRejectedEmbed(order, reason) {
  return baseEmbed(config.colors.error)
    .setTitle('❌ PAYMENT REJECTED')
    .setDescription(
      [
        `**Order:** ${order.orderNumber}`,
        '',
        `Your payment could not be verified.`,
        '',
        `Please contact staff if you believe this was an error.`,
        reason ? `\n**Reason:** ${reason}` : '',
      ].join('\n')
    );
}

function errorEmbed(orderNumber) {
  return baseEmbed(config.colors.error)
    .setTitle('❌ Something went wrong')
    .setDescription(
      [
        'Please contact staff and provide:',
        orderNumber ? `**${orderNumber}**` : '_(no order reference)_',
      ].join('\n')
    );
}

function logEmbed(title, fields, color = config.colors.info) {
  return baseEmbed(color).setTitle(title).addFields(fields);
}

module.exports = {
  baseEmbed,
  shopPanelEmbed,
  shopPanelComponents,
  productDetailEmbed,
  stockBadge,
  orderCreatedEmbed,
  statusLabel,
  paymentMethodPickerEmbed,
  nprInstructionsEmbed,
  paymentSubmittedEmbed,
  orderCompletedEmbed,
  orderRejectedEmbed,
  errorEmbed,
  logEmbed,
};
