// commands/dashboard.js - Crear un comando slash para el dashboard
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Muestra el enlace al dashboard de Dardito')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('🌐 Dashboard Dardito WEB')
          .setURL('https://right-mite-infinite.ngrok-free.app')
          .setStyle(ButtonStyle.Link)
      );
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('DASHBOARD - DARDITO')
      .setDescription('Accedé al dashboard con tus credenciales')
      .setFooter({ text: 'Dashboard Dardito - WEB' });
    
    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
};