const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder');
const { getGuildConfig } = require('../../utils/config');

const FAQ_ITEMS = [
  { question: "Bot can't create channels", answer: "Check that the bot has `Manage Channels` permission in the target category." },
  { question: "Role toggle fails", answer: "Ensure the bot's role is **above** the role it's trying to assign in Server Settings → Roles." },
  { question: "Ticket not sending transcript", answer: "Verify the transcript channel ID is set via `/ticketadmin set-transcript-channel`." },
  { question: "Can't see dashboard commands", answer: "You need a Dashboard Role. Ask an admin to run `/ticketadmin add-dashboard-role`." },
  { question: "Ticket counter reset", answer: "Use `/ticketadmin set-count` to manually set the ticket counter." },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with the bot.')
    .addSubcommand((sub) =>
      sub.setName('commands').setDescription('List all available commands.')
    )
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Show setup checklist for all panels.')
    )
    .addSubcommand((sub) =>
      sub.setName('faq').setDescription('Frequently asked questions.')
    ),

  async execute(interaction, { client, config }) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'commands') {
      return handleCommands(interaction, client);
    }
    if (sub === 'setup') {
      return handleSetup(interaction, config);
    }
    if (sub === 'faq') {
      return handleFaq(interaction);
    }
  },
};

async function handleCommands(interaction, client) {
  const commands = [...client.commands.values()];
  const grouped = { general: [], ticket: [], admin: [], panel: [] };

  for (const cmd of commands) {
    const name = cmd.data.name;
    const desc = cmd.data.description;
    const perms = cmd.data.default_member_permissions;
    let level = 'Everyone';
    if (perms) level = 'Admin';

    const folder = cmd.folder || 'general';
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push({ name, desc, level });
  }

  const fields = [];
  for (const [cat, cmds] of Object.entries(grouped)) {
    if (!cmds.length) continue;
    const lines = cmds.map((c) => `\`/${c.name}\` — ${c.desc}`).join('\n');
    fields.push({ name: cat.charAt(0).toUpperCase() + cat.slice(1), value: lines, inline: false });
  }

  const embed = embedBuilder.info('Bot Commands', 'All available slash commands:');
  embed.addFields(fields.slice(0, 25));

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSetup(interaction, config) {
  const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
  const panels = guildConfig.panels || {};
  const panelIds = Object.keys(panels);

  const fields = [];

  // Global checks
  const dashSet = (guildConfig.server?.dashboardRoles?.length || 0) > 0;
  const blSet = (guildConfig.server?.blacklistRoles?.length || 0) > 0;
  const globalLimit = guildConfig.server?.globalTicketLimit ?? 1;

  fields.push({
    name: '🌐 Server Config',
    value: [
      `Dashboard Roles: ${dashSet ? '✅' : '❌ Not set'}`,
      `Blacklist Roles: ${blSet ? '✅' : '⚪ Optional'}`,
      `Global Ticket Limit: ${globalLimit}`,
    ].join('\n'),
    inline: false,
  });

  let allGood = dashSet;

  for (const pid of panelIds) {
    const p = panels[pid];
    const catSet = !!p.ticketOptions?.categoryId;
    const suppSet = (p.supportRoles?.length || 0) > 0;
    const logSet = !!p.logOptions?.channelId;
    const transSet = !!p.transcriptOptions?.channelId;
    const posted = !!p.postedChannelId;

    const lines = [
      `Category: ${catSet ? '✅' : '❌ Required'}`,
      `Support Role: ${suppSet ? '✅' : '❌ Required'}`,
      `Log Channel: ${logSet ? '✅' : '⚪ Optional'}`,
      `Transcript Channel: ${transSet ? '✅' : '⚪ Optional'}`,
      `Panel Posted: ${posted ? '✅' : '❌ Not posted'}`,
    ];

    fields.push({ name: `🎫 Panel: ${p.name}`, value: lines.join('\n'), inline: true });

    if (!catSet || !suppSet) allGood = false;
  }

  if (!panelIds.length) {
    fields.push({ name: '🎫 Panels', value: 'No panels configured. Use `/ticketadmin create-panel`.', inline: false });
    allGood = false;
  }

  // RR check
  const rr = guildConfig.reactionRoles || {};
  const rrRoles = rr.roles?.length || 0;
  fields.push({
    name: '🎭 Reaction Roles',
    value: rrRoles > 0 ? `✅ ${rrRoles} role(s) configured` : '⚪ No roles configured',
    inline: false,
  });

  // Next steps
  const nextSteps = [];
  if (!panelIds.length) {
    nextSteps.push('→ Run `/setup` to start the setup wizard');
  } else {
    const firstPanel = panels[panelIds[0]];
    if (!firstPanel.ticketOptions?.categoryId) {
      nextSteps.push('→ Run `/ticketadmin panel category` to set ticket category');
    }
    if (!firstPanel.supportRoles?.length) {
      nextSteps.push('→ Run `/ticketadmin panel support` to set support role');
    }
    if (!firstPanel.postedChannelId) {
      nextSteps.push('→ Run `/panel` to post your ticket panel');
    }
  }
  if (rrRoles === 0) {
    nextSteps.push('→ Run `/rradmin add-role` to add reaction roles');
  }
  nextSteps.push('→ Run `/debug` to verify permissions');

  if (nextSteps.length > 0) {
    fields.push({
      name: '📋 Next Steps',
      value: nextSteps.slice(0, 5).join('\n'),
      inline: false,
    });
  }

  const color = allGood ? 0x57f287 : (panelIds.length ? 0xfee75c : 0xed4245);
  const embed = embedBuilder.info('Setup Checklist', 'Review your bot configuration:').setColor(color);
  embed.addFields(fields.slice(0, 25));

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleFaq(interaction) {
  const embed = embedBuilder.info('Frequently Asked Questions', 'Common issues and solutions:');
  embed.addFields(FAQ_ITEMS.map((f) => ({ name: `❓ ${f.question}`, value: f.answer, inline: false })));
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

