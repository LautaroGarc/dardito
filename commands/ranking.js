const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadJSON } = require('../functions.js');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Muestra el ranking de tiempo en llamadas de voz'),
    
    async execute(interaction) {
        try {
            const usersPath = path.join(__dirname, '..', 'databases', 'users.json');
            const usersData = loadJSON(usersPath);
            
            // Crear array con usuarios que tienen tiempo en llamadas > 0
            const usersWithVoiceTime = [];
            
            // Recorrer todos los objetos de users.json
            for (const [userId, userData] of Object.entries(usersData)) {
                // Verificar que tenga stats y tiempo en llamadas > 0
                if (userData.stats && Array.isArray(userData.stats) && userData.stats[0] > 0) {
                    usersWithVoiceTime.push({
                        nickname: userData.nickname || 'Sin nickname',
                        tiempoVoz: userData.stats[0] || 0,
                        userId: userId
                    });
                }
            }
            
            if (usersWithVoiceTime.length === 0) {
                return await interaction.reply({
                    content: '📊 No hay usuarios con tiempo en llamadas registrado todavía.',
                    ephemeral: true
                });
            }
            
            // Ordenar por tiempo en voz (descendente)
            usersWithVoiceTime.sort((a, b) => b.tiempoVoz - a.tiempoVoz);
            
            // Crear embed del ranking
            const embed = new EmbedBuilder()
                .setTitle('🎙️ Ranking de Tiempo en Llamadas')
                .setColor('#0099ff')
                .setDescription(`Miembros con tiempo en canales de voz\nTotal: ${usersWithVoiceTime.length} usuarios`)
                .setTimestamp();
            
            // Agregar cada usuario al embed
            usersWithVoiceTime.forEach((user, index) => {
                // Convertir segundos a formato legible
                const horas = Math.floor(user.tiempoVoz / 3600);
                const minutos = Math.floor((user.tiempoVoz % 3600) / 60);
                const segundos = user.tiempoVoz % 60;
                
                // Formatear el tiempo
                let tiempoFormateado = '';
                if (horas > 0) tiempoFormateado += `${horas}h `;
                if (minutos > 0) tiempoFormateado += `${minutos}m `;
                tiempoFormateado += `${segundos}s`;
                
                embed.addFields({
                    name: `#${index + 1} - ${user.nickname}`,
                    value: `⏰ ${tiempoFormateado}`,
                    inline: false
                });
            });
            
            // Agregar estadísticas generales
            const totalTiempo = usersWithVoiceTime.reduce((sum, user) => sum + user.tiempoVoz, 0);
            const promedioTiempo = totalTiempo / usersWithVoiceTime.length;
            
            const totalHoras = Math.floor(totalTiempo / 3600);
            const totalMinutos = Math.floor((totalTiempo % 3600) / 60);
            const promedioMinutos = Math.floor(promedioTiempo / 60);
            
            embed.addFields({
                name: '📈 Estadísticas Generales',
                value: `Tiempo total: ${totalHoras}h ${totalMinutos}m\nPromedio por usuario: ${promedioMinutos}m`,
                inline: false
            });
            
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('[ X ] Error en comando ranking:', error);
            await interaction.reply({
                content: '❌ Error al generar el ranking. Verifica que la base de datos exists.',
                ephemeral: true
            });
        }
    }
};