const express = require('express');
const router = express.Router();

const { 
  requireAuth, 
  requireLider, 
  requireScrumMaster, 
  requireAdmin,
  requirePermission,
  requireGroupAccess,
  checkProjectStatus
} = require('./auth');

const {
  autenticarUsuario,
  inicializarProyecto,
  agregarHistoria,
  obtenerProductBacklog,
  crearTarea,
  actualizarEstadoTarea,
  obtenerTareasUsuario,
  calcularMetricasEquipo,
  obtenerDashboard,
  moverHistoriaASprint,
  obtenerTareasSprint,
  actualizarBurndownChart,
  cambiarRolUsuario,
  obtenerEstadisticasGlobales
} = require('./handlers');

// ===============================
// RUTAS PÚBLICAS
// ===============================

/**
 * GET /login - Página de inicio de sesión
 */
router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  
  res.render('login', { 
    title: 'Iniciar Sesión - Dardito',
    error: null 
  });
});

/**
 * GET / - Redirección a login o dashboard
 */
router.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

/**
 * POST /auth - Autenticación de usuario
 */
router.post('/auth', async (req, res) => {
  try {
    const { token } = req.body;
    
    console.log('Token recibido:', token); // Debug
    
    if (!token || token.trim() === '') {
      return res.render('login', {
        title: 'Iniciar Sesión - Dardito',
        error: 'Token requerido'
      });
    }

    // Limpiar el token de espacios en blanco
    const tokenLimpio = token.trim();
    console.log('Token limpio:', tokenLimpio); // Debug
    
    const usuario = await autenticarUsuario(tokenLimpio);
    console.log('Usuario encontrado:', usuario); // Debug
    
    if (!usuario) {
      return res.render('login', {
        title: 'Iniciar Sesión - Dardito',
        error: 'Token inválido o usuario no encontrado'
      });
    }

    // Crear sesión
    req.session.userId = usuario.id;
    
    console.log('Sesión creada para usuario:', usuario.id); // Debug
    
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.render('login', {
      title: 'Iniciar Sesión - Dardito',
      error: 'Error del servidor al autenticar: ' + error.message
    });
  }
});

/**
 * POST /logout - Cerrar sesión
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error cerrando sesión:', err);
    }
    res.redirect('/login');
  });
});

// ===============================
// RUTAS PROTEGIDAS
// ===============================

/**
 * GET /dashboard - Dashboard principal según rol
 */
router.get('/dashboard', requireAuth, checkProjectStatus, async (req, res) => {
  try {
    const dashboardData = await obtenerDashboard(req.user);
    
    // Verificar que dashboardData tenga la estructura esperada
    if (!dashboardData || typeof dashboardData !== 'object') {
      throw new Error('Datos del dashboard inválidos');
    }

    const templatesPorRol = {
      'miembro': 'dashboard/miembro',
      'scrumMaster': 'dashboard/scrummaster', 
      'lider': 'dashboard/lider',
      'auditor': 'dashboard/auditor'
    };

    const template = templatesPorRol[req.user.rol];
    
    if (!template) {
      return res.status(500).render('error', {
        message: 'Rol de usuario no válido',
        user: req.user
      });
    }

    res.render(template, {
      title: `Dashboard ${req.user.rol.charAt(0).toUpperCase() + req.user.rol.slice(1)} - Dardito`,
      user: req.user,
      ...dashboardData
    });
    
  } catch (error) {
    console.error('Error cargando dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: error.message // Mejor para debugging
    });
  }
});
/**
 * GET /iniciar-proyecto - Formulario para iniciar proyecto (solo líderes)
 */
router.get('/iniciar-proyecto', requireAuth, requireLider, async (req, res) => {
  try {
    res.render('iniciar-proyecto', {
      title: 'Iniciar Proyecto - Dardito',
      user: req.user,
      error: null // Asegurar que la variable 'error' siempre esté definida
    });
  } catch (error) {
    console.error('Error cargando página de inicio:', error);
    res.status(500).render('error', {
      message: 'Error cargando la página',
      user: req.user
    });
  }
});

/**
 * GET /proyecto-no-iniciado - Página informativa para usuarios no líderes cuando el proyecto no está iniciado
 */
