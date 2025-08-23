const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config.json');

const app = express();

// Configuración
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: config.web.sessionSecret || 'dardito_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 4 * 60 * 60 * 1000 }
}));

// Middleware de autenticación (modificado para auditores)
async function authenticate(req, res, next) {
  // EXCLUIR estas rutas del middleware completo
  if (['/login', '/auth', '/proyecto-no-iniciado'].includes(req.path)) {
    return next();
  }
  
  // Para la ruta /iniciar-proyecto (GET y POST), solo verificar autenticación básica
  if (req.path === '/iniciar-proyecto') {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    try {
      const usersData = await fs.readFile('./databases/users.json', 'utf8');
      const users = JSON.parse(usersData);
      
      if (!users[req.session.user.id]) {
        req.session.destroy();
        return res.redirect('/login');
      }
      
      req.userData = users[req.session.user.id];
      return next();
    } catch (error) {
      console.error('Error de autenticación:', error);
      return res.redirect('/login');
    }
  }
  
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    if (!users[req.session.user.id]) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    req.userData = users[req.session.user.id];
    
    // Los admins y auditores no necesitan verificar el estado del proyecto
    if (req.userData.rol === 'admin' || req.userData.rol === 'auditor') {
      return next();
    }
    
    next();
  } catch (error) {
    console.error('Error de autenticación:', error);
    res.redirect('/login');
  }
}

app.use(authenticate);

// Ruta de login
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Procesar login (modificado para detectar auditores)
app.post('/auth', async (req, res) => {
  const { token } = req.body;
  
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    // Buscar usuario por token
    const userEntry = Object.entries(users).find(([id, user]) => user.token === token);
    
    if (userEntry) {
      const [userId, userData] = userEntry;
      
      req.session.user = {
        id: userId,
        nickname: userData.nickname,
        grupo: userData.grupo,
        rol: userData.rol,
        token: userData.token
      };
      
      // ADMIN/AUDITOR: Redirigir directamente al dashboard sin verificar proyecto
      if (userData.rol === 'admin' || userData.rol === 'auditor') {
        return res.redirect('/dashboard');
      }
      
      // Verificar estado del proyecto (solo para no-admins)
      const dbData = await leerDB();
      const grupoData = dbData[userData.grupo] || {};
      
      if (!grupoData.started || grupoData.started !== 'y') {
        if (userData.rol === 'lider') {
          return res.redirect('/iniciar-proyecto');
        } else {
          return res.redirect('/proyecto-no-iniciado');
        }
      }
      
      // Redirigir al dashboard correspondiente
      return res.redirect('/dashboard');
    }
    
    res.render('login', { error: 'Token inválido' });
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.render('login', { error: 'Error del servidor' });
  }
});

// Ruta para inicializar proyecto (solo líderes)
app.get('/iniciar-proyecto', async (req, res) => {
  // Si no hay sesión, redirigir al login
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
    // Cargar userData manualmente para esta ruta
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const userData = users[req.session.user.id];
    
    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    if (userData.rol !== 'lider') {
      return res.status(403).send('Solo los líderes pueden acceder a esta página');
    }
    
    res.render('iniciar-proyecto', { 
      user: userData,
      equipo: userData.grupo
    });
  } catch (error) {
    console.error('Error en iniciar-proyecto:', error);
    res.redirect('/login');
  }
});

// Procesar inicialización de proyecto (modificado)
app.post('/iniciar-proyecto', async (req, res) => {
  try {
    // Cargar userData manualmente para esta ruta
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const userData = users[req.session.user.id];
    
    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    if (userData.rol !== 'lider') {
      return res.status(403).send('Solo los líderes pueden inicializar proyectos');
    }
    
    const { cantidadProyectos, duracionSprintGenT, duracionSprintProy, duracionSprintProy2 } = req.body;
    const equipo = userData.grupo;
    
    // Leer datos actuales
    const dbData = await leerDB();
    
    // Crear estructura del grupo
    dbData[equipo] = {
      started: 'y',
      "duracion-sprint-gent": parseInt(duracionSprintGenT),
      "duracion-sprint-proyecto": parseInt(duracionSprintProy),
      "GenT": {
        "sprintActual": "1",
        "productBacklog": [],
        "sprint1": {
          "fechaIni": obtenerFechaActual(),
          "fechaFin": calcularFechaFin(parseInt(duracionSprintGenT)),
          "scrumBoard": [],
          "tasks": {}
        }
      },
      "Proy": {
        "sprintActual": "1",
        "productBacklog": [],
        "sprint1": {
          "fechaIni": obtenerFechaActual(),
          "fechaFin": calcularFechaFin(parseInt(duracionSprintProy)),
          "scrumBoard": [],
          "tasks": {}
        }
      }
    };
    
    // Agregar tercer proyecto si se seleccionó
    if (parseInt(cantidadProyectos) === 3) {
      dbData[equipo]["duracion-sprint-proyecto2"] = parseInt(duracionSprintProy2);
      dbData[equipo]["Proy2"] = {
        "sprintActual": "1",
        "productBacklog": [],
        "sprint1": {
          "fechaIni": obtenerFechaActual(),
          "fechaFin": calcularFechaFin(parseInt(duracionSprintProy2)),
          "scrumBoard": [],
          "tasks": {}
        }
      };
    } else {
      dbData[equipo]["Proy2"] = null;
    }
    
    // Guardar cambios
    await guardarDB(dbData);
    
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('Error al inicializar proyecto:', error);
    res.status(500).send('Error al inicializar el proyecto');
  }
});

