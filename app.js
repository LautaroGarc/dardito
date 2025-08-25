const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config.json');

const app = express();

// ============================================
// CONFIGURACIÓN DEL SERVIDOR EXPRESS
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: config.web.sessionSecret || 'dardito_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 4 * 60 * 60 * 1000 } // 4 horas
}));

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN Y AUTORIZACIÓN
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
  
  // Verificación de autenticación general
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

// Middleware para verificar roles específicos
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.userData || !roles.includes(req.userData.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso' });
    }
    next();
  };
}

app.use(authenticate);

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

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
app.get('/iniciar-proyecto', requireRole(['lider']), async (req, res) => {
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const userData = users[req.session.user.id];
    
    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
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

app.post('/iniciar-proyecto', requireRole(['lider']), async (req, res) => {
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const userData = users[req.session.user.id];
    
    if (!userData) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    const { cantidadProyectos, duracionSprintGenT, duracionSprintProy, duracionSprintProy2 } = req.body;
    const equipo = userData.grupo;
    
    const dbData = await leerDB();
    
    // Inicializar estructura del proyecto
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
          "tasks": {},
          "burndownChart": { // Para estadísticas avanzadas
            "plannedWork": [],
            "actualWork": []
          }
        }
      },
      "Proy": {
        "sprintActual": "1",
        "productBacklog": [],
        "sprint1": {
          "fechaIni": obtenerFechaActual(),
          "fechaFin": calcularFechaFin(parseInt(duracionSprintProy)),
          "scrumBoard": [],
          "tasks": {},
          "burndownChart": {
            "plannedWork": [],
            "actualWork": []
          }
        }
      },
      "estadisticas": {
        "velocidadEquipo": [],
        "satisfaccionCliente": [],
        "metricas": {
          "totalStoryPoints": 0,
          "completedStoryPoints": 0,
          "averageVelocity": 0
        }
      }
    };
    
    // Agregar segundo proyecto si es necesario
    if (parseInt(cantidadProyectos) === 3) {
      dbData[equipo]["duracion-sprint-proyecto2"] = parseInt(duracionSprintProy2);
      dbData[equipo]["Proy2"] = {
        "sprintActual": "1",
        "productBacklog": [],
        "sprint1": {
          "fechaIni": obtenerFechaActual(),
          "fechaFin": calcularFechaFin(parseInt(duracionSprintProy2)),
          "scrumBoard": [],
          "tasks": {},
          "burndownChart": {
            "plannedWork": [],
            "actualWork": []
          }
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
// DASHBOARD PRINCIPAL CON RENDER DINÁMICO
// ============================================
app.get('/dashboard', async (req, res) => {
  try {
    const rol = req.userData.rol;
    
    // Dashboard Admin - Ver todos los equipos y estadísticas globales
    if (rol === 'admin' || rol === 'auditor') {
      const dbData = await leerDB();
      const usersData = await fs.readFile('./databases/users.json', 'utf8');
      const users = JSON.parse(usersData);
      
      // Calcular estadísticas globales
      const estadisticasGlobales = await calcularEstadisticasGlobales(dbData, users);
      const composicionEquipos = calcularComposicionEquipos(users);
      
      return res.render('dashboard/admin', {
        user: req.userData,
        grupos: dbData,
        usuarios: users,
        estadisticasGlobales,
        composicionEquipos
      });
    }
    
    // Para otros roles, verificar estado del proyecto
    const dbData = await leerDB();
    const grupoData = dbData[req.userData.grupo] || {};
    
    if (!grupoData.started || grupoData.started !== 'y') {
      if (req.userData.rol === 'lider') {
        return res.redirect('/iniciar-proyecto');
      } else {
        return res.redirect('/proyecto-no-iniciado');
      }
    }
    
    // Dashboard Líder - Estadísticas completas y gestión completa
    if (rol === 'lider') {
      const estadisticasCompletas = await calcularEstadisticasLider(grupoData, req.userData.grupo);
      const usersData = await fs.readFile('./databases/users.json', 'utf8');
      const users = JSON.parse(usersData);
      const miembrosEquipo = Object.values(users).filter(user => user.grupo === req.userData.grupo);
      
      return res.render('dashboard/lider', {
        user: req.userData,
        grupo: req.userData.grupo,
        datos: grupoData,
        estadisticas: estadisticasCompletas,
        miembrosEquipo
      });
    }
    
    // Dashboard Scrum Master - Vista de gestión y estadísticas del equipo
    if (rol === 'scrumMaster') {
      const estadisticasEquipo = await calcularEstadisticasEquipo(grupoData, req.userData.grupo);
      
      return res.render('dashboard/scrumMaster', {
        user: req.userData,
        grupo: req.userData.grupo,
        datos: grupoData,
        estadisticas: estadisticasEquipo
      });
    }
    
    // Dashboard Miembro - Vista básica de proyectos y tareas
    if (rol === 'miembro') {
      const tareasPersonales = await obtenerTareasPersonales(grupoData, req.userData.nickname);
      
      return res.render('dashboard/miembro', {
        user: req.userData,
        grupo: req.userData.grupo,
        datos: grupoData,
        tareasPersonales
      });
    }
    
    // Fallback
    res.status(403).send('Rol no reconocido');
    
  } catch (error) {
    console.error('Error al cargar dashboard:', error);
    res.status(500).send('Error al cargar el dashboard');
  }
});

// ============================================
// NAVEGACIÓN ENTRE PROYECTOS
// ============================================
app.get('/proyecto/:nombreProyecto', async (req, res) => {
  try {
    const { nombreProyecto } = req.params;
    const proyectosValidos = ['GenT', 'Proy', 'Proy2'];
    
    if (!proyectosValidos.includes(nombreProyecto)) {
      return res.status(404).send('Proyecto no encontrado');
    }
    
    const dbData = await leerDB();
    const grupoData = dbData[req.userData.grupo];
    
    if (!grupoData || !grupoData[nombreProyecto]) {
      return res.status(404).send('Proyecto no disponible para tu equipo');
    }
    
    const proyectoData = grupoData[nombreProyecto];
    const estadisticasProyecto = calcularEstadisticasProyecto(proyectoData);
    
    res.render(`proyecto/${nombreProyecto.toLowerCase()}`, {
      user: req.userData,
      grupo: req.userData.grupo,
      proyecto: proyectoData,
      nombreProyecto,
      estadisticas: estadisticasProyecto
    });
    
  } catch (error) {
    console.error('Error al cargar proyecto:', error);
    res.status(500).send('Error al cargar el proyecto');
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
    
    // Calcular estadísticas del backlog
    const productBacklog = grupoData[proyecto].productBacklog || [];
    const estadisticasBacklog = calcularEstadisticasBacklog(productBacklog);
    
    res.json({
      productBacklog,
      sprintActual: grupoData[proyecto].sprintActual || "1",
      estadisticas: estadisticasBacklog
    });
    
  } catch (error) {
    console.error('Error obteniendo product backlog:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Agregar historia de usuario al Product Backlog
app.post('/api/product-backlog/:grupo/:proyecto/historia', requireRole(['lider', 'admin']), async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    const { como, quiero, para, criterio_aceptacion, prioridad, history_points } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    // Generar ID único para la historia
    const id_hu = `HU${Date.now()}`;
    const fechaCreacion = new Date().toISOString();
    
    const nuevaHistoria = [
      id_hu,
      como,
      quiero, 
      para,
      criterio_aceptacion,
      prioridad,
      parseInt(history_points),
      "POR_HACER", // estado
      fechaCreacion, // fecha de creación
      req.userData.nickname // creado por
    ];
    
    if (!dbData[grupo][proyecto].productBacklog) {
      dbData[grupo][proyecto].productBacklog = [];
    }
    
    dbData[grupo][proyecto].productBacklog.push(nuevaHistoria);
    
    // Actualizar métricas del proyecto
    if (!dbData[grupo].estadisticas) {
      dbData[grupo].estadisticas = { metricas: { totalStoryPoints: 0 } };
    }
    dbData[grupo].estadisticas.metricas.totalStoryPoints += parseInt(history_points);
    
    await guardarDB(dbData);
    
    res.json({ success: true, historia: nuevaHistoria });
    
  } catch (error) {
    console.error('Error agregando historia:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cargar historias masivamente desde Excel
app.post('/api/product-backlog/:grupo/:proyecto/cargar-masivo', requireRole(['lider', 'admin']), async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    const { historias } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    if (!dbData[grupo][proyecto].productBacklog) {
      dbData[grupo][proyecto].productBacklog = [];
    }
    
    const historiasAgregadas = [];
    let totalStoryPoints = 0;
    
    for (const historia of historias) {
      const id_hu = `HU${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fechaCreacion = new Date().toISOString();
      
      const nuevaHistoria = [
        id_hu,
        historia.como,
        historia.quiero,
        historia.para,
        historia.criterio_aceptacion,
        historia.prioridad,
        parseInt(historia.history_points),
        "POR_HACER",
        fechaCreacion,
        req.userData.nickname
      ];
      
      dbData[grupo][proyecto].productBacklog.push(nuevaHistoria);
      historiasAgregadas.push(nuevaHistoria);
      totalStoryPoints += parseInt(historia.history_points);
    }
    
    // Actualizar métricas
    if (!dbData[grupo].estadisticas) {
      dbData[grupo].estadisticas = { metricas: { totalStoryPoints: 0 } };
    }
    dbData[grupo].estadisticas.metricas.totalStoryPoints += totalStoryPoints;
    
    await guardarDB(dbData);
    
    res.json({ 
      success: true, 
      historiasAgregadas: historiasAgregadas.length,
      totalStoryPoints 
    });
    
  } catch (error) {
    console.error('Error en carga masiva:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar historia de usuario
app.put('/api/product-backlog/:grupo/:proyecto/historia/:historyId', requireRole(['lider', 'admin']), async (req, res) => {
  try {
    const { grupo, proyecto, historyId } = req.params;
    const updates = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto] || !dbData[grupo][proyecto].productBacklog) {
      return res.status(404).json({ error: 'Proyecto o backlog no encontrado' });
    }
    
    const historiaIndex = dbData[grupo][proyecto].productBacklog.findIndex(h => h[0] === historyId);
    
    if (historiaIndex === -1) {
      return res.status(404).json({ error: 'Historia no encontrada' });
    }
    
    // Actualizar campos específicos
    const historia = dbData[grupo][proyecto].productBacklog[historiaIndex];
    if (updates.como) historia[1] = updates.como;
    if (updates.quiero) historia[2] = updates.quiero;
    if (updates.para) historia[3] = updates.para;
    if (updates.criterio_aceptacion) historia[4] = updates.criterio_aceptacion;
    if (updates.prioridad) historia[5] = updates.prioridad;
    if (updates.history_points) historia[6] = parseInt(updates.history_points);
    if (updates.estado) historia[7] = updates.estado;
    
    await guardarDB(dbData);
    
    res.json({ success: true, historia });
    
  } catch (error) {
    console.error('Error actualizando historia:', error);
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
    
    // Calcular estadísticas del sprint
    const estadisticasSprint = calcularEstadisticasSprint(sprintData, grupoData[proyecto].productBacklog);
    
    res.json({
      sprint: sprintData,
      sprintActual: grupoData[proyecto].sprintActual,
      fechaIni: sprintData.fechaIni,
      fechaFin: sprintData.fechaFin,
      scrumBoard: sprintData.scrumBoard || [],
      tasks: sprintData.tasks || {},
      estadisticas: estadisticasSprint,
      burndownChart: sprintData.burndownChart || { plannedWork: [], actualWork: [] }
    });
    
  } catch (error) {
    console.error('Error obteniendo sprint:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear nuevo sprint
app.post('/api/sprint/:grupo/:proyecto/nuevo', requireRole(['lider', 'admin']), async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    const { duracionSemanas } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo] || !dbData[grupo][proyecto]) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    
    const proyectoData = dbData[grupo][proyecto];
    const nuevoSprintNum = parseInt(proyectoData.sprintActual) + 1;
    const nuevoSprintKey = `sprint${nuevoSprintNum}`;
    
    // Crear estructura del nuevo sprint
    proyectoData[nuevoSprintKey] = {
      "fechaIni": obtenerFechaActual(),
      "fechaFin": calcularFechaFin(parseInt(duracionSemanas)),
      "scrumBoard": [],
      "tasks": {},
      "burndownChart": {
        "plannedWork": [],
        "actualWork": []
      }
    };
    
    // Actualizar sprint actual
    proyectoData.sprintActual = nuevoSprintNum.toString();
    
    await guardarDB(dbData);
    
    res.json({ 
      success: true, 
      nuevoSprint: nuevoSprintNum,
      sprintData: proyectoData[nuevoSprintKey]
    });
    
  } catch (error) {
    console.error('Error creando nuevo sprint:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Seleccionar historias para el sprint actual
app.post('/api/sprint/:grupo/:proyecto/seleccionar-historias', requireRole(['lider', 'admin']), async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    const { historias_ids } = req.body;
    
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
      let totalSprintPoints = 0;
      
      dbData[grupo][proyecto].productBacklog = dbData[grupo][proyecto].productBacklog.map(historia => {
        if (historias_ids.includes(historia[0])) {
          historia[7] = "EN_SPRINT";
          totalSprintPoints += historia[6]; // sumar story points
        }
        return historia;
      });
      
      // Inicializar burndown chart
      const diasSprint = calcularDiasSprint(
        dbData[grupo][proyecto][sprintKey].fechaIni,
        dbData[grupo][proyecto][sprintKey].fechaFin
      );
      
      dbData[grupo][proyecto][sprintKey].burndownChart.plannedWork = 
        Array.from({length: diasSprint + 1}, (_, i) => ({
          dia: i,
          trabajo: totalSprintPoints - (totalSprintPoints * i / diasSprint)
        }));
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
    
    let tareas = sprintData.tasks || {};
    
    // Filtrar tareas para miembros (solo sus tareas)
    if (req.userData.rol === 'miembro') {
      const tareasUsuario = {};
      Object.keys(tareas).forEach(taskId => {
        const tarea = tareas[taskId];
        if (tarea[2] && tarea[2].includes(req.userData.nickname)) {
          tareasUsuario[taskId] = tarea;
        }
      });
      tareas = tareasUsuario;
    }
    
    // Calcular estadísticas de tareas
    const estadisticasTareas = calcularEstadisticasTareas(tareas, req.userData.nickname);
    
    res.json({
      tareas: tareas,
      scrumBoard: sprintData.scrumBoard || [],
      estadisticas: estadisticasTareas
    });
    
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear nueva tarea técnica
app.post('/api/tareas/:grupo/:proyecto/crear', requireRole(['lider', 'admin']), async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    const { description, personas_asignadas, prioridad, fecha_limite, historia_id, estimacion_horas } = req.body;
    
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
    const fechaCreacion = new Date().toISOString();
    
    const nuevaTarea = [
      "POR_HACER", // estado
      description,
      personas_asignadas || [], // array de personas asignadas
      prioridad,
      fecha_limite,
      historia_id, // ID de la historia asociada
      estimacion_horas || 0, // estimación en horas
      fechaCreacion, // fecha de creación
      req.userData.nickname, // creado por
      [] // comentarios/actualizaciones
    ];
    
    if (!dbData[grupo][proyecto][sprintKey].tasks) {
      dbData[grupo][proyecto][sprintKey].tasks = {};
    }
    
    dbData[grupo][proyecto][sprintKey].tasks[id_task] = nuevaTarea;
    
    // Actualizar estadísticas de usuarios asignados
    if (personas_asignadas && personas_asignadas.length > 0) {
      await actualizarEstadisticasUsuarios(personas_asignadas, 'tarea_asignada');
    }
    
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
    const { estado, comentario } = req.body;
    
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
    const estadoAnterior = tarea[0];
    
    // Verificar permisos
    if (req.userData.rol === 'miembro' || req.userData.rol === 'scrumMaster') {
      // Solo puede modificar sus propias tareas
      if (!tarea[2].includes(req.userData.nickname)) {
        return res.status(403).json({ error: 'Solo puedes modificar tus propias tareas' });
      }
      
      // Los miembros solo pueden marcar como "EN_PROCESO" o "COMPLETADO"
      if (!['EN_PROCESO', 'COMPLETADO'].includes(estado)) {
        return res.status(403).json({ error: 'Estado no permitido para tu rol' });
      }
    }
    
    // Actualizar estado
    dbData[grupo][proyecto][sprintKey].tasks[tareaId][0] = estado;
    
    // Agregar comentario si se proporciona
    if (comentario) {
      const actualizacion = {
        fecha: new Date().toISOString(),
        usuario: req.userData.nickname,
        accion: `Cambió estado de ${estadoAnterior} a ${estado}`,
        comentario: comentario
      };
      
      if (!tarea[9]) tarea[9] = [];
      tarea[9].push(actualizacion);
    }
    
    // Actualizar estadísticas si la tarea se completó
    if (estado === 'COMPLETADO' && estadoAnterior !== 'COMPLETADO') {
      await actualizarEstadisticasUsuarios(tarea[2], 'tarea_completada');
    }
    
    // Actualizar burndown chart
    await actualizarBurndownChart(dbData, grupo, proyecto, sprintKey);
    
    await guardarDB(dbData);
    
    res.json({ success: true, nuevoEstado: estado });
    
  } catch (error) {
    console.error('Error actualizando estado de tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Asignar/Reasignar tarea
app.post('/api/tareas/:grupo/:proyecto/:tareaId/asignar', requireRole(['lider', 'admin']), async (req, res) => {
  try {
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
    
    const tarea = dbData[grupo][proyecto][sprintKey].tasks[tareaId];
    const personasAnteriores = tarea[2] || [];
    
    // Actualizar personas asignadas
    dbData[grupo][proyecto][sprintKey].tasks[tareaId][2] = personas_asignadas;
    
    // Registrar el cambio
    const actualizacion = {
      fecha: new Date().toISOString(),
      usuario: req.userData.nickname,
      accion: 'Reasignó tarea',
      comentario: `De: ${personasAnteriores.join(', ')} → A: ${personas_asignadas.join(', ')}`
    };
    
    if (!tarea[9]) tarea[9] = [];
    tarea[9].push(actualizacion);
    
    // Actualizar estadísticas de usuarios
    await actualizarEstadisticasUsuarios(personasAnteriores, 'tarea_desasignada');
    await actualizarEstadisticasUsuarios(personas_asignadas, 'tarea_asignada');
    
    await guardarDB(dbData);
    
    res.json({ success: true, personasAsignadas: personas_asignadas });
    
  } catch (error) {
    console.error('Error asignando tarea:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Agregar comentario a tarea
app.post('/api/tareas/:grupo/:proyecto/:tareaId/comentario', async (req, res) => {
  try {
    const { grupo, proyecto, tareaId } = req.params;
    const { comentario } = req.body;
    
    const dbData = await leerDB();
    const sprintActual = dbData[grupo][proyecto].sprintActual;
    const sprintKey = `sprint${sprintActual}`;
    const tarea = dbData[grupo][proyecto][sprintKey].tasks[tareaId];
    
    if (!tarea) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    // Verificar permisos (solo asignados o líderes/admins)
    if (req.userData.rol === 'miembro' && !tarea[2].includes(req.userData.nickname)) {
      return res.status(403).json({ error: 'Solo puedes comentar en tus propias tareas' });
    }
    
    const nuevoComentario = {
      fecha: new Date().toISOString(),
      usuario: req.userData.nickname,
      accion: 'Agregó comentario',
      comentario: comentario
    };
    
    if (!tarea[9]) tarea[9] = [];
    tarea[9].push(nuevoComentario);
    
    await guardarDB(dbData);
    
    res.json({ success: true, comentario: nuevoComentario });
    
  } catch (error) {
    console.error('Error agregando comentario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA ESTADÍSTICAS AVANZADAS
// ============================================

// Obtener estadísticas completas del proyecto (para líderes)
app.get('/api/estadisticas/:grupo/:proyecto', requireRole(['scrumMaster', 'lider', 'admin', 'auditor']), async (req, res) => {
  try {
    const { grupo, proyecto } = req.params;
    
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
    
    // Estadísticas del Product Backlog
    const productBacklog = grupoData[proyecto].productBacklog || [];
    const totalHistorias = productBacklog.length;
    const historiasCompletadas = productBacklog.filter(h => h[7] === 'COMPLETADO').length;
    const historiasEnProceso = productBacklog.filter(h => h[7] === 'EN_PROCESO' || h[7] === 'EN_SPRINT').length;
    const historiasPorHacer = productBacklog.filter(h => h[7] === 'POR_HACER').length;
    
    // Story Points
    const totalStoryPoints = productBacklog.reduce((sum, h) => sum + h[6], 0);
    const storyPointsCompletados = productBacklog
      .filter(h => h[7] === 'COMPLETADO')
      .reduce((sum, h) => sum + h[6], 0);
    const storyPointsEnProceso = productBacklog
      .filter(h => h[7] === 'EN_PROCESO' || h[7] === 'EN_SPRINT')
      .reduce((sum, h) => sum + h[6], 0);
    
    // Estadísticas del Sprint Actual
    const historiasEnSprint = sprintData ? sprintData.scrumBoard.length : 0;
    let totalTareas = 0;
    let tareasCompletadas = 0;
    let tareasEnProceso = 0;
    let tareasPorHacer = 0;
    
    if (sprintData && sprintData.tasks) {
      const tareas = Object.values(sprintData.tasks);
      totalTareas = tareas.length;
      tareasCompletadas = tareas.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
      tareasEnProceso = tareas.filter(t => t[0] === 'EN_PROCESO').length;
      tareasPorHacer = tareas.filter(t => t[0] === 'POR_HACER').length;
    }
    
    // Estadísticas por Historia de Usuario (para líderes)
    const estadisticasHU = [];
    if (req.userData.rol === 'lider' || req.userData.rol === 'admin') {
      for (const historia of productBacklog) {
        const huId = historia[0];
        const tareasHU = sprintData ? 
          Object.values(sprintData.tasks).filter(t => t[5] === huId) : [];
        
        const totalTareasHU = tareasHU.length;
        const tareasCompletadasHU = tareasHU.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
        const tareasEnProcesoHU = tareasHU.filter(t => t[0] === 'EN_PROCESO').length;
        
        let porcentajeCompletado = 0;
        if (totalTareasHU > 0) {
          porcentajeCompletado = Math.round(((tareasCompletadasHU + (tareasEnProcesoHU * 0.5)) / totalTareasHU) * 100);
        } else if (historia[7] === 'COMPLETADO') {
          porcentajeCompletado = 100;
        }
        
        estadisticasHU.push({
          id: huId,
          titulo: `${historia[1]} - ${historia[2]}`,
          storyPoints: historia[6],
          estado: historia[7],
          totalTareas: totalTareasHU,
          tareasCompletadas: tareasCompletadasHU,
          tareasEnProceso: tareasEnProcesoHU,
          porcentajeCompletado
        });
      }
    }
    
    // Cálculo de porcentajes
    const porcentajeHistoriasCompletado = totalHistorias > 0 ? 
      Math.round(((historiasCompletadas + (historiasEnProceso * 0.5)) / totalHistorias) * 100) : 0;
    const porcentajeTareasCompletado = totalTareas > 0 ? 
      Math.round(((tareasCompletadas + (tareasEnProceso * 0.5)) / totalTareas) * 100) : 0;
    const porcentajeStoryPoints = totalStoryPoints > 0 ?
      Math.round(((storyPointsCompletados + (storyPointsEnProceso * 0.5)) / totalStoryPoints) * 100) : 0;
    
    const estadisticas = {
      proyecto: {
        nombre: proyecto,
        totalHistorias,
        historiasCompletadas,
        historiasEnProceso,
        historiasPorHacer,
        porcentajeHistoriasCompletado,
        totalStoryPoints,
        storyPointsCompletados,
        storyPointsEnProceso,
        porcentajeStoryPoints
      },
      sprint: {
        numero: sprintActual,
        fechaIni: sprintData ? sprintData.fechaIni : null,
        fechaFin: sprintData ? sprintData.fechaFin : null,
        historiasEnSprint,
        totalTareas,
        tareasCompletadas,
        tareasEnProceso,
        tareasPorHacer,
        porcentajeTareasCompletado,
        burndownChart: sprintData ? sprintData.burndownChart : null
      },
      historias: estadisticasHU
    };
    
    res.json(estadisticas);
    
  } catch (error) {
    console.error('Error obteniendo estadísticas del proyecto:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener estadísticas del equipo
app.get('/api/estadisticas/equipo/:grupo', requireRole(['lider', 'admin', 'auditor']), async (req, res) => {
  try {
    const { grupo } = req.params;
    
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
    }
    
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const dbData = await leerDB();
    
    // Obtener miembros del grupo
    const miembrosGrupo = Object.entries(users).filter(([id, user]) => user.grupo === grupo);
    
    // Calcular estadísticas por miembro
    const estadisticasMiembros = [];
    
    for (const [id, user] of miembrosGrupo) {
      const stats = user.stats || [0, 0, 0];
      
      // Calcular tareas actuales del usuario
      let tareasAsignadas = 0;
      let tareasCompletadas = 0;
      let tareasEnProceso = 0;
      
      if (dbData[grupo] && dbData[grupo].started === 'y') {
        ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
          if (dbData[grupo][proyecto]) {
            const sprintActual = dbData[grupo][proyecto].sprintActual;
            const sprintKey = `sprint${sprintActual}`;
            
            if (dbData[grupo][proyecto][sprintKey] && dbData[grupo][proyecto][sprintKey].tasks) {
              Object.values(dbData[grupo][proyecto][sprintKey].tasks).forEach(tarea => {
                if (tarea[2] && tarea[2].includes(user.nickname)) {
                  tareasAsignadas++;
                  if (tarea[0] === 'COMPLETADO' || tarea[0] === 'VERIFICADO') {
                    tareasCompletadas++;
                  } else if (tarea[0] === 'EN_PROCESO') {
                    tareasEnProceso++;
                  }
                }
              });
            }
          }
        });
      }
      
      const porcentajeCompletado = tareasAsignadas > 0 ? 
        Math.round(((tareasCompletadas + (tareasEnProceso * 0.5)) / tareasAsignadas) * 100) : 0;
      
      // Calcular productividad (tareas completadas / tiempo en llamadas)
      const tiempoEnHoras = stats[0] / 3600; // convertir segundos a horas
      const productividad = tiempoEnHoras > 0 ? (tareasCompletadas / tiempoEnHoras).toFixed(2) : 0;
      
      estadisticasMiembros.push({
        id: id,
        nickname: user.nickname,
        rol: user.rol,
        tiempoLlamada: stats[0], // segundos en llamada
        tiempoLlamadaHoras: tiempoEnHoras.toFixed(1),
        tareasAsignadas,
        tareasCompletadas,
        tareasEnProceso,
        porcentajeCompletado,
        productividad: parseFloat(productividad),
        participacion: tiempoEnHoras > 1 ? 'Alta' : tiempoEnHoras > 0.5 ? 'Media' : 'Baja'
      });
    }
    
    // Estadísticas generales del equipo
    const totalMiembros = miembrosGrupo.length;
    const totalTiempoLlamadas = estadisticasMiembros.reduce((sum, m) => sum + m.tiempoLlamada, 0);
    const totalTareasEquipo = estadisticasMiembros.reduce((sum, m) => sum + m.tareasAsignadas, 0);
    const totalTareasCompletadas = estadisticasMiembros.reduce((sum, m) => sum + m.tareasCompletadas, 0);
    const promedioProductividad = estadisticasMiembros.length > 0 ? 
      (estadisticasMiembros.reduce((sum, m) => sum + m.productividad, 0) / estadisticasMiembros.length).toFixed(2) : 0;
    
    res.json({
      grupo: grupo,
      miembros: estadisticasMiembros,
      resumen: {
        totalMiembros,
        totalTiempoLlamadas: (totalTiempoLlamadas / 3600).toFixed(1), // en horas
        promedioTiempoPorMiembro: totalMiembros > 0 ? (totalTiempoLlamadas / totalMiembros / 3600).toFixed(1) : 0,
        totalTareasEquipo,
        totalTareasCompletadas,
        porcentajeComplecionEquipo: totalTareasEquipo > 0 ? 
          Math.round((totalTareasCompletadas / totalTareasEquipo) * 100) : 0,
        promedioProductividad: parseFloat(promedioProductividad)
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas del equipo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener estadísticas globales (solo admins)
app.get('/api/estadisticas/global', requireRole(['admin', 'auditor']), async (req, res) => {
  try {
    const dbData = await leerDB();
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    const estadisticasGlobales = {};
    const resumenGeneral = {
      totalEquipos: 0,
      equiposActivos: 0,
      totalUsuarios: Object.keys(users).length,
      totalProyectos: 0,
      totalHistorias: 0,
      totalTareas: 0,
      porcentajeComplecionGlobal: 0
    };
    
    // Procesar cada grupo
    Object.keys(dbData).forEach(nombreGrupo => {
      const grupoData = dbData[nombreGrupo];
      resumenGeneral.totalEquipos++;
      
      if (!grupoData.started) {
        estadisticasGlobales[nombreGrupo] = {
          iniciado: false,
          miembros: Object.values(users).filter(user => user.grupo === nombreGrupo).length,
          proyectos: {}
        };
        return;
      }
      
      resumenGeneral.equiposActivos++;
      const miembrosGrupo = Object.values(users).filter(user => user.grupo === nombreGrupo);
      const proyectos = {};
      let totalTareasGrupo = 0;
      let totalTareasCompletadasGrupo = 0;
      
      ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
        if (grupoData[proyecto]) {
          resumenGeneral.totalProyectos++;
          const proyectoData = grupoData[proyecto];
          const sprintActual = proyectoData.sprintActual;
          const sprintKey = `sprint${sprintActual}`;
          const sprintData = proyectoData[sprintKey];
          
          let totalTareas = 0;
          let tareasCompletadas = 0;
          
          if (sprintData && sprintData.tasks) {
            const tareas = Object.values(sprintData.tasks);
            totalTareas = tareas.length;
            tareasCompletadas = tareas.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
            totalTareasGrupo += totalTareas;
            totalTareasCompletadasGrupo += tareasCompletadas;
          }
          
          const totalHistoriasProy = proyectoData.productBacklog ? proyectoData.productBacklog.length : 0;
          resumenGeneral.totalHistorias += totalHistoriasProy;
          resumenGeneral.totalTareas += totalTareas;
          
          proyectos[proyecto] = {
            sprintActual: sprintActual,
            totalHistorias: totalHistoriasProy,
            historiasEnSprint: sprintData && sprintData.scrumBoard ? sprintData.scrumBoard.length : 0,
            totalTareas: totalTareas,
            tareasCompletadas: tareasCompletadas,
            porcentajeCompletado: totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0,
            storyPoints: proyectoData.productBacklog ? 
              proyectoData.productBacklog.reduce((sum, h) => sum + h[6], 0) : 0,
            fechaUltimaActividad: sprintData ? sprintData.fechaIni : null
          };
        }
      });
      
      estadisticasGlobales[nombreGrupo] = {
        iniciado: true,
        miembros: miembrosGrupo.length,
        lider: miembrosGrupo.find(m => m.rol === 'lider')?.nickname || 'Sin líder',
        scrumMaster: miembrosGrupo.find(m => m.rol === 'scrumMaster')?.nickname || 'Sin SM',
        proyectos: proyectos,
        porcentajeComplecionGrupo: totalTareasGrupo > 0 ? 
          Math.round((totalTareasCompletadasGrupo / totalTareasGrupo) * 100) : 0,
        tiempoTotalLlamadas: miembrosGrupo.reduce((sum, m) => sum + (m.stats?.[0] || 0), 0) / 3600 // en horas
      };
    });
    
    // Calcular porcentaje de completación global
    resumenGeneral.porcentajeComplecionGlobal = resumenGeneral.totalTareas > 0 ?
      Math.round((Object.values(estadisticasGlobales)
        .filter(g => g.iniciado)
        .reduce((sum, g) => sum + Object.values(g.proyectos).reduce((s, p) => s + p.tareasCompletadas, 0), 0) 
        / resumenGeneral.totalTareas) * 100) : 0;
    
    res.json({
      resumen: resumenGeneral,
      equipos: estadisticasGlobales,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas globales:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA ADMINISTRACIÓN (Solo Admins)
// ============================================

// Obtener todos los usuarios
app.get('/api/admin/usuarios', requireRole(['admin']), async (req, res) => {
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    // Filtrar información sensible (no mostrar tokens)
    const usuariosSinToken = Object.entries(users).map(([id, user]) => ({
      id: id,
      nickname: user.nickname,
      rol: user.rol,
      grupo: user.grupo,
      stats: user.stats || [0, 0, 0],
      ultimaActividad: user.ultimaActividad || null
    }));
    
    res.json(usuariosSinToken);
    
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cambiar usuario de equipo (solo admins)
app.post('/api/admin/usuarios/:userId/cambiar-grupo', requireRole(['admin']), async (req, res) => {
  try {
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
    
    const grupoAnterior = users[userId].grupo;
    
    // Cambiar grupo del usuario
    users[userId].grupo = nuevoGrupo;
    users[userId].stats = [0, 0, 0]; // Reset estadísticas
    users[userId].ultimaActividad = new Date().toISOString();
    
    await fs.writeFile('./databases/users.json', JSON.stringify(users, null, 2));
    
    // Reasignar tareas del usuario a @NoAsignado
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
                    
                    // Registrar el cambio
                    if (!tarea[9]) tarea[9] = [];
                    tarea[9].push({
                      fecha: new Date().toISOString(),
                      usuario: 'SISTEMA',
                      accion: 'Usuario reasignado de grupo',
                      comentario: `${users[userId].nickname} movido de ${grupoAnterior} a ${nuevoGrupo}`
                    });
                  }
                });
              }
            }
          }
        });
      }
    });
    
    await guardarDB(dbData);
    
    res.json({ 
      success: true, 
      mensaje: `Usuario ${users[userId].nickname} cambiado de ${grupoAnterior} a ${nuevoGrupo}` 
    });
    
  } catch (error) {
    console.error('Error cambiando usuario de grupo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cambiar rol de usuario (solo admins)
app.post('/api/admin/usuarios/:userId/cambiar-rol', requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { nuevoRol } = req.body;
    
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    if (!users[userId]) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const rolesValidos = ['miembro', 'scrumMaster', 'lider', 'admin', 'auditor'];
    if (!rolesValidos.includes(nuevoRol)) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
    
    const rolAnterior = users[userId].rol;
    users[userId].rol = nuevoRol;
    users[userId].ultimaActividad = new Date().toISOString();
    
    await fs.writeFile('./databases/users.json', JSON.stringify(users, null, 2));
    
    res.json({ 
      success: true, 
      mensaje: `Rol de ${users[userId].nickname} cambiado de ${rolAnterior} a ${nuevoRol}` 
    });
    
  } catch (error) {
    console.error('Error cambiando rol de usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener información completa de todos los equipos (solo admins)
app.get('/api/admin/equipos', requireRole(['admin', 'auditor']), async (req, res) => {
  try {
    const dbData = await leerDB();
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    const equiposCompletos = {};
    
    Object.keys(dbData).forEach(nombreGrupo => {
      const grupoData = dbData[nombreGrupo];
      
      // Obtener miembros del grupo con roles detallados
      const miembrosGrupo = Object.entries(users)
        .filter(([id, user]) => user.grupo === nombreGrupo)
        .map(([id, user]) => ({
          id: id,
          nickname: user.nickname,
          rol: user.rol,
          stats: user.stats || [0, 0, 0],
          tiempoLlamada: user.stats ? (user.stats[0] / 3600).toFixed(1) + 'h' : '0h',
          ultimaActividad: user.ultimaActividad || 'Nunca'
        }));
      
      // Composición del equipo
      const composicion = {
        total: miembrosGrupo.length,
        lider: miembrosGrupo.filter(m => m.rol === 'lider').length,
        scrumMaster: miembrosGrupo.filter(m => m.rol === 'scrumMaster').length,
        miembro: miembrosGrupo.filter(m => m.rol === 'miembro').length,
        admin: miembrosGrupo.filter(m => m.rol === 'admin').length,
        auditor: miembrosGrupo.filter(m => m.rol === 'auditor').length
      };
      
      equiposCompletos[nombreGrupo] = {
        miembros: miembrosGrupo,
        composicion: composicion,
        proyectos: grupoData,
        iniciado: grupoData.started === 'y',
        fechaInicio: grupoData.started === 'y' && grupoData.GenT ? 
          grupoData.GenT.sprint1?.fechaIni : null,
        estadisticas: grupoData.estadisticas || null
      };
    });
    
    res.json(equiposCompletos);
    
  } catch (error) {
    console.error('Error obteniendo información de equipos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Reiniciar proyecto de equipo (solo admins)
app.post('/api/admin/equipos/:grupo/reiniciar', requireRole(['admin']), async (req, res) => {
  try {
    const { grupo } = req.params;
    const { mantenerHistorias } = req.body;
    
    const dbData = await leerDB();
    
    if (!dbData[grupo]) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    
    // Hacer backup de historias si se solicita
    let backupHistorias = {};
    if (mantenerHistorias) {
      ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
        if (dbData[grupo][proyecto] && dbData[grupo][proyecto].productBacklog) {
          backupHistorias[proyecto] = dbData[grupo][proyecto].productBacklog;
        }
      });
    }
    
    // Reiniciar estructura del grupo
    dbData[grupo] = {
      started: 'n',
      ultimoReinicio: new Date().toISOString(),
      reiniciadoPor: req.userData.nickname
    };
    
    // Restaurar historias si se mantuvieron
    if (mantenerHistorias && Object.keys(backupHistorias).length > 0) {
      Object.keys(backupHistorias).forEach(proyecto => {
        if (!dbData[grupo][proyecto]) {
          dbData[grupo][proyecto] = { productBacklog: [] };
        }
        dbData[grupo][proyecto].productBacklog = backupHistorias[proyecto];
      });
    }
    
    await guardarDB(dbData);
    
    res.json({ 
      success: true, 
      mensaje: `Proyecto del ${grupo} reiniciado ${mantenerHistorias ? 'manteniendo' : 'eliminando'} historias` 
    });
    
  } catch (error) {
    console.error('Error reiniciando proyecto:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Exportar datos de equipo (solo admins)
app.get('/api/admin/equipos/:grupo/exportar', requireRole(['admin', 'auditor']), async (req, res) => {
  try {
    const { grupo } = req.params;
    const { formato } = req.query; // 'json' o 'csv'
    
    const dbData = await leerDB();
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    if (!dbData[grupo]) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    
    const grupoData = dbData[grupo];
    const miembrosGrupo = Object.entries(users).filter(([id, user]) => user.grupo === grupo);
    
    const exportData = {
      grupo: grupo,
      fechaExportacion: new Date().toISOString(),
      exportadoPor: req.userData.nickname,
      miembros: miembrosGrupo.map(([id, user]) => ({
        id,
        nickname: user.nickname,
        rol: user.rol,
        stats: user.stats || [0, 0, 0]
      })),
      proyectos: grupoData,
      resumen: {
        iniciado: grupoData.started === 'y',
        totalProyectos: ['GenT', 'Proy', 'Proy2'].filter(p => grupoData[p]).length,
        totalHistorias: ['GenT', 'Proy', 'Proy2'].reduce((sum, p) => 
          sum + (grupoData[p]?.productBacklog?.length || 0), 0),
        totalTareas: 0 // Se calcularía iterando por todos los sprints
      }
    };
    
    if (formato === 'csv') {
      // Generar CSV simple para importar en Excel
      let csvContent = 'Tipo,ID,Descripcion,Estado,Asignado,Prioridad,FechaCreacion\n';
      
      ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
        if (grupoData[proyecto]) {
          // Agregar historias
          if (grupoData[proyecto].productBacklog) {
            grupoData[proyecto].productBacklog.forEach(historia => {
              csvContent += `Historia,${historia[0]},"${historia[1]} - ${historia[2]}",${historia[7]},${historia[9] || 'N/A'},${historia[5]},${historia[8] || 'N/A'}\n`;
            });
          }
          
          // Agregar tareas del sprint actual
          const sprintActual = grupoData[proyecto].sprintActual;
          if (sprintActual && grupoData[proyecto][`sprint${sprintActual}`]) {
            const tasks = grupoData[proyecto][`sprint${sprintActual}`].tasks || {};
            Object.entries(tasks).forEach(([taskId, tarea]) => {
              csvContent += `Tarea,${taskId},"${tarea[1]}",${tarea[0]},"${tarea[2].join(', ')}",${tarea[3]},${tarea[7] || 'N/A'}\n`;
            });
          }
        }
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${grupo}_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${grupo}_export_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    }
    
  } catch (error) {
    console.error('Error exportando datos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// APIs PARA REPORTES Y ANALYTICS
// ============================================

// Generar reporte de productividad
app.get('/api/reportes/productividad/:grupo', requireRole(['lider', 'admin', 'auditor']), async (req, res) => {
  try {
    const { grupo } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    
    if (req.userData.rol !== 'admin' && req.userData.rol !== 'auditor' && req.userData.grupo !== grupo) {
      return res.status(403).json({ error: 'No tienes permisos para generar este reporte' });
    }
    
    const dbData = await leerDB();
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    if (!dbData[grupo] || !dbData[grupo].started) {
      return res.status(404).json({ error: 'Grupo no encontrado o proyecto no iniciado' });
    }
    
    const grupoData = dbData[grupo];
    const miembrosGrupo = Object.entries(users).filter(([id, user]) => user.grupo === grupo);
    
    // Calcular métricas de productividad por miembro
    const productividadMiembros = miembrosGrupo.map(([id, user]) => {
      let tareasCompletadas = 0;
      let tareasAsignadas = 0;
      let tiempoEstimado = 0;
      let historiasPuntosCompletados = 0;
      
      ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
        if (grupoData[proyecto]) {
          // Iterar por todos los sprints
          for (let i = 1; i <= parseInt(grupoData[proyecto].sprintActual); i++) {
            const sprintKey = `sprint${i}`;
            if (grupoData[proyecto][sprintKey] && grupoData[proyecto][sprintKey].tasks) {
              Object.values(grupoData[proyecto][sprintKey].tasks).forEach(tarea => {
                if (tarea[2] && tarea[2].includes(user.nickname)) {
                  tareasAsignadas++;
                  if (tarea[0] === 'COMPLETADO' || tarea[0] === 'VERIFICADO') {
                    tareasCompletadas++;
                  }
                  tiempoEstimado += tarea[6] || 0;
                }
              });
            }
          }
          
          // Calcular story points de historias completadas donde participó
          if (grupoData[proyecto].productBacklog) {
            grupoData[proyecto].productBacklog
              .filter(h => h[7] === 'COMPLETADO')
              .forEach(historia => {
                // Verificar si el usuario participó en tareas de esta historia
                let participoEnHistoria = false;
                for (let i = 1; i <= parseInt(grupoData[proyecto].sprintActual); i++) {
                  const sprintKey = `sprint${i}`;
                  if (grupoData[proyecto][sprintKey] && grupoData[proyecto][sprintKey].tasks) {
                    Object.values(grupoData[proyecto][sprintKey].tasks).forEach(tarea => {
                      if (tarea[5] === historia[0] && tarea[2] && tarea[2].includes(user.nickname)) {
                        participoEnHistoria = true;
                      }
                    });
                  }
                }
                if (participoEnHistoria) {
                  historiasPuntosCompletados += historia[6];
                }
              });
          }
        }
      });
      
      const tiempoEnHoras = (user.stats?.[0] || 0) / 3600;
      const eficiencia = tiempoEnHoras > 0 ? (tareasCompletadas / tiempoEnHoras).toFixed(2) : 0;
      const porcentajeCompletado = tareasAsignadas > 0 ? 
        Math.round((tareasCompletadas / tareasAsignadas) * 100) : 0;
      
      return {
        usuario: user.nickname,
        rol: user.rol,
        tareasAsignadas,
        tareasCompletadas,
        porcentajeCompletado,
        tiempoEnLlamadas: tiempoEnHoras.toFixed(1),
        tiempoEstimadoTareas: tiempoEstimado,
        eficienciaTareas: parseFloat(eficiencia),
        storyPointsCompletados: historiasPuntosCompletados,
        puntuacionProductividad: (porcentajeCompletado * 0.4) + (parseFloat(eficiencia) * 10 * 0.6)
      };
    });
    
    // Calcular métricas del equipo
    const totalTareasEquipo = productividadMiembros.reduce((sum, m) => sum + m.tareasAsignadas, 0);
    const totalTareasCompletadas = productividadMiembros.reduce((sum, m) => sum + m.tareasCompletadas, 0);
    const promedioEficiencia = productividadMiembros.length > 0 ?
      (productividadMiembros.reduce((sum, m) => sum + m.eficienciaTareas, 0) / productividadMiembros.length).toFixed(2) : 0;
    
    const reporte = {
      grupo,
      fechaGeneracion: new Date().toISOString(),
      generadoPor: req.userData.nickname,
      periodo: {
        inicio: fechaInicio || 'Inicio del proyecto',
        fin: fechaFin || 'Hasta la fecha'
      },
      resumenEquipo: {
        totalMiembros: miembrosGrupo.length,
        totalTareas: totalTareasEquipo,
        tareasCompletadas: totalTareasCompletadas,
        porcentajeComplecionEquipo: totalTareasEquipo > 0 ? 
          Math.round((totalTareasCompletadas / totalTareasEquipo) * 100) : 0,
        eficienciaPromedio: parseFloat(promedioEficiencia)
      },
      productividadIndividual: productividadMiembros.sort((a, b) => b.puntuacionProductividad - a.puntuacionProductividad),
      recomendaciones: generarRecomendacionesProductividad(productividadMiembros)
    };
    
    res.json(reporte);
    
  } catch (error) {
    console.error('Error generando reporte de productividad:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTA DE LOGOUT
// ============================================
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
    }
    res.redirect('/login');
  });
});

// ============================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ============================================
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    res.status(500).json({ error: 'Error interno del servidor' });
  } else {
    res.status(500).render('error', { 
      error: 'Ha ocurrido un error interno del servidor',
      user: req.userData || null 
    });
  }
});

// Ruta 404
app.use('*', (req, res) => {
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    res.status(404).json({ error: 'Endpoint no encontrado' });
  } else {
    res.status(404).render('404', { 
      user: req.userData || null,
      url: req.originalUrl 
    });
  }
});

// ============================================
// FUNCIONES AUXILIARES Y UTILIDADES
// ============================================

// Funciones de fecha
function obtenerFechaActual() {
  const now = new Date();
  return [now.getDate(), now.getMonth() + 1, now.getFullYear()];
}

function calcularFechaFin(semanas) {
  const now = new Date();
  now.setDate(now.getDate() + (semanas * 7));
  return [now.getDate(), now.getMonth() + 1, now.getFullYear()];
}

function calcularDiasSprint(fechaIni, fechaFin) {
  const inicio = new Date(fechaIni[2], fechaIni[1] - 1, fechaIni[0]);
  const fin = new Date(fechaFin[2], fechaFin[1] - 1, fechaFin[0]);
  const diffTime = Math.abs(fin - inicio);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Funciones de estadísticas
async function calcularEstadisticasGlobales(dbData, users) {
  const estadisticas = {
    totalEquipos: Object.keys(dbData).length,
    equiposActivos: Object.values(dbData).filter(g => g.started === 'y').length,
    totalUsuarios: Object.keys(users).length,
    distribucionRoles: {},
    totalProyectos: 0,
    totalHistorias: 0,
    totalTareas: 0,
    promedioCompletacion: 0
  };
  
  // Distribución de roles
  Object.values(users).forEach(user => {
    estadisticas.distribucionRoles[user.rol] = (estadisticas.distribucionRoles[user.rol] || 0) + 1;
  });
  
  // Calcular totales de proyectos
  Object.values(dbData).forEach(grupo => {
    if (grupo.started === 'y') {
      ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
        if (grupo[proyecto]) {
          estadisticas.totalProyectos++;
          estadisticas.totalHistorias += grupo[proyecto].productBacklog?.length || 0;
          
          const sprintActual = grupo[proyecto].sprintActual;
          if (grupo[proyecto][`sprint${sprintActual}`]?.tasks) {
            estadisticas.totalTareas += Object.keys(grupo[proyecto][`sprint${sprintActual}`].tasks).length;
          }
        }
      });
    }
  });
  
  return estadisticas;
}

function calcularComposicionEquipos(users) {
  const composicion = {};
  
  Object.values(users).forEach(user => {
    if (!composicion[user.grupo]) {
      composicion[user.grupo] = { total: 0, roles: {} };
    }
    
    composicion[user.grupo].total++;
    composicion[user.grupo].roles[user.rol] = (composicion[user.grupo].roles[user.rol] || 0) + 1;
  });
  
  return composicion;
}

async function calcularEstadisticasLider(grupoData, nombreGrupo) {
  const estadisticas = {
    resumenGeneral: {},
    proyectos: {},
    equipoPerformance: {},
    alertas: []
  };
  
  let totalHistorias = 0;
  let totalStoryPoints = 0;
  let totalTareas = 0;
  let totalCompletadas = 0;
  
  ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
    if (grupoData[proyecto]) {
      const proyectoData = grupoData[proyecto];
      const historias = proyectoData.productBacklog || [];
      const sprintActual = proyectoData.sprintActual;
      const sprintData = proyectoData[`sprint${sprintActual}`];
      
      totalHistorias += historias.length;
      totalStoryPoints += historias.reduce((sum, h) => sum + h[6], 0);
      
      if (sprintData?.tasks) {
        const tareas = Object.values(sprintData.tasks);
        totalTareas += tareas.length;
        totalCompletadas += tareas.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
      }
      
      estadisticas.proyectos[proyecto] = calcularEstadisticasProyecto(proyectoData);
    }
  });
  
  estadisticas.resumenGeneral = {
    totalHistorias,
    totalStoryPoints,
    totalTareas,
    totalCompletadas,
    porcentajeCompletacion: totalTareas > 0 ? Math.round((totalCompletadas / totalTareas) * 100) : 0
  };
  
  // Generar alertas para el líder
  if (estadisticas.resumenGeneral.porcentajeCompletacion < 50) {
    estadisticas.alertas.push({
      tipo: 'warning',
      mensaje: 'El porcentaje de completación del equipo está por debajo del 50%',
      accionRecomendada: 'Revisar asignación de tareas y bloqueos del equipo'
    });
  }
  
  return estadisticas;
}

async function calcularEstadisticasEquipo(grupoData, nombreGrupo) {
  const estadisticas = {
    velocidadEquipo: [],
    distribucionTareas: {},
    tendencias: {},
    metricas: {}
  };
  
  // Calcular velocidad por sprint
  ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
    if (grupoData[proyecto]) {
      const proyectoData = grupoData[proyecto];
      const sprintActual = parseInt(proyectoData.sprintActual);
      
      for (let i = 1; i <= sprintActual; i++) {
        const sprintData = proyectoData[`sprint${i}`];
        if (sprintData) {
          const tareasCompletadas = sprintData.tasks ? 
            Object.values(sprintData.tasks).filter(t => t[0] === 'COMPLETADO').length : 0;
          
          estadisticas.velocidadEquipo.push({
            proyecto,
            sprint: i,
            tareasCompletadas,
            fecha: sprintData.fechaFin
          });
        }
      }
    }
  });
  
  return estadisticas;
}

async function obtenerTareasPersonales(grupoData, nickname) {
  const tareas = [];
  
  ['GenT', 'Proy', 'Proy2'].forEach(proyecto => {
    if (grupoData[proyecto]) {
      const sprintActual = grupoData[proyecto].sprintActual;
      const sprintData = grupoData[proyecto][`sprint${sprintActual}`];
      
      if (sprintData?.tasks) {
        Object.entries(sprintData.tasks).forEach(([taskId, tarea]) => {
          if (tarea[2] && tarea[2].includes(nickname)) {
            tareas.push({
              id: taskId,
              proyecto,
              descripcion: tarea[1],
              estado: tarea[0],
              prioridad: tarea[3],
              fechaLimite: tarea[4],
              estimacionHoras: tarea[6] || 0
            });
          }
        });
      }
    }
  });
  
  return tareas.sort((a, b) => {
    const prioridadOrden = { 'ALTA': 3, 'MEDIA': 2, 'BAJA': 1 };
    return (prioridadOrden[b.prioridad] || 0) - (prioridadOrden[a.prioridad] || 0);
  });
}

function calcularEstadisticasProyecto(proyectoData) {
  const historias = proyectoData.productBacklog || [];
  const sprintActual = proyectoData.sprintActual;
  const sprintData = proyectoData[`sprint${sprintActual}`];
  
  const estadisticas = {
    totalHistorias: historias.length,
    storyPoints: historias.reduce((sum, h) => sum + h[6], 0),
    distribucionEstados: {},
    sprint: {
      numero: sprintActual,
      historiasSeleccionadas: sprintData?.scrumBoard?.length || 0,
      tareas: {
        total: 0,
        completadas: 0,
        enProceso: 0,
        porHacer: 0
      }
    }
  };
  
  // Distribución de estados de historias
  historias.forEach(historia => {
    const estado = historia[7];
    estadisticas.distribucionEstados[estado] = (estadisticas.distribucionEstados[estado] || 0) + 1;
  });
  
  // Estadísticas de tareas del sprint actual
  if (sprintData?.tasks) {
    const tareas = Object.values(sprintData.tasks);
    estadisticas.sprint.tareas.total = tareas.length;
    estadisticas.sprint.tareas.completadas = tareas.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
    estadisticas.sprint.tareas.enProceso = tareas.filter(t => t[0] === 'EN_PROCESO').length;
    estadisticas.sprint.tareas.porHacer = tareas.filter(t => t[0] === 'POR_HACER').length;
  }
  
  return estadisticas;
}

function calcularEstadisticasBacklog(productBacklog) {
  const estadisticas = {
    total: productBacklog.length,
    porEstado: {},
    porPrioridad: {},
    storyPoints: {
      total: 0,
      promedio: 0
    }
  };
  
  productBacklog.forEach(historia => {
    // Contar por estado
    const estado = historia[7];
    estadisticas.porEstado[estado] = (estadisticas.porEstado[estado] || 0) + 1;
    
    // Contar por prioridad
    const prioridad = historia[5];
    estadisticas.porPrioridad[prioridad] = (estadisticas.porPrioridad[prioridad] || 0) + 1;
    
    // Sumar story points
    estadisticas.storyPoints.total += historia[6];
  });
  
  estadisticas.storyPoints.promedio = estadisticas.total > 0 ? 
    (estadisticas.storyPoints.total / estadisticas.total).toFixed(1) : 0;
  
  return estadisticas;
}

function calcularEstadisticasSprint(sprintData, productBacklog) {
  const estadisticas = {
    fechas: {
      inicio: sprintData.fechaIni,
      fin: sprintData.fechaFin
    },
    historias: {
      seleccionadas: sprintData.scrumBoard?.length || 0,
      storyPoints: 0
    },
    tareas: {
      total: 0,
      completadas: 0,
      enProceso: 0,
      porHacer: 0,
      porcentajeCompletado: 0
    },
    burndown: sprintData.burndownChart || { plannedWork: [], actualWork: [] }
  };
  
  // Calcular story points de historias seleccionadas
  if (sprintData.scrumBoard && productBacklog) {
    sprintData.scrumBoard.forEach(historiaId => {
      const historia = productBacklog.find(h => h[0] === historiaId);
      if (historia) {
        estadisticas.historias.storyPoints += historia[6];
      }
    });
  }
  
  // Estadísticas de tareas
  if (sprintData.tasks) {
    const tareas = Object.values(sprintData.tasks);
    estadisticas.tareas.total = tareas.length;
    estadisticas.tareas.completadas = tareas.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
    estadisticas.tareas.enProceso = tareas.filter(t => t[0] === 'EN_PROCESO').length;
    estadisticas.tareas.porHacer = tareas.filter(t => t[0] === 'POR_HACER').length;
    
    estadisticas.tareas.porcentajeCompletado = estadisticas.tareas.total > 0 ? 
      Math.round((estadisticas.tareas.completadas / estadisticas.tareas.total) * 100) : 0;
  }
  
  return estadisticas;
}

function calcularEstadisticasTareas(tareas, nickname) {
  const estadisticas = {
    total: Object.keys(tareas).length,
    misTareas: 0,
    porEstado: {},
    porPrioridad: {},
    estimacionTotal: 0
  };
  
  Object.values(tareas).forEach(tarea => {
    // Contar mis tareas
    if (tarea[2] && tarea[2].includes(nickname)) {
      estadisticas.misTareas++;
    }
    
    // Contar por estado
    const estado = tarea[0];
    estadisticas.porEstado[estado] = (estadisticas.porEstado[estado] || 0) + 1;
    
    // Contar por prioridad
    const prioridad = tarea[3];
    estadisticas.porPrioridad[prioridad] = (estadisticas.porPrioridad[prioridad] || 0) + 1;
    
    // Sumar estimaciones
    estadisticas.estimacionTotal += tarea[6] || 0;
  });
  
  return estadisticas;
}

// Funciones de actualización de estadísticas
async function actualizarEstadisticasUsuarios(nicknames, accion) {
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    let updated = false;
    
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      if (nicknames.includes(user.nickname)) {
        if (!user.stats) user.stats = [0, 0, 0];
        
        switch (accion) {
          case 'tarea_asignada':
            user.stats[1] = (user.stats[1] || 0) + 1; // tareas asignadas
            break;
          case 'tarea_desasignada':
            user.stats[1] = Math.max((user.stats[1] || 0) - 1, 0);
            break;
          case 'tarea_completada':
            user.stats[2] = (user.stats[2] || 0) + 1; // tareas completadas
            break;
        }
        
        user.ultimaActividad = new Date().toISOString();
        updated = true;
      }
    });
    
    if (updated) {
      await fs.writeFile('./databases/users.json', JSON.stringify(users, null, 2));
    }
    
  } catch (error) {
    console.error('Error actualizando estadísticas de usuarios:', error);
  }
}

async function actualizarBurndownChart(dbData, grupo, proyecto, sprintKey) {
  try {
    const sprintData = dbData[grupo][proyecto][sprintKey];
    if (!sprintData || !sprintData.tasks) return;
    
    const tareas = Object.values(sprintData.tasks);
    const tareasCompletadas = tareas.filter(t => t[0] === 'COMPLETADO' || t[0] === 'VERIFICADO').length;
    const totalTareas = tareas.length;
    const trabajoRestante = totalTareas - tareasCompletadas;
    
    const hoy = new Date();
    const fechaInicio = new Date(sprintData.fechaIni[2], sprintData.fechaIni[1] - 1, sprintData.fechaIni[0]);
    const diasTranscurridos = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24));
    
    if (!sprintData.burndownChart) {
      sprintData.burndownChart = { plannedWork: [], actualWork: [] };
    }
    
    // Actualizar trabajo actual
    const actualWorkEntry = sprintData.burndownChart.actualWork.find(entry => entry.dia === diasTranscurridos);
    if (actualWorkEntry) {
      actualWorkEntry.trabajo = trabajoRestante;
    } else {
      sprintData.burndownChart.actualWork.push({
        dia: diasTranscurridos,
        trabajo: trabajoRestante,
        fecha: hoy.toISOString()
      });
    }
    
    // Ordenar por día
    sprintData.burndownChart.actualWork.sort((a, b) => a.dia - b.dia);
    
  } catch (error) {
    console.error('Error actualizando burndown chart:', error);
  }
}

function generarRecomendacionesProductividad(productividadMiembros) {
  const recomendaciones = [];
  
  // Identificar miembros con baja productividad
  const miembrosBajaProductividad = productividadMiembros.filter(m => m.porcentajeCompletado < 70);
  if (miembrosBajaProductividad.length > 0) {
    recomendaciones.push({
      tipo: 'warning',
      titulo: 'Miembros con baja completación de tareas',
      descripcion: `${miembrosBajaProductividad.map(m => m.usuario).join(', ')} tienen menos del 70% de completación`,
      accion: 'Revisar carga de trabajo y posibles bloqueos'
    });
  }
  
  // Identificar miembros sobrecargados
  const miembrosSobrecargados = productividadMiembros.filter(m => m.tareasAsignadas > 10);
  if (miembrosSobrecargados.length > 0) {
    recomendaciones.push({
      tipo: 'info',
      titulo: 'Miembros con alta carga de trabajo',
      descripcion: `${miembrosSobrecargados.map(m => m.usuario).join(', ')} tienen más de 10 tareas asignadas`,
      accion: 'Considerar redistribuir tareas para equilibrar la carga'
    });
  }
  
  // Reconocer alto rendimiento
  const miembrosAltoRendimiento = productividadMiembros.filter(m => 
    m.porcentajeCompletado >= 90 && m.eficienciaTareas > 1
  );
  if (miembrosAltoRendimiento.length > 0) {
    recomendaciones.push({
      tipo: 'success',
      titulo: 'Miembros con excelente rendimiento',
      descripcion: `${miembrosAltoRendimiento.map(m => m.usuario).join(', ')} muestran alto rendimiento`,
      accion: 'Considerar como mentores para otros miembros del equipo'
    });
  }
  
  return recomendaciones;
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

// Funciones de base de datos
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

async function guardarDB(data) {
  try {
    // Crear backup antes de guardar
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `./databases/backups/db_backup_${timestamp}.json`;
    
    try {
      await fs.mkdir('./databases/backups', { recursive: true });
      const currentData = await fs.readFile('./databases/db.json', 'utf8');
      await fs.writeFile(backupPath, currentData);
    } catch (backupError) {
      console.warn('No se pudo crear backup:', backupError.message);
    }
    
    // Guardar datos actualizados
    await fs.writeFile('./databases/db.json', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error guardando db.json:', error);
    return false;
  }
}

// Función para limpiar backups antiguos (mantener solo los últimos 10)
async function limpiarBackups() {
  try {
    const backupDir = './databases/backups';
    const files = await fs.readdir(backupDir);
    const backupFiles = files
      .filter(file => file.startsWith('db_backup_'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.stat(path.join(backupDir, file)).then(stats => stats.mtime)
      }));
    
    if (backupFiles.length > 10) {
      const sortedFiles = await Promise.all(
        backupFiles.map(async file => ({
          ...file,
          time: await file.time
        }))
      );
      
      sortedFiles.sort((a, b) => b.time - a.time);
      
      // Eliminar los backups más antiguos
      for (let i = 10; i < sortedFiles.length; i++) {
        await fs.unlink(sortedFiles[i].path);
      }
    }
  } catch (error) {
    console.warn('Error limpiando backups:', error.message);
  }
}

// Inicialización de archivos y estructura
async function inicializarArchivos() {
  try {
    // Crear directorios necesarios
    const directorios = [
      './databases',
      './databases/backups',
      './public',
      './views',
      './views/dashboard'
    ];
    
    for (const dir of directorios) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    // Verificar si db.json existe, sino crearlo
    try {
      await fs.access('./databases/db.json');
      console.log('✅ db.json encontrado');
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
      console.log('✅ users.json encontrado');
    } catch {
      console.log('⚠️  users.json no encontrado en la carpeta databases');
      console.log('📝 Creando users.json con estructura básica...');
      
      const usuariosIniciales = {
        "admin": {
          "nickname": "Administrador",
          "rol": "admin",
          "grupo": "Admin",
          "token": "admin123",
          "stats": [0, 0, 0]
        }
      };
      
      await fs.writeFile('./databases/users.json', JSON.stringify(usuariosIniciales, null, 2));
      console.log('✅ users.json creado con usuario admin por defecto');
      console.log('🔑 Token de admin: admin123');
    }
    
    // Verificar archivo de configuración
    try {
      await fs.access('./config.json');
    } catch {
      const configInicial = {
        "web": {
          "port": 3000,
          "sessionSecret": "dardito_secret_2024"
        }
      };
      await fs.writeFile('./config.json', JSON.stringify(configInicial, null, 2));
      console.log('✅ config.json creado');
    }
    
  } catch (error) {
    console.error('❌ Error inicializando archivos:', error);
  }
}

// Tarea de mantenimiento programada (ejecutar cada hora)
setInterval(async () => {
  try {
    await limpiarBackups();
    
    // Actualizar timestamps de última actividad
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    
    Object.keys(users).forEach(userId => {
      if (users[userId].ultimaActividad) {
        const ultimaActividad = new Date(users[userId].ultimaActividad);
        const ahora = new Date();
        const diasInactivo = (ahora - ultimaActividad) / (1000 * 60 * 60 * 24);
        
        if (diasInactivo > 30) {
          // Marcar como inactivo después de 30 días
          users[userId].estado = 'inactivo';
        }
      }
    });
    
    await fs.writeFile('./databases/users.json', JSON.stringify(users, null, 2));
    
  } catch (error) {
    console.warn('Error en tarea de mantenimiento:', error.message);
  }
}, 3600000); // Cada hora

// ============================================
// INICIALIZACIÓN DEL SERVIDOR
// ============================================
const PORT = config.web.port || 3000;

app.listen(PORT, async () => {
  console.log('🚀 ================================================');
  console.log('🌐 DARDITO - Sistema de Gestión Ágil');
  console.log('🚀 ================================================');
  console.log(`🌐 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`🔗 URL local: http://localhost:${PORT}`);
  console.log('📊 Funcionalidades disponibles:');
  console.log('   • Dashboard por roles (Admin, Líder, Scrum Master, Miembro)');
  console.log('   • Gestión de Product Backlog e Historias de Usuario');
  console.log('   • Gestión de Sprints y Tareas');
  console.log('   • Estadísticas avanzadas y reportes de productividad');
  console.log('   • APIs REST completas para integración');
  console.log('   • Sistema de autenticación con tokens');
  console.log('   • Backups automáticos y mantenimiento');
  console.log('🚀 ================================================');
  
  // Inicializar archivos y estructura
  await inicializarArchivos();
  
  // Mostrar estadísticas iniciales
  try {
    const usersData = await fs.readFile('./databases/users.json', 'utf8');
    const users = JSON.parse(usersData);
    const dbData = await leerDB();
    
    const totalUsuarios = Object.keys(users).length;
    const equiposActivos = Object.values(dbData).filter(g => g.started === 'y').length;
    
    console.log(`👥 Total de usuarios registrados: ${totalUsuarios}`);
    console.log(`🏢 Equipos con proyectos activos: ${equiposActivos}/4`);
    
    // Mostrar distribución de roles
    const roles = {};
    Object.values(users).forEach(user => {
      roles[user.rol] = (roles[user.rol] || 0) + 1;
    });
    
    console.log('📊 Distribución de roles:');
    Object.entries(roles).forEach(([rol, count]) => {
      console.log(`   • ${rol}: ${count}`);
    });
    
  } catch (error) {
    console.warn('⚠️  Error obteniendo estadísticas iniciales:', error.message);
  }
  
  console.log('✅ Sistema listo para uso');
  console.log('🚀 ================================================');
});