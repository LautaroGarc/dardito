const { SlashCommandBuilder } = require('discord.js');
const { loadJSON, saveJSON, generateToken } = require('../functions.js');
const fs = require('fs').promises;

const usersPath = path.join(__dirname, '..', 'databases', 'users.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contraseña')
    .setDescription('Gestiona tu contraseña de acceso al dashboard')
    .addSubcommand(subcommand =>
      subcommand
        .setName('mostrar')
        .setDescription('Muestra tu contraseña actual'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('regenerar')
        .setDescription('Genera una nueva contraseña')),
  
  async execute(interaction) {
    // Cargar base de datos
    try {
      const data = loadJSON(usersPath);
      users = JSON.parse(data);
    } catch (error) {
      await interaction.reply({
        content: '❌ Error al cargar la base de datos',
        flags: 64
      });
      return;
    }
    
    const userId = interaction.user.id;
    const subCommand = interaction.options.getSubcommand();
    
    if (!users[userId].token) {
      await interaction.reply({
        content: '❌ No tienes una contraseña asignada. Contacta a un administrador.',
        flags: 64
      });
      return;
    }
    
    if (subCommand === 'mostrar') {
      await interaction.reply({
                            embeds: [{
                                title: "🔐 Contraseña del Dashboard",
                                description: `Esta contraseña es **solo tuya y privada**`,
                                color: 0x00ff00,
                                fields: [
                                    {
                                        name: "🔑 Contraseña",
                                        value: `\`${users[userId].token}\``,
                                        inline: false
                                    },
                                    {
                                        name: "🌐 Acceso al Dashboard",
                                        value: `Visita: [Dashboard Login](https://right-mite-infinite.ngrok-free.app/login)`,
                                        inline: false
                                    }
                                ],
                                footer: {
                                    text: "⚠️ Esta contraseña se muestra solo una vez. Guárdala de forma segura."
                                }
                            }],
                            flags: 64
                        });
    } else if (subCommand === 'regenerar') {
        users[userId].token = generateToken();
        await interaction.reply({
                            embeds: [{
                                title: "🔐 Contraseña del Dashboard",
                                description: `Esta contraseña es **solo tuya y privada**`,
                                color: 0x00ff00,
                                fields: [
                                    {
                                        name: "🔑 Contraseña",
                                        value: `\`${users[userId].token}\``,
                                        inline: false
                                    },
                                    {
                                        name: "🌐 Acceso al Dashboard",
                                        value: `Visita: [Dashboard Login](https://right-mite-infinite.ngrok-free.app/login)`,
                                        inline: false
                                    }
                                ],
                                footer: {
                                    text: "⚠️ Para regenerar la contraseña `\`/contraseña regenerar\``"
                                }
                            }],
                            flags: 64
                        });
      saveJSON(users, usersPath);
    }

    
  }
};