// Ruta para proyecto no iniciado
app.get('/proyecto-no-iniciado', async (req, res) => {
  // Si no hay sesión, redirigir al login
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
    // Cargar userData manualmente para esta ruta
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const userData = users[req.session.user.id];
    
    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    res.render('proyecto-no-iniciado', { 
      user: userData,
      equipo: userData.grupo
    });
  } catch (error) {
    console.error('Error en proyecto-no-iniciado:', error);
    res.redirect('/login');
  }
});

// Ruta del dashboard principal (modificada para auditores)
app.get('/dashboard', async (req, res) => {
  try {
    // Para administradores y auditores, cargar todos los datos
    if (req.userData.rol === 'admin' || req.userData.rol === 'auditor') {
      const dbData = await leerDB();
      
      // Renderizar dashboard de admin con todos los datos
      return res.render('admin', {
        user: req.userData,
        grupos: dbData  // Todos los datos de todos los grupos
      });
    }
    
    // Para otros roles, seguir el flujo normal
    const dbData = await leerDB();
    const grupoData = dbData[req.userData.grupo] || {};
    
    // Verificar que el proyecto está iniciado
    if (!grupoData.started || grupoData.started !== 'y') {
      if (req.userData.rol === 'lider') {
        return res.redirect('/iniciar-proyecto');
      } else {
        return res.redirect('/proyecto-no-iniciado');
      }
    }
    
    // Renderizar dashboard según el rol del usuario
    const vistaDashboard = obtenerVistaPorRol(req.userData.rol);
    res.render(vistaDashboard, {
      user: req.userData,
      grupo: req.userData.grupo,
      datos: grupoData
    });
    
  } catch (error) {
    console.error('Error al cargar dashboard:', error);
    res.status(500).send('Error al cargar el dashboard');
  }
});

// Ruta de logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Funciones auxiliares
function obtenerFechaActual() {
  const now = new Date();
  return [now.getDate(), now.getMonth() + 1, now.getFullYear()];
}

function calcularFechaFin(semanas) {
  const now = new Date();
  now.setDate(now.getDate() + (semanas * 7));
  return [now.getDate(), now.getMonth() + 1, now.getFullYear()];
}

function obtenerVistaPorRol(rol) {
  const vistas = {
    'miembro': 'miembro',
    'scrumMaster': 'scrumMaster', 
    'lider': 'lider',
    'admin': 'admin',
    'auditor': 'admin'  // Los auditores usan la vista admin
  };
  return vistas[rol] || 'miembro';
}

// Leer db.json
async function leerDB() {
  try {
    const data = await fs.readFile('./databases/db.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error leyendo db.json:', error);
    // Devolver estructura básica si el archivo no existe
    return {
      "Grupo1": {},
      "Grupo2": {},
      "Grupo3": {},
      "Grupo4": {}
    };
  }
}

// Guardar en db.json
async function guardarDB(data) {
  try {
    await fs.writeFile('./databases/db.json', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error guardando db.json:', error);
    return false;
  }
}

// Iniciar servidor
const PORT = config.web.port || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web ejecutándose en http://localhost:${PORT}`);
});

// Inicializar archivos si no existen
async function inicializarArchivos() {
  try {
    // Verificar si db.json existe, sino crearlo
    try {
      await fs.access('./databases/db.json');
    } catch {
      const estructuraInicial = {
        "Grupo1": {},
        "Grupo2": {},
        "Grupo3": {},
        "Grupo4": {}
      };
      await fs.writeFile('./databases/db.json', JSON.stringify(estructuraInicial, null, 2));
      console.log('✅ db.json creado con estructura inicial');
    }
    
    // Verificar si users.json existe
    try {
      await fs.access('./databases/users.json');
    } catch {
      console.log('⚠️  users.json no encontrado en la carpeta databases');
    }
    
  } catch (error) {
    console.error('Error inicializando archivos:', error);
  }
}

// Inicializar al iniciar
inicializarArchivos();