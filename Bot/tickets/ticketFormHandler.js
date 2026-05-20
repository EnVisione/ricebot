const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getGuildConfig } = require('../utils/config');
const { createTicketWithForm } = require('./ticketService');
const embedBuilder = require('../utils/embedBuilder');

// Temporary storage for form data (category and issue selections before modal)
const formSessions = new Map();
const SESSION_TIMEOUT = 300000; // 5 minutes

function createFormSession(guildId, odId, panelId) {
  const key = `${guildId}:${odId}`;

  // Clear existing session if any
  if (formSessions.has(key)) {
    clearTimeout(formSessions.get(key).timeout);
  }

  const session = {
    panelId,
    category: null,
    issueType: null,
    step: 'category', // 'category' -> 'issue' -> 'description'
    timeout: setTimeout(() => formSessions.delete(key), SESSION_TIMEOUT),
  };

  formSessions.set(key, session);
  return session;
}

function getFormSession(guildId, userId) {
  return formSessions.get(`${guildId}:${userId}`);
}

function deleteFormSession(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const session = formSessions.get(key);
  if (session) {
    clearTimeout(session.timeout);
    formSessions.delete(key);
  }
}

/**
 * Handle ticket button click - show category selection or modal
 */
async function handleTicketButtonClick(interaction, config, ticketState, saveConfig, saveTicketState) {
  const panelId = interaction.customId.replace('ticket:open:', '');
  const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[panelId];

  if (!panelConfig) {
    return interaction.reply({
      embeds: [embedBuilder.error('Panel Not Found', 'This panel no longer exists.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const ticketForm = panelConfig.ticketForm;

  // If form is disabled, create ticket directly
  if (!ticketForm?.enabled) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { createTicket } = require('./ticketService');
    const result = await createTicket(interaction, panelId, panelConfig, guildConfig, config, ticketState, saveConfig, saveTicketState);

    if (result.success) {
      return interaction.editReply({ embeds: [embedBuilder.success('Ticket Created', `Your ticket: <#${result.channel.id}>`)] });
    } else {
      return interaction.editReply({ embeds: [embedBuilder.error('Failed', result.error)] });
    }
  }

  // Create form session
  createFormSession(interaction.guildId, interaction.user.id, panelId);

  // Show category selection
  const categories = ticketForm.categories || [];

  if (categories.length === 0) {
    // No categories configured, show modal directly
    return showDescriptionModal(interaction, panelConfig, null, null, panelId);
  }

  const categoryOptions = categories.map(cat => ({
    label: cat.label,
    value: cat.value,
    emoji: cat.emoji || undefined,
    description: cat.description || undefined,
  }));

  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId(`ticket:form:category:${panelId}`)
    .setPlaceholder('What category is this ticket for?')
    .addOptions(categoryOptions);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Open a Ticket')
    .setDescription('Please select the category for your ticket:');

  return interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(categoryMenu)],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle category selection - show issue type selection
 */
async function handleCategorySelect(interaction, config) {
  const panelId = interaction.customId.replace('ticket:form:category:', '');
  const selectedCategory = interaction.values[0];
  const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[panelId];

  if (!panelConfig) {
    return interaction.update({
      embeds: [embedBuilder.error('Panel Not Found', 'This panel no longer exists.')],
      components: [],
    });
  }

  const session = getFormSession(interaction.guildId, interaction.user.id);
  if (!session) {
    return interaction.update({
      embeds: [embedBuilder.error('Session Expired', 'Please click the ticket button again.')],
      components: [],
    });
  }

  session.category = selectedCategory;
  session.step = 'issue';

  const ticketForm = panelConfig.ticketForm;
  const issueTypes = ticketForm.issueTypes || [];

  if (issueTypes.length === 0) {
    // No issue types configured, show modal directly
    return showDescriptionModal(interaction, panelConfig, selectedCategory, null, panelId);
  }

  const issueOptions = issueTypes.map(issue => ({
    label: issue.label,
    value: issue.value,
    emoji: issue.emoji || undefined,
    description: issue.description || undefined,
  }));

  const issueMenu = new StringSelectMenuBuilder()
    .setCustomId(`ticket:form:issue:${panelId}`)
    .setPlaceholder('What is this issue about?')
    .addOptions(issueOptions);

  const categoryLabel = ticketForm.categories.find(c => c.value === selectedCategory)?.label || selectedCategory;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Open a Ticket')
    .setDescription(`**Category:** ${categoryLabel}\n\nNow select what this issue is about:`);

  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(issueMenu)],
  });
}

/**
 * Handle issue type selection - show description modal
 */
async function handleIssueSelect(interaction, config) {
  const panelId = interaction.customId.replace('ticket:form:issue:', '');
  const selectedIssue = interaction.values[0];
  const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[panelId];

  if (!panelConfig) {
    return interaction.update({
      embeds: [embedBuilder.error('Panel Not Found', 'This panel no longer exists.')],
      components: [],
    });
  }

  const session = getFormSession(interaction.guildId, interaction.user.id);
  if (!session) {
    return interaction.update({
      embeds: [embedBuilder.error('Session Expired', 'Please click the ticket button again.')],
      components: [],
    });
  }

  session.issueType = selectedIssue;
  session.step = 'description';

  return showDescriptionModal(interaction, panelConfig, session.category, selectedIssue, panelId);
}

/**
 * Show the description modal
 */
function showDescriptionModal(interaction, panelConfig, category, issueType, panelId) {
  const ticketForm = panelConfig.ticketForm || {};

  const modal = new ModalBuilder()
    .setCustomId(`ticket:form:submit:${panelId}:${category || 'none'}:${issueType || 'none'}`)
    .setTitle('Describe Your Issue');

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel(ticketForm.descriptionLabel || 'Describe your issue')
    .setPlaceholder(ticketForm.descriptionPlaceholder || 'Please describe your issue in detail...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(ticketForm.descriptionRequired !== false)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(descriptionInput));

  return interaction.showModal(modal);
}

/**
 * Handle modal submission - create the ticket
 */
async function handleFormSubmit(interaction, config, ticketState, saveConfig, saveTicketState) {
  const parts = interaction.customId.split(':');
  // Format: ticket:form:submit:{panelId}:{category}:{issueType}
  const panelId = parts[3];
  const category = parts[4] === 'none' ? null : parts[4];
  const issueType = parts[5] === 'none' ? null : parts[5];
  const description = interaction.fields.getTextInputValue('description');

  const guildConfig = getGuildConfig(config, interaction.guildId, interaction.guild?.name);
  const panelConfig = guildConfig.panels?.[panelId];

  if (!panelConfig) {
    return interaction.reply({
      embeds: [embedBuilder.error('Panel Not Found', 'This panel no longer exists.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Clean up form session
  deleteFormSession(interaction.guildId, interaction.user.id);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await createTicketWithForm(
    interaction,
    panelId,
    panelConfig,
    guildConfig,
    config,
    ticketState,
    saveConfig,
    saveTicketState,
    { category, issueType, description }
  );

  if (result.success) {
    return interaction.editReply({
      embeds: [embedBuilder.success('Ticket Created', `Your ticket: <#${result.channel.id}>`)],
    });
  } else {
    return interaction.editReply({
      embeds: [embedBuilder.error('Failed', result.error)],
    });
  }
}

module.exports = {
  handleTicketButtonClick,
  handleCategorySelect,
  handleIssueSelect,
  handleFormSubmit,
  getFormSession,
  deleteFormSession,
};

