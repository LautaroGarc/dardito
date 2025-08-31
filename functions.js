const crypto = require('crypto');
const fs = require('fs');

// TOKENS

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function regenerateToken(users, userId){
  users[userId].token = generateToken();
  return users;
}

// FUNCIONES PARA LEER JSON
function loadJSON(path) {
  try {
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, JSON.stringify({}));
      return {};
    }
    const data = fs.readFileSync(path, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error al cargar JSON:', error);
    return {};
  }
}

function saveJSON(data, path) {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error al guardar JSON:', error);
  }
}

// USERS INIT

async function loadUsersDatabase(guild) {
  console.log('[ U ] Actualizando base de datos de usuarios...');
  
  try {
    await guild.members.fetch();
    
    guild.members.cache.forEach(member => {
      if (member.user.bot) return;
      
      const userId = member.user.id;
      
      if (!users[userId]) {
        users[userId] = {
          nickname: member.nickname || member.user.username,
          grupo: getGroupFromMember(member),
          token: generateToken(),
          stats: [0, 0, 0]
        };
        updated = true;
        console.log(`[ + ] Usuario añadido: ${member.user.tag}`);
      }
    });
    
    if (updated) await saveUsers();
  } catch (error) {
    console.error('[ X ] Error al actualizar usuarios:', error);
  }
}

// USER --> GRUPO

function getGroupFromMember(member) {
  const groupRole = member.roles.cache.find(role => 
    role.name.startsWith('Grupo') && /^Grupo[1-4]$/.test(role.name)
  );
  return groupRole ? groupRole.name : 'Sin grupo';
}

// FUNCION QUE LEE LOS XLSX 

module.exports = { loadJSON, saveJSON, regenerateToken, generateToken, getGroupFromMember }