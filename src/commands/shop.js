// src/commands/shop.js

const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const sellauth = require('../sellauth');
const embeds = require('../utils/embeds');
const store = require('../store');

/** Post (or refresh) the shop panel in a given text channel. Returns the sent message or null. */
async function postShopPanel(channel) {
  const { ok, data: products, error } = await sellauth.fetchProducts();

  const embed = embeds.shopPanelEmbed();
  if (!ok) {
    embed.addFields({ name: '⚠️ Notice', value: error || 'Could not load products right now.' });
  } else if (!products.length) {
    embed.addFields({ name: '⚠️ Notice', value: 'No products are currently available.' });
  }

  const components = ok ? embeds.shopPanelComponents(products) : [];
  const message = await channel.send({ embeds: [embed], components });
  return message;
}

/** Build the "product selected" reply: embed + variant/quantity entry point. */
async function buildProductSelectionReply(productId) {
  const { ok, data: product, error } = await sellauth.fetchProductById(productId);
  if (!ok || !product) {
    return { embeds: [embeds.errorEmbed()], content: error || 'Product not found.', components: [] };
  }

  const variant = Array.isArray(product.variants) && product.variants.length ? product.variants[0] : null;
  const nprPrice = store.getNprPrice(product.id, variant?.id || 'base');

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_buy_${product.id}_${variant?.id ?? 'base'}`)
      .setLabel('Buy Now')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [embeds.productDetailEmbed(product, variant, nprPrice)],
    components: [row],
  };
}

const slashShop = new SlashCommandBuilder().setName('shop').setDescription('Open the Plutostokz product shop.');
const slashProducts = new SlashCommandBuilder().setName('products').setDescription('List all available products.');

async function executeShopSlash(interaction) {
  await interaction.deferReply();
  const { ok, data: products, error } = await sellauth.fetchProducts();
  const embed = embeds.shopPanelEmbed();
  if (!ok) embed.addFields({ name: '⚠️ Notice', value: error || 'Could not load products right now.' });
  const components = ok ? embeds.shopPanelComponents(products) : [];
  await interaction.editReply({ embeds: [embed], components });
}

async function executeProductsSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { ok, data: products, error } = await sellauth.fetchProducts();
  if (!ok) {
    return interaction.editReply({ content: `❌ ${error}` });
  }
  if (!products.length) {
    return interaction.editReply({ content: 'No products are currently available.' });
  }
  const lines = products.slice(0, 25).map((p) => {
    const stock = p.stock ?? p.variants?.[0]?.stock ?? null;
    return `${embeds.stockBadge(stock)} — **${p.name}** — $${Number(p.price ?? p.variants?.[0]?.price ?? 0).toFixed(2)}`;
  });
  const embed = embeds
    .baseEmbed(config.colors.info)
    .setTitle('📦 AVAILABLE PRODUCTS')
    .setDescription(lines.join('\n'));
  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  postShopPanel,
  buildProductSelectionReply,
  slashShop,
  slashProducts,
  executeShopSlash,
  executeProductsSlash,
};