router.get('/proyecto-no-iniciado', requireAuth, async (req, res) => {
  try {
    // Verificar que efectivamente el proyecto no esté iniciado
    const { verificarProyectoIniciado } = require('./auth');
    const proyectoIniciado = await verificarProyectoIniciado(req.user.grupo);
    
    // Si el proyecto ya está iniciado, redirigir al dashboard
    if (proyectoIniciado) {
      return res.redirect('/dashboard');
    }
    
    // Si es líder, redirigir a iniciar proyecto
    if (req.user.rol === 'lider') {
      return res.redirect('/iniciar-proyecto');
    }
    
    // Obtener información del líder del grupo para mostrar
    const { leerUsuarios } = require('./config');
    const usuarios = await leerUsuarios();
    const liderGrupo = Object.values(usuarios).find(user => 
      user.grupo === req.user.grupo && user.rol === 'lider'
    );
    
    res.render('proyecto-no-iniciado', {
      title: 'Proyecto No Iniciado - Dardito',
      user: req.user,
      liderGrupo: liderGrupo
    });
  } catch (error) {
    console.error('Error cargando página proyecto no iniciado:', error);
    res.status(500).render('error', {
      message: 'Error cargando la página',
      user: req.user
    });
  }
});

/**
 * POST /iniciar-proyecto - Procesar inicio de proyecto (solo líderes)
 */
router.post('/iniciar-proyecto', requireAuth, requireLider, async (req, res) => {
  try {
    const { cantidadProyectos, duracionSprintGenT, duracionSprintProyecto } = req.body;
    
    // Validaciones
    if (!cantidadProyectos || !duracionSprintGenT || !duracionSprintProyecto) {
      return res.render('iniciar-proyecto', {
        title: 'Iniciar Proyecto - Dardito',
        user: req.user,
        error: 'Todos los campos son requeridos'
      });
    }

    await inicializarProyecto(req.user.grupo, {
      cantidadProyectos: parseInt(cantidadProyectos),
      duracionSprintGenT: parseInt(duracionSprintGenT),
      duracionSprintProyecto: parseInt(duracionSprintProyecto)
    });

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error inicializando proyecto:', error);
    res.render('iniciar-proyecto', {
      title: 'Iniciar Proyecto - Dardito',
      user: req.user,
      error: error.message
    });
  }
});

// ===============================
// APIs REST - PRODUCT BACKLOG
// ===============================

/**
 * GET /api/backlog/:proyecto - Obtener product backlog
 */
