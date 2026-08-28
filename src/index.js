// src/index.js
// Plutostokz Helper — main entry point.
// Boots the Discord client, registers slash commands, starts the HTTP
// health server (required for Render Web Services), and wires up every
// event handler.

const http = require('http');
const { Client, GatewayIntentBits, Partials, REST, Routes, ActivityType } = require('discord.js');

const { config, validateStartupConfig } = require('./config');
const { logger } = require('./utils/logger');
const { registerGlobalErrorHandlers } = require('./handlers/errors');
const interactionHandlers = require('./handlers/interactions');
const messageHandlers = require('./handlers/messages');
const sellauth = require('./sellauth');

const shopCmd = require('./commands/shop');
const setupCmd = require('./commands/setup');
const ticketCmd = require('./commands/ticket');
const paymentCmd = require('./commands/payment');
const ordersCmd = require('./commands/orders');
const staffCmd = require('./commands/staff');

console.log('🌌 Plutostokz Helper is starting...');

registerGlobalErrorHandlers();

const missing = validateStartupConfig();
if (missing.length) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  logger.error('Copy .env.example to .env and fill in the required values before starting the bot.');
  process.exit(1);
}

// ---------- HTTP health server (required for Render Web Services) ----------

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bot: true, name: config.botName }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`${config.botName} is running.`);
});

server.listen(config.port, '0.0.0.0', () => {
  logger.info(`HTTP health server listening on 0.0.0.0:${config.port} (/health)`);
});

// ---------- Discord client ----------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

const SLASH_COMMANDS = [
  shopCmd.slashShop,
  shopCmd.slashProducts,
  setupCmd.slashSetup,
  ticketCmd.slashTicket,
  ticketCmd.slashClose,
  paymentCmd.slashSetPayment,
  paymentCmd.slashSetNpr,
  ordersCmd.slashStock,
  ordersCmd.slashOrders,
  ordersCmd.slashSync,
  ordersCmd.slashAddStock,
  staffCmd.slashApprove,
  staffCmd.slashReject,
  staffCmd.slashReload,
  staffCmd.slashHelp,
].map((builder) => builder.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: SLASH_COMMANDS });
}

const PRESENCES = [
  { name: '💎 Plutostokz Store', type: ActivityType.Watching },
  { name: '/shop | Plutostokz', type: ActivityType.Playing },
];
let presenceIndex = 0;

function rotatePresence() {
  const presence = PRESENCES[presenceIndex % PRESENCES.length];
  presenceIndex += 1;
  client.user?.setActivity(presence.name, { type: presence.type });
}

client.once('ready', async () => {
  logger.success(`✅ Discord connected as ${client.user.tag}`);

  try {
    await registerSlashCommands();
    logger.success('✅ Commands registered');
  } catch (err) {
    logger.error('Failed to register slash commands', err);
  }

  const sellauthCheck = await sellauth.fetchProducts({ force: true });
  if (sellauthCheck.ok) {
    logger.success('✅ SellAuth connected');
    logger.success(`✅ Products synchronized: ${sellauthCheck.data.length}`);
  } else {
    logger.warn(`⚠️  SellAuth connection issue: ${sellauthCheck.error}`);
    logger.warn('The bot will keep running — shop commands will retry automatically.');
  }

  rotatePresence();
  setInterval(rotatePresence, 60_000);

  console.log(`✨ ${config.botName} is online`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      return await interactionHandlers.handleSlashCommand(interaction);
    }
    if (interaction.isButton()) {
      return await interactionHandlers.handleButton(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      return await interactionHandlers.handleSelectMenu(interaction);
    }
    if (interaction.isModalSubmit()) {
      return await interactionHandlers.handleModalSubmit(interaction);
    }
  } catch (err) {
    logger.error('Unhandled interaction error', err);
  }
});

client.on('messageCreate', async (message) => {
  try {
    await messageHandlers.handleMessage(message);
  } catch (err) {
    logger.error('Unhandled message handler error', err);
  }
});

client.on('error', (err) => {
  logger.error('Discord client error', err);
});

client.on('shardError', (err) => {
  logger.error('Discord shard error', err);
});

client.login(config.discordToken).catch((err) => {
  logger.error('Failed to log in to Discord — check DISCORD_TOKEN', err);
  process.exit(1);
});
