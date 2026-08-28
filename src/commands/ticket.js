// src/commands/ticket.js

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { getResolvedId } = require('../utils/channels');
const embeds = require('../utils/embeds');

function ticketOverwrites(guild, userId) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
  ];
  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }
  return overwrites;
}

/** Creates a private order ticket channel for the given order and posts the order embed + payment buttons. */
async function createOrderTicket(guild, order) {
  const categoryId = getResolvedId('ticketCategoryId');
  const safeSlug = order.orderNumber.toLowerCase();

  const channel = await guild.channels.create({
    name: `${safeSlug}`,
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    topic: `Order ${order.orderNumber} — <@${order.customerId}>`,
    permissionOverwrites: ticketOverwrites(guild, order.customerId),
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pay_npr_${order.orderNumber}`).setLabel('NPR Payment').setEmoji('🇳🇵').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pay_usd_${order.orderNumber}`).setLabel('USD Payment').setEmoji('💵').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_close_${order.orderNumber}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${order.customerId}>`,
    embeds: [embeds.orderCreatedEmbed(order).setDescription('Choose a payment method below.')],
    components: [row],
  });

  return channel;
}

/** Creates a general (non-order) support ticket. */
async function createSupportTicket(guild, user) {
  const categoryId = getResolvedId('ticketCategoryId');

  const channel = await guild.channels.create({
    name: `support-${user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    topic: `Support ticket for ${user.tag}`,
    permissionOverwrites: ticketOverwrites(guild, user.id),
  });

  const embed = embeds
    .baseEmbed(config.colors.info)
    .setTitle('🎫 SUPPORT TICKET')
    .setDescription(
      [
        `Hey <@${user.id}>, thanks for reaching out to **${config.botName}**.`,
        '',
        `A staff member will be with you shortly. Please describe your issue below.`,
      ].join('\n')
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_support_${channel?.id ?? 'pending'}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  const sent = await channel.send({ embeds: [embed] });
  // Fix the close button's custom ID now that we know the real channel ID.
  const fixedRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_support_${channel.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
  await sent.edit({ components: [fixedRow] });

  return channel;
}

async function closeTicket(channel, notifyInteraction) {
  const embed = embeds
    .baseEmbed(config.colors.error)
    .setTitle('🔒 TICKET CLOSING')
    .setDescription('This ticket will be deleted in 5 seconds.');

  if (notifyInteraction) {
    await notifyInteraction.reply({ embeds: [embed] });
  } else {
    await channel.send({ embeds: [embed] });
  }

  setTimeout(async () => {
    try {
      await channel.delete('Ticket closed');
    } catch (err) {
      logger.error('Failed to delete ticket channel', err);
    }
  }, 5000);
}

const slashTicket = new SlashCommandBuilder().setName('ticket').setDescription('Open a general support ticket.');
const slashClose = new SlashCommandBuilder().setName('close').setDescription('Close this ticket.');

module.exports = { createOrderTicket, createSupportTicket, closeTicket, slashTicket, slashClose };
