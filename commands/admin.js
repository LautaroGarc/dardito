const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const { generateToken, loadJSON, saveJSON } = require('../functions.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Comandos de administración')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-tokens')
                .setDescription('Regenera todos los tokens de usuarios')
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'reset-tokens') {
                // Cargar la base de datos de usuarios
                const usersPath = path.join(__dirname, '..', 'databases', 'users.json');
                const usersData = loadJSON(usersPath);
                
                if (!usersData || typeof usersData !== 'object') {
                    return await interaction.editReply({
                        content: '❌ Error: No se pudo cargar la base de datos de usuarios'
                    });
                }
                
                let updatedCount = 0;
                
                // Recorrer todos los usuarios y regenerar tokens
                for (const userId in usersData) {
                    if (usersData[userId].token) {
                        usersData[userId].token = generateToken();
                        updatedCount++;
                    }
                }
                
                // Guardar los cambios
                saveJSON(usersData, usersPath);
                
                await interaction.editReply({
                    content: `✅ Se regeneraron ${updatedCount} tokens correctamente.`
                });
            }
            
        } catch (error) {
            console.error('Error en comando admin:', error);
            await interaction.editReply({
                content: '❌ Error.'
            });
        }
    }
};