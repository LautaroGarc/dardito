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

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================
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

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

// Ruta de login
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Procesar login
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

// ============================================
// RUTAS DE INICIALIZACIÓN DE PROYECTO
// ============================================

// Ruta para inicializar proyecto (solo líderes)
app.get('/iniciar-proyecto', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
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

// Procesar inicialización de proyecto
app.post('/iniciar-proyecto', async (req, res) => {
  try {
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
    
    const dbData = await leerDB();
    
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
    
    await guardarDB(dbData);
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('Error al inicializar proyecto:', error);
    res.status(500).send('Error al inicializar el proyecto');
  }
});

// Ruta para proyecto no iniciado
app.get('/proyecto-no-iniciado', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  try {
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

// ============================================
// RUTAS DEL DASHBOARD PRINCIPAL
// ============================================

// Dashboard principal
app.get('/dashboard', async (req, res) => {
  try {
    // Para administradores y auditores, cargar todos los datos
    if (req.userData.rol === 'admin' || req.userData.rol === 'auditor') {
      const dbData = await leerDB();
      const usersData = await fs.readFile('./databases/users.json', 'utf8');
      const users = JSON.parse(usersData);
      
      return res.render('dashboard/admin', {
        user: req.userData,
        grupos: dbData,
        usuarios: users
      });
    }
    
    // Para otros roles, seguir el flujo normal
    const dbData = await leerDB();
    const grupoData = dbData[req.userData.grupo] || {};
    
    if (!grupoData.started || grupoData.started !== 'y') {
      if (req.userData.rol === 'lider') {
        return res.redirect('/iniciar-proyecto');
      } else {
        return res.redirect('/proyecto-no-iniciado');
      }
    }
    
    const vistaDashboard = obtenerVistaPorRol(req.userData.rol);
    res.render(`dashboard/${vistaDashboard}`, {
      user: req.userData,
      grupo: req.userData.grupo,
      datos: grupoData
    });
    
  } catch (error) {
    console.error('Error al cargar dashboard:', error);
    res.status(500).send('Error al cargar el dashboard');
  }
});

// ============================================
// APIs PARA GESTIÓN DE PRODUCT BACKLOG
// ============================================

// Obtener Product Backlog
app.get('/api/product-backlog/:grupo/:proyecto', async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    
    // Verificar permisos
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
    }
    
    const dbData = await leerDB();
    const grupoData = dbData[grupo];
    
    if (!grupoData || !grupoData[proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    res.json({
      productBacklog: grupoData[proyecto].productBacklog || [],
      sprintActual: grupoData[proyecto].sprintActual || "1"
    });
    
  } catch (error) {
    console.error('Error obteniendo product backlog:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Agregar historia de usuario al Product Backlog (solo líderes)
app.post('/api/product-backlog/:grupo/:proyecto/historia', async (req, res) => {
  try {
    if (req.userData.rol !== 'lider' && req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los líderes pueden agregar historias' });
    }
    
    const { grupo, proyecto } = req.params;
    const { como, quiero, para, criterio_aceptacion, prioridad, history_points } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    // Generar ID único para la historia
    const id_hu = `HU${Date.now()}`;
    
    const nuevaHistoria = [
      id_hu,
      como,
      quiero, 
      para,
      criterio_aceptacion,
      prioridad,
      parseInt(history_points),
      "POR_HACER"
    ];
    
    if (!dbData[grupo][proyecto].productBacklog) {
      dbData[grupo][proyecto].productBacklog = [];
    }
    
    dbData[grupo][proyecto].productBacklog.push(nuevaHistoria);
    
    await guardarDB(dbData);
    
    res.json({ success: true, historia: nuevaHistoria });
    
  } catch (error) {
    console.error('Error agregando historia:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cargar historias masivamente desde Excel (solo líderes)
app.post('/api/product-backlog/:grupo/:proyecto/cargar-masivo', async (req, res) => {
  try {
    if (req.userData.rol !== 'lider' && req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los líderes pueden cargar historias masivamente' });
    }
    
    const { grupo, proyecto } = req.params;
    const { historias } = req.body; // Array de historias desde el frontend
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    if (!dbData[grupo][proyecto].productBacklog) {
      dbData[grupo][proyecto].productBacklog = [];
    }
    
    // Procesar cada historia
    const historiasAgregadas = [];
    for (const historia of historias) {
      const id_hu = `HU${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const nuevaHistoria = [
        id_hu,
        historia.como,
        historia.quiero,
        historia.para,
        historia.criterio_aceptacion,
        historia.prioridad,
        parseInt(historia.history_points),
        "POR_HACER"
      ];
      
      dbData[grupo][proyecto].productBacklog.push(nuevaHistoria);
      historiasAgregadas.push(nuevaHistoria);
    }
    
    await guardarDB(dbData);
    
    res.json({ success: true, historiasAgregadas: historiasAgregadas.length });
    
  } catch (error) {
    console.error('Error en carga masiva:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA GESTIÓN DE SPRINTS
// ============================================

// Obtener información del sprint actual
app.get('/api/sprint/:grupo/:proyecto/:sprintNum', async (req, res) => {
  try {
    const { grupo, proyecto, sprintNum } = req.params;
    
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
    }
    
    const dbData = await leerDB();
    const grupoData = dbData[grupo];
    
    if (!grupoData || !grupoData[proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintKey = `sprint${sprintNum}`;
    const sprintData = grupoData[proyecto][sprintKey];
    
    if (!sprintData) {
      return res.status(404).json({ error: 'Sprint no encontrado' });
    }
    
    res.json({
      sprint: sprintData,
      sprintActual: grupoData[proyecto].sprintActual,
      fechaIni: sprintData.fechaIni,
      fechaFin: sprintData.fechaFin,
      scrumBoard: sprintData.scrumBoard || [],
      tasks: sprintData.tasks || {}
    });
    
  } catch (error) {
    console.error('Error obteniendo sprint:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Seleccionar historias para el sprint actual (solo líderes)
app.post('/api/sprint/:grupo/:proyecto/seleccionar-historias', async (req, res) => {
  try {
    if (req.userData.rol !== 'lider' && req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los líderes pueden seleccionar historias para el sprint' });
    }
    
    const { grupo, proyecto } = req.params;
    const { historias_ids } = req.body; // Array de IDs de historias
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintActual = dbData[grupo][proyecto].sprintActual;
    const sprintKey = `sprint${sprintActual}`;
    
    if (!dbData[grupo][proyecto][sprintKey]) {
      return res.status(404).json({ error: 'Sprint actual no encontrado' });
    }
    
    // Actualizar scrumBoard con las historias seleccionadas
    dbData[grupo][proyecto][sprintKey].scrumBoard = historias_ids;
    
    // Actualizar estado de las historias en el product backlog
    if (dbData[grupo][proyecto].productBacklog) {
      dbData[grupo][proyecto].productBacklog = dbData[grupo][proyecto].productBacklog.map(historia => {
        if (historias_ids.includes(historia[0])) { // historia[0] es el ID
          historia[7] = "EN_SPRINT"; // historia[7] es el estado
        }
        return historia;
      });
    }
    
    await guardarDB(dbData);
    
    res.json({ success: true, historiasSeleccionadas: historias_ids.length });
    
  } catch (error) {
    console.error('Error seleccionando historias:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA GESTIÓN DE TAREAS
// ============================================

// Obtener tareas del sprint actual
app.get('/api/tareas/:grupo/:proyecto/:sprintNum', async (req, res) => {
  try {
    const { grupo, proyecto, sprintNum } = req.params;
    
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
    }
    
    const dbData = await leerDB();
    const grupoData = dbData[grupo];
    
    if (!grupoData || !grupoData[proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintKey = `sprint${sprintNum}`;
    const sprintData = grupoData[proyecto][sprintKey];
    
    if (!sprintData) {
      return res.status(404).json({ error: 'Sprint no encontrado' });
    }
    
    // Filtrar tareas del usuario si no es admin/auditor/líder
    let tareas = sprintData.tasks || {};
    
    if (req.userData.rol === 'miembro' || req.userData.rol === 'scrumMaster') {
      // Mostrar solo tareas asignadas al usuario
      const tareasUsuario = {};
      Object.keys(tareas).forEach(taskId => {
        const tarea = tareas[taskId];
        if (tarea[2] && tarea[2].includes(req.userData.nickname)) { // tarea[2] son las personas asignadas
          tareasUsuario[taskId] = tarea;
        }
      });
      tareas = tareasUsuario;
    }
    
    res.json({
      tareas: tareas,
      scrumBoard: sprintData.scrumBoard || []
    });
    
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear nueva tarea técnica (solo líderes)
app.post('/api/tareas/:grupo/:proyecto/crear', async (req, res) => {
  try {
    if (req.userData.rol !== 'lider' && req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los líderes pueden crear tareas' });
    }
    
    const { grupo, proyecto } = req.params;
    const { description, personas_asignadas, prioridad, fecha_limite, historia_id } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintActual = dbData[grupo][proyecto].sprintActual;
    const sprintKey = `sprint${sprintActual}`;
    
    if (!dbData[grupo][proyecto][sprintKey]) {
      return res.status(404).json({ error: 'Sprint actual no encontrado' });
    }
    
    // Generar ID único para la tarea
    const id_task = `TASK${Date.now()}`;
    
    const nuevaTarea = [
      "POR_HACER", // estado
      description,
      personas_asignadas || [], // array de personas asignadas
      prioridad,
      fecha_limite
    ];
    
    if (!dbData[grupo][proyecto][sprintKey].tasks) {
      dbData[grupo][proyecto][sprintKey].tasks = {};
    }
    
    dbData[grupo][proyecto][sprintKey].tasks[id_task] = nuevaTarea;
    
    await guardarDB(dbData);
    
    res.json({ success: true, tarea: { id: id_task, data: nuevaTarea } });
    
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar estado de tarea
app.post('/api/tareas/:grupo/:proyecto/:tareaId/estado', async (req, res) => {
  try {
    const { grupo, proyecto, tareaId } = req.params;
    const { estado } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintActual = dbData[grupo][proyecto].sprintActual;
    const sprintKey = `sprint${sprintActual}`;
    
    if (!dbData[grupo][proyecto][sprintKey] || !dbData[grupo][proyecto][sprintKey].tasks[tareaId]) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    const tarea = dbData[grupo][proyecto][sprintKey].tasks[tareaId];
    
    // Verificar permisos
    if (req.userData.rol === 'miembro' || req.userData.rol === 'scrumMaster') {
      // Solo puede modificar sus propias tareas
      if (!tarea[2].includes(req.userData.nickname)) {
        return res.status(403).json({ error: 'Solo puedes modificar tus propias tareas' });
      }
      
      // Los miembros solo pueden marcar como "EN_PROCESO" o "COMPLETADO" (pre-revisión)
      if (!['EN_PROCESO', 'COMPLETADO'].includes(estado)) {
        return res.status(403).json({ error: 'Estado no permitido para tu rol' });
      }
    }
    
    // Actualizar estado
    dbData[grupo][proyecto][sprintKey].tasks[tareaId][0] = estado;
    
    await guardarDB(dbData);
    
    res.json({ success: true, nuevoEstado: estado });
    
  } catch (error) {
    console.error('Error actualizando estado de tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Asignar tarea (solo líderes)
app.post('/api/tareas/:grupo/:proyecto/:tareaId/asignar', async (req, res) => {
  try {
    if (req.userData.rol !== 'lider' && req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los líderes pueden asignar tareas' });
    }
    
    const { grupo, proyecto, tareaId } = req.params;
    const { personas_asignadas } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintActual = dbData[grupo][proyecto].sprintActual;
    const sprintKey = `sprint${sprintActual}`;
    
    if (!dbData[grupo][proyecto][sprintKey] || !dbData[grupo][proyecto][sprintKey].tasks[tareaId]) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    // Actualizar personas asignadas
    dbData[grupo][proyecto][sprintKey].tasks[tareaId][2] = personas_asignadas;
    
    await guardarDB(dbData);
    
    res.json({ success: true, personasAsignadas: personas_asignadas });
    
  } catch (error) {
    console.error('Error asignando tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA ESTADÍSTICAS
// ============================================

// Obtener estadísticas del proyecto
app.get('/api/estadisticas/:grupo/:proyecto', async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    
    // Verificar permisos (scrum masters, líderes, admins)
    if (!['scrumMaster', 'lider', 'admin', 'auditor'].includes(req.userData.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para ver estadísticas' });
    }
    
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
    }
    
    const dbData = await leerDB();
    const grupoData = dbData[grupo];
    
    if (!grupoData || !grupoData[proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const sprintActual = grupoData[proyecto].sprintActual;
    const sprintKey = `sprint${sprintActual}`;
    const sprintData = grupoData[proyecto][sprintKey];
    
    // Calcular estadísticas básicas
    const totalHistorias = grupoData[proyecto].productBacklog ? grupoData[proyecto].productBacklog.length : 0;
    const historiasEnSprint = sprintData && sprintData.scrumBoard ? sprintData.scrumBoard.length : 0;
    
    let totalTareas = 0;
    let tareasCompletadas = 0;
    let tareasEnProceso = 0;
    
    if (sprintData && sprintData.tasks) {
      totalTareas = Object.keys(sprintData.tasks).length;
      Object.values(sprintData.tasks).forEach(tarea => {
        if (tarea[0] === 'COMPLETADO' || tarea[0] === 'VERIFICADO') {
          tareasCompletadas++;
        } else if (tarea[0] === 'EN_PROCESO') {
          tareasEnProceso++;
        }
      });
    }
    
    const porcentajeCompletado = totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0;
    
    res.json({
      proyecto: {
        totalHistorias,
        historiasEnSprint,
        totalTareas,
        tareasCompletadas,
        tareasEnProceso,
        porcentajeCompletado
      },
      sprint: {
        numero: sprintActual,
        fechaIni: sprintData ? sprintData.fechaIni : null,
        fechaFin: sprintData ? sprintData.fechaFin : null
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas del proyecto:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener estadísticas del equipo (solo líderes, admins)
app.get('/api/estadisticas/equipo/:grupo', async (req, res) => {
  try {
    const { grupo } = req.params;
    
    // Verificar permisos (solo líderes y admins)
    if (!['lider', 'admin', 'auditor'].includes(req.userData.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para ver estadísticas del equipo' });
    }
    
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
    }
    
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    // Obtener miembros del grupo
    const miembrosGrupo = Object.entries(users).filter(([id, user]) => user.grupo === grupo);
    
    const estadisticasMiembros = miembrosGrupo.map(([id, user]) => {
      const stats = user.stats || [0, 0, 0];
      return {
        id: id,
        nickname: user.nickname,
        rol: user.rol,
        tiempoLlamada: stats[0], // segundos en llamada
        tareasAsignadas: stats[1],
        tareasCompletadas: stats[2],
        porcentajeCompletado: stats[1] > 0 ? Math.round((stats[2] / stats[1]) * 100) : 0
      };
    });
    
    res.json({
      grupo: grupo,
      miembros: estadisticasMiembros,
      totalMiembros: miembrosGrupo.length
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas del equipo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener todas las estadísticas (solo admins)
app.get('/api/estadisticas/global', async (req, res) => {
  try {
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor') {
      return res.status(403).json({ error: 'Solo los administradores pueden ver estadísticas globales' });
    }
    
    const dbData = await leerDB();
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    const estadisticasGlobales = {};
    
    // Procesar cada grupo
    Object.keys(dbData).forEach(nombreGrupo => {
      const grupoData = dbData[nombreGrupo];
      
      if (!grupoData.started) {
        estadisticasGlobales[nombreGrupo] = {
          iniciado: false,
          proyectos: {}
        };
        return;
      }
      
      const proyectos = {};
      
      ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
        if (grupoData[proyecto]) {
          const proyectoData = grupoData[proyecto];
          const sprintActual = proyectoData.sprintActual;
          const sprintKey = `sprint${sprintActual}`;
          const sprintData = proyectoData[sprintKey];
          
          let totalTareas = 0;
          let tareasCompletadas = 0;
          
          if (sprintData && sprintData.tasks) {
            totalTareas = Object.keys(sprintData.tasks).length;
            Object.values(sprintData.tasks).forEach(tarea => {
              if (tarea[0] === 'COMPLETADO' || tarea[0] === 'VERIFICADO') {
                tareasCompletadas++;
              }
            });
          }
          
          proyectos[proyecto] = {
            sprintActual: sprintActual,
            totalHistorias: proyectoData.productBacklog ? proyectoData.productBacklog.length : 0,
            historiasEnSprint: sprintData && sprintData.scrumBoard ? sprintData.scrumBoard.length : 0,
            totalTareas: totalTareas,
            tareasCompletadas: tareasCompletadas,
            porcentajeCompletado: totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0
          };
        }
      });
      
      estadisticasGlobales[nombreGrupo] = {
        iniciado: true,
        proyectos: proyectos
      };
    });
    
    res.json(estadisticasGlobales);
    
  } catch (error) {
    console.error('Error obteniendo estadísticas globales:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA ADMINISTRACIÓN (Solo Admins)
// ============================================

// Obtener todos los usuarios
app.get('/api/admin/usuarios', async (req, res) => {
  try {
    if (req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden acceder a esta información' });
    }
    
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    // Filtrar información sensible (no mostrar tokens)
    const usuariosSinToken = Object.entries(users).map(([id, user]) => ({
      id: id,
      nickname: user.nickname,
      rol: user.rol,
      grupo: user.grupo,
      stats: user.stats || [0, 0, 0]
    }));
    
    res.json(usuariosSinToken);
    
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cambiar usuario de equipo (solo admins)
app.post('/api/admin/usuarios/:userId/cambiar-grupo', async (req, res) => {
  try {
    if (req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden cambiar usuarios de grupo' });
    }
    
    const { userId } = req.params;
    const { nuevoGrupo } = req.body;
    
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    if (!users[userId]) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const gruposValidos = ['Grupo1', 'Grupo2', 'Grupo3', 'Grupo4', 'Admin'];
    if (!gruposValidos.includes(nuevoGrupo)) {
      return res.status(400).json({ error: 'Grupo no válido' });
    }
    
    // Cambiar grupo del usuario
    users[userId].grupo = nuevoGrupo;
    
    // Resetear estadísticas (como indica la documentación)
    users[userId].stats = [0, 0, 0];
    
    await fs.writeFile('./databases/users.json', JSON.stringify(users, null, 2));
    
    // También actualizar las tareas asignadas a @NoAsignado en todos los proyectos
    const dbData = await leerDB();
    Object.keys(dbData).forEach(grupo => {
      if (dbData[grupo].started) {
        ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
          if (dbData[grupo][proyecto]) {
            const sprintActual = dbData[grupo][proyecto].sprintActual;
            for (let i = 1; i <= parseInt(sprintActual); i++) {
              const sprintKey = `sprint${i}`;
              if (dbData[grupo][proyecto][sprintKey] && dbData[grupo][proyecto][sprintKey].tasks) {
                Object.keys(dbData[grupo][proyecto][sprintKey].tasks).forEach(taskId => {
                  const tarea = dbData[grupo][proyecto][sprintKey].tasks[taskId];
                  if (tarea[2] && tarea[2].includes(users[userId].nickname)) {
                    // Remover de personas asignadas y agregar @NoAsignado
                    tarea[2] = tarea[2].filter(nombre => nombre !== users[userId].nickname);
                    if (!tarea[2].includes('@NoAsignado')) {
                      tarea[2].push('@NoAsignado');
                    }
                  }
                });
              }
            }
          }
        });
      }
    });
    
    await guardarDB(dbData);
    
    res.json({ success: true, mensaje: 'Usuario cambiado de grupo exitosamente' });
    
  } catch (error) {
    console.error('Error cambiando usuario de grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener información completa de todos los equipos (solo admins)
app.get('/api/admin/equipos', async (req, res) => {
  try {
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor') {
      return res.status(403).json({ error: 'Solo los administradores pueden acceder a esta información' });
    }
    
    const dbData = await leerDB();
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    const equiposCompletos = {};
    
    Object.keys(dbData).forEach(nombreGrupo => {
      const grupoData = dbData[nombreGrupo];
      
      // Obtener miembros del grupo
      const miembrosGrupo = Object.entries(users)
        .filter(([id, user]) => user.grupo === nombreGrupo)
        .map(([id, user]) => ({
          id: id,
          nickname: user.nickname,
          rol: user.rol
        }));
      
      equiposCompletos[nombreGrupo] = {
        miembros: miembrosGrupo,
        proyectos: grupoData,
        iniciado: grupoData.started === 'y'
      };
    });
    
    res.json(equiposCompletos);
    
  } catch (error) {
    console.error('Error obteniendo información de equipos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Modificar datos de cualquier equipo (solo admins)
app.post('/api/admin/equipos/:grupo/modificar', async (req, res) => {
  try {
    if (req.userData.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden modificar datos de equipos' });
    }
    
    const { grupo } = req.params;
    const { datosModificados } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo]) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    
    // Aplicar modificaciones (esto permite flexibilidad total al admin)
    Object.assign(dbData[grupo], datosModificados);
    
    await guardarDB(dbData);
    
    res.json({ success: true, mensaje: 'Datos del equipo modificados exitosamente' });
    
  } catch (error) {
    console.error('Error modificando datos del equipo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTA DE LOGOUT
// ============================================
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================
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

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = config.web.port || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web ejecutándose en https://right-mite-infinite.ngrok-free.app`);
});

// Inicializar al iniciar
inicializarArchivos();