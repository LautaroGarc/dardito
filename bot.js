const { Client, GatewayIntentBits, Collection, Routes, REST, ActivityType } = require('discord.js');
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

// Variables para rastrear tiempo en canales de voz
const voiceStats = new Map();

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

// Función para verificar y avanzar sprints
function checkAndAdvanceSprints() {
  console.log('[ S ] Verificando sprints...');
  
  try {
    const dbPath = path.join(__dirname, 'databases', 'db.json');
    const dbData = loadJSON(dbPath);
    
    const today = new Date();
    const todayArray = [today.getDate(), today.getMonth() + 1, today.getFullYear()];
    let updated = false;
    
    for (const groupName in dbData) {
      const group = dbData[groupName];
      
      // Verificar si el grupo tiene datos y ha empezado
      if (!group || !group.started || group.started !== 'y') continue;
      
      // Verificar GenT
      if (group.GenT) {
        const currentSprint = parseInt(group.GenT.sprintActual);
        const currentSprintData = group.GenT[`sprint${currentSprint}`];
        
        if (currentSprintData && arraysEqual(currentSprintData.fechaFin, todayArray)) {
          const nextSprint = currentSprint + 1;
          
          // Crear nuevo sprint si no existe
          if (!group.GenT[`sprint${nextSprint}`]) {
            const newEndDate = new Date(today);
            newEndDate.setDate(newEndDate.getDate() + (group['duracion-sprint-gent'] * 7));
            
            group.GenT[`sprint${nextSprint}`] = {
              fechaIni: [...todayArray],
              fechaFin: [newEndDate.getDate(), newEndDate.getMonth() + 1, newEndDate.getFullYear()],
              scrumBoard: [],
              tasks: {}
            };
          }
          
          group.GenT.sprintActual = nextSprint.toString();
          updated = true;
          console.log(`[ S ] ${groupName} - GenT avanzó al sprint ${nextSprint}`);
        }
      }
      
      // Verificar Proy
      if (group.Proy) {
        const currentSprint = parseInt(group.Proy.sprintActual);
        const currentSprintData = group.Proy[`sprint${currentSprint}`];
        
        if (currentSprintData && arraysEqual(currentSprintData.fechaFin, todayArray)) {
          const nextSprint = currentSprint + 1;
          
          // Crear nuevo sprint si no existe
          if (!group.Proy[`sprint${nextSprint}`]) {
            const newEndDate = new Date(today);
            newEndDate.setDate(newEndDate.getDate() + (group['duracion-sprint-proyecto'] * 7));
            
            group.Proy[`sprint${nextSprint}`] = {
              fechaIni: [...todayArray],
              fechaFin: [newEndDate.getDate(), newEndDate.getMonth() + 1, newEndDate.getFullYear()],
              scrumBoard: [],
              tasks: {}
            };
          }
          
          group.Proy.sprintActual = nextSprint.toString();
          updated = true;
          console.log(`[ S ] ${groupName} - Proy avanzó al sprint ${nextSprint}`);
        }
      }
    }
    
    if (updated) {
      saveJSON(dbData, dbPath);
      console.log('[ S ] Base de datos actualizada con nuevos sprints');
    }
  } catch (error) {
    console.error('[ X ] Error al verificar sprints:', error);
  }
}

// Función auxiliar para comparar arrays de fechas
function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((val, i) => val === b[i]);
}

// Función para actualizar estadísticas de voz
function updateVoiceStats(userId, seconds) {
  try {
    const usersPath = path.join(__dirname, 'databases', 'users.json');
    const usersData = loadJSON(usersPath);
    
    if (usersData[userId]) {
      usersData[userId].stats[0] += seconds;
      saveJSON(usersData, usersPath);
      console.log(`[ V ] Usuario ${userId} - ${seconds}s agregados (Total: ${usersData[userId].stats[0]}s)`);
    }
  } catch (error) {
    console.error('[ X ] Error al actualizar estadísticas de voz:', error);
  }
}

// READY
client.once('clientReady', async () => {
  console.log(`[ + ] Bot conectado como ${client.user.tag}`);
  
  const guild = client.guilds.cache.get(config.discord.guildId);
  
  client.user.setPresence({
    name: 'DASHBOARD DARDITO WEB',
    type: ActivityType.Streaming,
    state: 'Dashboard Grupos - Dardito',
    buttons: [{ label: 'Dashboard Dardito WEB', url: 'https://right-mite-infinite.ngrok-free.app' }]
  }); 

  // TAREAS PROGRAMADAS
  const cron = require('node-cron');
  
  // Ejecutar verificación de sprints todos los días a las 00:01 hora argentina (GMT-3)
  cron.schedule('1 0 * * *', () => {
    checkAndAdvanceSprints();
  }, {
    timezone: "America/Argentina/Buenos_Aires"
  });
  
  console.log('[ + ] Bot completamente inicializado');
});

// EVENTOS DE VOZ - Rastrear tiempo en canales de voz
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;
  const now = Date.now();
  
  // Usuario se conecta a un canal de voz
  if (!oldState.channelId && newState.channelId) {
    voiceStats.set(userId, now);
    console.log(`[ V ] Usuario ${userId} se conectó a canal de voz`);
  }
  
  // Usuario se desconecta de un canal de voz
  else if (oldState.channelId && !newState.channelId) {
    const joinTime = voiceStats.get(userId);
    if (joinTime) {
      const timeSpent = Math.floor((now - joinTime) / 1000); // Convertir a segundos
      updateVoiceStats(userId, timeSpent);
      voiceStats.delete(userId);
    }
  }
  
  // Usuario cambia de canal de voz
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const joinTime = voiceStats.get(userId);
    if (joinTime) {
      const timeSpent = Math.floor((now - joinTime) / 1000);
      updateVoiceStats(userId, timeSpent);
      voiceStats.set(userId, now); // Reiniciar contador para el nuevo canal
    }
  }
});

// Guardar estadísticas pendientes cuando el bot se desconecta
client.on('disconnect', () => {
  const now = Date.now();
  for (const [userId, joinTime] of voiceStats.entries()) {
    const timeSpent = Math.floor((now - joinTime) / 1000);
    updateVoiceStats(userId, timeSpent);
  }
  voiceStats.clear();
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