// src/commands/orders.js

const { SlashCommandBuilder } = require('discord.js');
const { config } = require('../config');
const store = require('../store');
const sellauth = require('../sellauth');
const embeds = require('../utils/embeds');

// ---------- /stock !stock ----------

const slashStock = new SlashCommandBuilder().setName('stock').setDescription('Show live product stock.');

async function buildStockEmbed() {
  const { ok, data: products, error } = await sellauth.fetchProducts();
  if (!ok) {
    return embeds.baseEmbed(config.colors.error).setTitle('❌ STOCK UNAVAILABLE').setDescription(error);
  }
  if (!products.length) {
    return embeds.baseEmbed(config.colors.info).setTitle('📦 LIVE STOCK').setDescription('No products found.');
  }
  const lines = products
    .slice(0, 25)
    .map((p) => {
      const stock = p.stock ?? p.variants?.[0]?.stock ?? null;
      return `**${p.name}**\n${embeds.stockBadge(stock)}`;
    })
    .join('\n\n');
  return embeds.baseEmbed(config.colors.premium).setTitle('📦 LIVE STOCK').setDescription(lines);
}

async function executeStockSlash(interaction) {
  await interaction.deferReply();
  const embed = await buildStockEmbed();
  await interaction.editReply({ embeds: [embed] });
}

// ---------- /orders !orders ----------

const slashOrders = new SlashCommandBuilder().setName('orders').setDescription('[Staff] Show recent orders.');

function buildOrdersEmbed() {
  const recent = store.getRecentOrders(10);
  if (!recent.length) {
    return embeds.baseEmbed(config.colors.info).setTitle('🧾 RECENT ORDERS').setDescription('No orders yet.');
  }
  const lines = recent.map((o) => {
    const date = o.createdAt ? new Date(o.createdAt).toLocaleString() : 'Unknown';
    return `**${o.orderNumber}** — <@${o.customerId}> — ${o.productName} — ${
      o.currency === 'NPR' ? `NPR ${o.total}` : `$${o.total}`
    } — ${embeds.statusLabel(o.status)} — ${date}`;
  });
  return embeds.baseEmbed(config.colors.premium).setTitle('🧾 RECENT ORDERS').setDescription(lines.join('\n'));
}

async function executeOrdersSlash(interaction) {
  await interaction.reply({ embeds: [buildOrdersEmbed()], ephemeral: true });
}

// ---------- /sync !sync ----------

const slashSync = new SlashCommandBuilder().setName('sync').setDescription('[Staff] Re-sync products from SellAuth.');

async function performSync() {
  const { ok, data: products, error } = await sellauth.fetchProducts({ force: true });
  if (!ok) return { ok: false, error };
  const variantCount = products.reduce((sum, p) => sum + (Array.isArray(p.variants) ? p.variants.length : p.variants ? 1 : 0), 0);
  return { ok: true, productCount: products.length, variantCount };
}

function syncResultEmbed(result) {
  if (!result.ok) {
    return embeds.baseEmbed(config.colors.error).setTitle('❌ SYNC FAILED').setDescription(result.error);
  }
  return embeds
    .baseEmbed(config.colors.success)
    .setTitle('✨ SELLAUTH SYNC')
    .setDescription(
      [`✅ Products synchronized: ${result.productCount}`, `📦 Variants synchronized: ${result.variantCount}`].join('\n')
    );
}

async function executeSyncSlash(interaction) {
  await interaction.deferReply();
  const result = await performSync();
  await interaction.editReply({ embeds: [syncResultEmbed(result)] });
}

// ---------- /addstock !addstock ----------

const slashAddStock = new SlashCommandBuilder()
  .setName('addstock')
  .setDescription('[Staff] Append deliverables to a product variant.')
  .addStringOption((o) => o.setName('product_id').setDescription('SellAuth product ID').setRequired(true))
  .addStringOption((o) => o.setName('variant_id').setDescription('SellAuth variant ID').setRequired(true))
  .addStringOption((o) =>
    o.setName('deliverables').setDescription('One or more lines, separated by | (pipe)').setRequired(true)
  );

async function executeAddStockSlash(interaction) {
  const productId = interaction.options.getString('product_id', true);
  const variantId = interaction.options.getString('variant_id', true);
  const raw = interaction.options.getString('deliverables', true);
  const deliverables = raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!deliverables.length) {
    return interaction.reply({ content: '❌ No valid deliverables provided.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await sellauth.addStock({ productId, variantId, deliverables });
  if (!result.ok) {
    return interaction.editReply({ content: `❌ ${result.error}` });
  }
  await interaction.editReply({
    embeds: [
      embeds
        .baseEmbed(config.colors.success)
        .setTitle('✅ STOCK ADDED')
        .setDescription(`Added **${deliverables.length}** deliverable(s) to product \`${productId}\` variant \`${variantId}\`.`),
    ],
  });
}

async function executeAddStockPrefix(message, args) {
  const [productId, variantId, ...rest] = args;
  const raw = rest.join(' ');
  const deliverables = raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!productId || !variantId || !deliverables.length) {
    return message.reply('Usage: `!addstock <product_id> <variant_id> <item1|item2|...>`');
  }

  const result = await sellauth.addStock({ productId, variantId, deliverables });
  if (!result.ok) {
    return message.reply(`❌ ${result.error}`);
  }
  await message.reply({
    embeds: [
      embeds
        .baseEmbed(config.colors.success)
        .setTitle('✅ STOCK ADDED')
        .setDescription(`Added **${deliverables.length}** deliverable(s) to product \`${productId}\` variant \`${variantId}\`.`),
    ],
  });
}

module.exports = {
  slashStock,
  buildStockEmbed,
  executeStockSlash,
  slashOrders,
  buildOrdersEmbed,
  executeOrdersSlash,
  slashSync,
  performSync,
  syncResultEmbed,
  executeSyncSlash,
  slashAddStock,
  executeAddStockSlash,
  executeAddStockPrefix,
};
