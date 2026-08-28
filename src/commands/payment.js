// src/commands/payment.js

const { SlashCommandBuilder } = require('discord.js');
const { config } = require('../config');
const store = require('../store');
const embeds = require('../utils/embeds');

const slashSetPayment = new SlashCommandBuilder()
  .setName('setpayment')
  .setDescription('[Staff] Configure a manual NPR payment method.')
  .addStringOption((o) =>
    o.setName('method').setDescription('Payment method').setRequired(true).addChoices(
      { name: 'Khalti', value: 'khalti' },
      { name: 'eSewa', value: 'esewa' }
    )
  )
  .addBooleanOption((o) => o.setName('enabled').setDescription('Enable this method').setRequired(true))
  .addStringOption((o) => o.setName('number').setDescription('Account / phone number').setRequired(false))
  .addStringOption((o) => o.setName('name').setDescription('Account holder name').setRequired(false));

async function executeSetPaymentSlash(interaction) {
  const method = interaction.options.getString('method', true);
  const enabled = interaction.options.getBoolean('enabled', true);
  const number = interaction.options.getString('number') || undefined;
  const name = interaction.options.getString('name') || undefined;

  const updated = store.setPaymentMethod(method, {
    enabled,
    ...(number !== undefined ? { number } : {}),
    ...(name !== undefined ? { name } : {}),
  });

  const embed = embeds
    .baseEmbed(config.colors.success)
    .setTitle('✅ PAYMENT METHOD UPDATED')
    .addFields(
      { name: 'Method', value: method[0].toUpperCase() + method.slice(1), inline: true },
      { name: 'Enabled', value: updated.enabled ? 'Yes' : 'No', inline: true },
      { name: 'Number', value: updated.number || '_not set_', inline: true },
      { name: 'Name', value: updated.name || '_not set_', inline: true }
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function executeSetPaymentPrefix(message, args) {
  const [method, enabledRaw, number, ...nameParts] = args;
  if (!['khalti', 'esewa'].includes(method)) {
    return message.reply('Usage: `!setpayment <khalti|esewa> <true|false> [number] [name...]`');
  }
  const enabled = ['true', '1', 'yes', 'on'].includes(String(enabledRaw).toLowerCase());
  const name = nameParts.join(' ') || undefined;

  const updated = store.setPaymentMethod(method, {
    enabled,
    ...(number !== undefined ? { number } : {}),
    ...(name !== undefined ? { name } : {}),
  });

  const embed = embeds
    .baseEmbed(config.colors.success)
    .setTitle('✅ PAYMENT METHOD UPDATED')
    .addFields(
      { name: 'Method', value: method[0].toUpperCase() + method.slice(1), inline: true },
      { name: 'Enabled', value: updated.enabled ? 'Yes' : 'No', inline: true },
      { name: 'Number', value: updated.number || '_not set_', inline: true },
      { name: 'Name', value: updated.name || '_not set_', inline: true }
    );

  await message.reply({ embeds: [embed] });
}

const slashSetNpr = new SlashCommandBuilder()
  .setName('setnpr')
  .setDescription('[Staff] Set a custom NPR price for a product/variant.')
  .addStringOption((o) => o.setName('product_id').setDescription('SellAuth product ID').setRequired(true))
  .addStringOption((o) => o.setName('variant_id').setDescription('SellAuth variant ID (use "base" if none)').setRequired(true))
  .addNumberOption((o) => o.setName('price').setDescription('Price in NPR').setRequired(true));

async function executeSetNprSlash(interaction) {
  const productId = interaction.options.getString('product_id', true);
  const variantId = interaction.options.getString('variant_id', true);
  const price = interaction.options.getNumber('price', true);

  store.setNprPrice(productId, variantId, price);

  const embed = embeds
    .baseEmbed(config.colors.success)
    .setTitle('✅ NPR PRICE SET')
    .setDescription(`Product \`${productId}\` (variant \`${variantId}\`) → **Rs. ${price}**`);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function executeSetNprPrefix(message, args) {
  const [productId, variantId, priceRaw] = args;
  const price = Number(priceRaw);
  if (!productId || !variantId || Number.isNaN(price)) {
    return message.reply('Usage: `!setnpr <product_id> <variant_id> <price>`');
  }
  store.setNprPrice(productId, variantId, price);
  const embed = embeds
    .baseEmbed(config.colors.success)
    .setTitle('✅ NPR PRICE SET')
    .setDescription(`Product \`${productId}\` (variant \`${variantId}\`) → **Rs. ${price}**`);
  await message.reply({ embeds: [embed] });
}

module.exports = {
  slashSetPayment,
  executeSetPaymentSlash,
  executeSetPaymentPrefix,
  slashSetNpr,
  executeSetNprSlash,
  executeSetNprPrefix,
};