router.get('/api/backlog/:proyecto', requireAuth, requireGroupAccess, async (req, res) => {
  try {
    const { proyecto } = req.params;
    const backlog = await obtenerProductBacklog(req.grupoObjetivo, proyecto, req.user);
    
    res.json({
      success: true,
      data: backlog
    });
  } catch (error) {
    console.error('Error obteniendo backlog:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/backlog/:proyecto - Agregar historia al backlog
 */
router.post('/api/backlog/:proyecto', requireAuth, requirePermission('escribir'), async (req, res) => {
  try {
    const { proyecto } = req.params;
    const historia = req.body;
    
    const id = await agregarHistoria(req.user.grupo, proyecto, historia, req.user.nickname);
    
    res.json({
      success: true,
      message: 'Historia agregada exitosamente',
      id: id
    });
  } catch (error) {
    console.error('Error agregando historia:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/backlog/:proyecto/mover-a-sprint - Mover historia a sprint
 */
router.post('/api/backlog/:proyecto/mover-a-sprint', requireAuth, requirePermission('escribir'), async (req, res) => {
  try {
    const { proyecto } = req.params;
    const { historiaId } = req.body;
    
    await moverHistoriaASprint(req.user.grupo, proyecto, historiaId);
    
    res.json({
      success: true,
      message: 'Historia movida al sprint exitosamente'
    });
  } catch (error) {
    console.error('Error moviendo historia:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===============================
// APIs REST - TAREAS
// ===============================

/**
 * GET /api/tareas - Obtener tareas del usuario
 */
router.get('/api/tareas', requireAuth, async (req, res) => {
  try {
    const tareas = await obtenerTareasUsuario(req.user.grupo, req.user);
    
    res.json({
      success: true,
      data: tareas
    });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tareas/:proyecto/:sprint - Obtener tareas de un sprint específico
 */
router.get('/api/tareas/:proyecto/:sprint', requireAuth, requirePermission('leer'), async (req, res) => {
  try {
    const { proyecto, sprint } = req.params;
    const tareas = await obtenerTareasSprint(req.user.grupo, proyecto, sprint);
    
    res.json({
      success: true,
      data: tareas
    });
  } catch (error) {
    console.error('Error obteniendo tareas del sprint:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/tareas/:proyecto/:sprint - Crear nueva tarea
 */
router.post('/api/tareas/:proyecto/:sprint', requireAuth, requirePermission('escribir'), async (req, res) => {
  try {
    const { proyecto, sprint } = req.params;
    const tarea = req.body;
    
    const id = await crearTarea(req.user.grupo, proyecto, sprint, tarea);
    
    // Actualizar burndown chart
    await actualizarBurndownChart(req.user.grupo, proyecto, sprint);
    
    res.json({
      success: true,
      message: 'Tarea creada exitosamente',
      id: id
    });
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/tareas/:proyecto/:sprint/:tareaId/estado - Actualizar estado de tarea
 */
router.put('/api/tareas/:proyecto/:sprint/:tareaId/estado', requireAuth, async (req, res) => {
  try {
    const { proyecto, sprint, tareaId } = req.params;
    const { estado } = req.body;
    
    await actualizarEstadoTarea(req.user.grupo, proyecto, sprint, tareaId, estado, req.user);
    
    // Actualizar burndown chart
    await actualizarBurndownChart(req.user.grupo, proyecto, sprint);
    
    res.json({
      success: true,
      message: 'Estado de tarea actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando estado de tarea:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===============================
// APIs REST - MÉTRICAS
// ===============================

/**
 * GET /api/metricas - Obtener métricas del equipo
 */
router.get('/api/metricas', requireAuth, requireScrumMaster, async (req, res) => {
  try {
    const metricas = await calcularMetricasEquipo(req.user.grupo);
    
    res.json({
      success: true,
      data: metricas
    });
  } catch (error) {
    console.error('Error obteniendo métricas:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/burndown/:proyecto/:sprint - Obtener datos del burndown chart
 */
router.get('/api/burndown/:proyecto/:sprint', requireAuth, requireScrumMaster, async (req, res) => {
  try {
    const { proyecto, sprint } = req.params;
    const { leerDB } = require('./config');
    
    const db = await leerDB();
    const burndownData = db[req.user.grupo][proyecto][sprint].burndownChart;
    
    res.json({
      success: true,
      data: burndownData
    });
  } catch (error) {
    console.error('Error obteniendo burndown chart:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===============================
// APIs ADMINISTRATIVAS
// ===============================

/**
 * GET /api/admin/usuarios - Obtener todos los usuarios (solo admin)
 */
router.get('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { leerUsuarios } = require('./config');
    const usuarios = await leerUsuarios();
    
    res.json({
      success: true,
      data: usuarios
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/usuarios/:userId/rol - Cambiar rol de usuario
 */
router.put('/api/admin/usuarios/:userId/rol', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { rol } = req.body;
    
    await cambiarRolUsuario(userId, rol);
    
    res.json({
      success: true,
      message: 'Rol actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error cambiando rol:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/estadisticas - Obtener estadísticas globales
 */
router.get('/api/admin/estadisticas', requireAuth, requireAdmin, async (req, res) => {
  try {
    const estadisticas = await obtenerEstadisticasGlobales();
    
    res.json({
      success: true,
      data: estadisticas
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas globales:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/admin/grupos - Obtener datos de todos los grupos
 */
router.get('/api/admin/grupos', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { leerDB } = require('./config');
    const db = await leerDB();
    
    res.json({
      success: true,
      data: db
    });
  } catch (error) {
    console.error('Error obteniendo datos de grupos:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===============================
// APIs DE GESTIÓN DE SPRINTS
// ===============================

/**
 * POST /api/sprint/avanzar/:proyecto - Avanzar al siguiente sprint
 */
router.post('/api/sprint/avanzar/:proyecto', requireAuth, requirePermission('escribir'), async (req, res) => {
  try {
    const { proyecto } = req.params;
    const { leerDB, escribirDB, calcularFechaFin } = require('./config');
    
    const db = await leerDB();
    const proyectoData = db[req.user.grupo][proyecto];
    
    if (!proyectoData) {
      throw new Error('Proyecto no encontrado');
    }

    const sprintActual = parseInt(proyectoData.sprintActual);
    const siguienteSprint = sprintActual + 1;
    
    // Verificar que el sprint actual esté completo
    const sprintData = proyectoData[`sprint${sprintActual}`];
    const tareas = Object.values(sprintData.tasks || {});
    const tareasIncompletas = tareas.filter(t => t.estado !== 'COMPLETADO');
    
    if (tareasIncompletas.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Quedan ${tareasIncompletas.length} tareas sin completar en el sprint actual`
      });
    }

    // Crear siguiente sprint si no existe
    if (!proyectoData[`sprint${siguienteSprint}`]) {
      const duracionSprint = proyecto === 'GenT' ? 
        db[req.user.grupo]['duracion-sprint-gent'] : 
        db[req.user.grupo]['duracion-sprint-proyecto'];
      
      const ultimoSprint = proyectoData[`sprint${sprintActual}`];
      proyectoData[`sprint${siguienteSprint}`] = {
        fechaIni: ultimoSprint.fechaFin,
        fechaFin: calcularFechaFin(ultimoSprint.fechaFin, duracionSprint),
        scrumBoard: [],
        tasks: {},
        burndownChart: {
          plannedWork: [],
          actualWork: []
        }
      };
    }

    // Actualizar sprint actual
    proyectoData.sprintActual = siguienteSprint.toString();
    
    await escribirDB(db);
    
    res.json({
      success: true,
      message: `Avanzado al sprint ${siguienteSprint}`
    });
  } catch (error) {
    console.error('Error avanzando sprint:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ===============================
// APIs DE REPORTES Y ANÁLISIS
// ===============================

/**
 * GET /api/reportes/velocidad - Obtener reporte de velocidad del equipo
 */
router.get('/api/reportes/velocidad', requireAuth, requireScrumMaster, async (req, res) => {
  try {
    const { leerDB } = require('./config');
    const db = await leerDB();
    const grupoData = db[req.user.grupo];
    
    const reporteVelocidad = {
      sprintsPorProyecto: {},
      velocidadPromedio: 0,
      tendencia: 'estable'
    };

    // Calcular velocidad por proyecto
    for (const [proyectoNombre, proyectoData] of Object.entries(grupoData)) {
      if (!proyectoData || !proyectoData.sprintActual) continue;
      
      reporteVelocidad.sprintsPorProyecto[proyectoNombre] = [];
      
      for (let i = 1; i <= parseInt(proyectoData.sprintActual); i++) {
        const sprint = proyectoData[`sprint${i}`];
        if (sprint && sprint.tasks) {
          const storyPointsCompletados = Object.values(sprint.tasks)
            .filter(t => t.estado === 'COMPLETADO')
            .reduce((sum, t) => sum + (t.estimacion || 0), 0);
          
          reporteVelocidad.sprintsPorProyecto[proyectoNombre].push({
            sprint: i,
            storyPoints: storyPointsCompletados
          });
        }
      }
    }

    res.json({
      success: true,
      data: reporteVelocidad
    });
  } catch (error) {
    console.error('Error generando reporte de velocidad:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/reportes/progreso - Obtener reporte de progreso general
 */
router.get('/api/reportes/progreso', requireAuth, requireScrumMaster, async (req, res) => {
  try {
    const metricas = await calcularMetricasEquipo(req.user.grupo);
    
    const reporteProgreso = {
      ...metricas,
      porcentajeCompletado: metricas.totalStoryPoints > 0 ? 
        Math.round((metricas.completedStoryPoints / metricas.totalStoryPoints) * 100) : 0,
      eficiencia: metricas.tareasTotal > 0 ?
        Math.round((metricas.tareasCompletadas / metricas.tareasTotal) * 100) : 0
    };

    res.json({
      success: true,
      data: reporteProgreso
    });
  } catch (error) {
    console.error('Error generando reporte de progreso:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /backlog/:proyecto - Página de gestión del product backlog
 */
router.get('/backlog/:proyecto', requireAuth, checkProjectStatus, async (req, res) => {
  try {
    const { proyecto } = req.params;
    const backlog = await obtenerProductBacklog(req.user.grupo, proyecto, req.user);
    
    res.render('backlog', {
      title: `Product Backlog - ${proyecto}`,
      user: req.user,
      proyecto: proyecto,
      backlog: backlog
    });
  } catch (error) {
    console.error('Error cargando página de backlog:', error);
    res.status(500).render('error', {
      message: 'Error cargando el product backlog',
      user: req.user
    });
  }
});

/**
 * GET /sprint/:proyecto/:sprint - Página de gestión del sprint
 */
router.get('/sprint/:proyecto/:sprint', requireAuth, checkProjectStatus, async (req, res) => {
  try {
    const { proyecto, sprint } = req.params;
    const tareas = await obtenerTareasSprint(req.user.grupo, proyecto, sprint);
    
    res.render('sprint', {
      title: `Sprint ${sprint} - ${proyecto}`,
      user: req.user,
      proyecto: proyecto,
      sprint: sprint,
      tareas: tareas
    });
  } catch (error) {
    console.error('Error cargando página de sprint:', error);
    res.status(500).render('error', {
      message: 'Error cargando el sprint',
      user: req.user
    });
  }
});

/**
 * GET /metricas - Página de métricas y reportes
 */
router.get('/metricas', requireAuth, requireScrumMaster, checkProjectStatus, async (req, res) => {
  try {
    const metricas = await calcularMetricasEquipo(req.user.grupo);
    
    res.render('metricas', {
      title: 'Métricas del Equipo - Dardito',
      user: req.user,
      metricas: metricas
    });
  } catch (error) {
    console.error('Error cargando página de métricas:', error);
    res.status(500).render('error', {
      message: 'Error cargando las métricas',
      user: req.user
    });
  }
});

/**
 * GET /api/scrumboard/:proyecto/:sprint - Obtener scrumboard del sprint
 */
router.get('/api/scrumboard/:proyecto/:sprint', requireAuth, requirePermission('leer'), async (req, res) => {
  try {
    const { proyecto, sprint } = req.params;
    
    const scrumboard = await obtenerScrumboardSprint(req.user.grupo, proyecto, sprint);
    
    res.json({
      success: true,
      data: scrumboard,
      total: scrumboard.length
    });
  } catch (error) {
    console.error('Error obteniendo scrumboard:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/scrumboard/:proyecto/:sprint/estadisticas - Estadísticas del scrumboard
 */
router.get('/api/scrumboard/:proyecto/:sprint/estadisticas', requireAuth, requirePermission('leer'), async (req, res) => {
  try {
    const { proyecto, sprint } = req.params;
    
    const estadisticas = await obtenerEstadisticasScrumboard(req.user.grupo, proyecto, sprint);
    
    res.json({
      success: true,
      data: estadisticas
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del scrumboard:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /admin - Panel de administración
 */
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const estadisticas = await obtenerEstadisticasGlobales();
    const { leerUsuarios } = require('./config');
    const usuarios = await leerUsuarios();
    
    res.render('admin', {
      title: 'Panel de Administración - Dardito',
      user: req.user,
      estadisticas: estadisticas,
      usuarios: usuarios
    });
  } catch (error) {
    console.error('Error cargando panel de administración:', error);
    res.status(500).render('error', {
      message: 'Error cargando el panel de administración',
      user: req.user
    });
  }
});

/**
 * Middleware para manejar errores 404 en APIs
 */
router.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint de API no encontrado'
  });
});

/**
 * Página de error personalizada
 */
router.get('/error', (req, res) => {
  res.render('error', {
    title: 'Error - Dardito',
    message: 'Ha ocurrido un error en el sistema',
    user: req.user || null
  });
});

module.exports = router;