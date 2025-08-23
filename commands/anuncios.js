const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anuncios')
    .setDescription('Envía un anuncio a uno de los canales designados (solo para auditores).')
    .addStringOption(option =>
      option.setName('destino')
        .setDescription('Canal destino: anuncios o anunciosLideres')
        .setRequired(true)
        .addChoices(
          { name: 'Anuncios generales', value: 'anuncios' },
          { name: 'Anuncios líderes', value: 'anunciosLideres' }
        )
    )
    .addStringOption(option =>
      option.setName('mensaje')
        .setDescription('Mensaje a enviar')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  async execute(interaction) {
    // Solo auditores pueden usar este comando
    if (!interaction.member.roles.cache.has(config.rolID.auditor)) {
      await interaction.reply({ content: '❌ Solo los auditores pueden usar este comando.', ephemeral: true });
      return;
    }

    const destino = interaction.options.getString('destino');
    const mensaje = interaction.options.getString('mensaje');
    const canalId = config.canales[destino];

    if (!canalId) {
      await interaction.reply({ content: '❌ El canal de destino no está configurado correctamente.', ephemeral: true });
      return;
    }

    const canal = interaction.guild.channels.cache.get(canalId);
    if (!canal || canal.type !== ChannelType.GuildText) {
      await interaction.reply({ content: '❌ El canal de destino no existe o no es un canal de texto.', ephemeral: true });
      return;
    }

    try {
      await canal.send("@everyone "+mensaje);
      await interaction.reply({ content: '✅ Mensaje enviado correctamente.', ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '❌ Ocurrió un error al enviar el mensaje.', ephemeral: true });
    }
  }
};