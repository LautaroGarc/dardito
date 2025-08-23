const { Client, GatewayIntentBits, Collection, Routes, REST } = require('discord.js');
const { loadJSON, saveJSON } = require('./functions.js')
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[ + ] Comando cargado: ${command.data.name}`);
  }

  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
  try {
    console.log('[ + ] Registrando comandos slash en Discord...');
    
    const data = await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );
    
    console.log(`[ + ] ${data.length} comandos registrados en Discord`);
  } catch (error) {
    console.error('[ + ] Error al registrar comandos:', error);
  }
})();

// READY
client.once('clientReady', async () => {
  console.log(`[ + ] Bot conectado como ${client.user.tag}`);
  
  const guild = client.guilds.cache.get(config.discord.guildId);
  
  // TAREAS PROGRAMADAS
  const cron = require('node-cron');
  cron.schedule('0 0 * * *', () => {
    
  });
  
  client.user.setActivity('/contraseña', { type: 'LISTENING' });
  
  console.log('[ + ] Bot completamente inicializado');
});

// SLASH
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[ X ] Error en comando ${interaction.commandName}:`, error);
    
    const errorMessage = { content: '[ X ] Error al ejecutar el comando', ephemeral: true };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// INICIAR CLIENT
client.login(config.discord.token).catch(console.error);