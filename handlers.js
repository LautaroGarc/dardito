const { 
  leerUsuarios, 
  escribirUsuarios, 
  leerDB, 
  escribirDB,
  obtenerFechaActual,
  calcularFechaFin,
  generarIdHistoria,
  generarIdTarea,
  validarHistoria,
  validarTarea
} = require('./config');

/**
 * Autentica un usuario con su token
 * @param {string} token - Token de autenticación
 * @returns {Promise<Object|null>} - Datos del usuario o null si no es válido
 */
async function autenticarUsuario(token) {
  try {
    const usuarios = await leerUsuarios();
    
    for (const [userId, userData] of Object.entries(usuarios)) {
      if (userData.token === token) {
        return {
          id: userId,
          ...userData
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error en autenticación:', error);
    return null;
  }
}

/**
 * Inicializa un proyecto para un grupo específico
 * @param {string} grupo - Nombre del grupo
 * @param {Object} configuracion - Configuración del proyecto
 */
async function inicializarProyecto(grupo, configuracion) {
  try {
    const db = await leerDB();
    const fechaActual = obtenerFechaActual();
    
    // Validar configuración
    const { cantidadProyectos, duracionSprintGenT, duracionSprintProyecto } = configuracion;
    
    if (!cantidadProyectos || cantidadProyectos < 1 || cantidadProyectos > 2) {
      throw new Error('Cantidad de proyectos debe ser 1 o 2');
    }

    // Inicializar estructura del grupo
    db[grupo] = {
      started: 'y',
      'duracion-sprint-gent': parseInt(duracionSprintGenT),
      'duracion-sprint-proyecto': parseInt(duracionSprintProyecto),
      GenT: {
        sprintActual: '1',
        productBacklog: [],
        sprint1: {
          fechaIni: fechaActual,
          fechaFin: calcularFechaFin(fechaActual, parseInt(duracionSprintGenT)),
          scrumBoard: [],
          tasks: {},
          burndownChart: {
            plannedWork: [],
            actualWork: []
          }
        }
      },
      Proy: {
        sprintActual: '1',
        productBacklog: [],
        sprint1: {
          fechaIni: fechaActual,
          fechaFin: calcularFechaFin(fechaActual, parseInt(duracionSprintProyecto)),
          scrumBoard: [],
          tasks: {},
          burndownChart: {
            plannedWork: [],
            actualWork: []
          }
        }
      },
      estadisticas: {
        velocidadEquipo: [],
        satisfaccionCliente: [],
        metricas: {
          totalStoryPoints: 0,
          completedStoryPoints: 0,
          averageVelocity: 0
        }
      },
      Proy2: cantidadProyectos === 2 ? {
        sprintActual: '1',
        productBacklog: [],
        sprint1: {
          fechaIni: fechaActual,
          fechaFin: calcularFechaFin(fechaActual, parseInt(duracionSprintProyecto)),
          scrumBoard: [],
          tasks: {},
          burndownChart: {
            plannedWork: [],
            actualWork: []
          }
        }
      } : null
    };

    // Crear sprints adicionales para GenT si es necesario
    const maxSprints = Math.max(parseInt(duracionSprintGenT), parseInt(duracionSprintProyecto));
    for (let i = 2; i <= maxSprints + 1; i++) {
      const sprintAnterior = db[grupo].GenT[`sprint${i-1}`];
      if (sprintAnterior) {
        db[grupo].GenT[`sprint${i}`] = {
          fechaIni: sprintAnterior.fechaFin,
          fechaFin: calcularFechaFin(sprintAnterior.fechaFin, parseInt(duracionSprintGenT)),
          scrumBoard: [],
          tasks: {},
          burndownChart: {
            plannedWork: [],
            actualWork: []
          }
        };
      }
    }

    await escribirDB(db);
  } catch (error) {
    console.error('Error inicializando proyecto:', error);
    throw error;
  }
}

/**
 * Agrega una historia de usuario al product backlog
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {Object} historia - Datos de la historia
 * @param {string} creador - Nombre del creador
 */
async function agregarHistoria(grupo, proyecto, historia, creador) {
  try {
    if (!validarHistoria(historia)) {
      throw new Error('Datos de historia incompletos');
    }

    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto]) {
      throw new Error('Proyecto no encontrado');
    }

    const id = generarIdHistoria();
    const fechaCreacion = new Date().toISOString();
    
    const nuevaHistoria = [
      id,
      historia.titulo,
      historia.como,
      historia.quiero,
      historia.para,
      historia.prioridad,
      parseInt(historia.storyPoints),
      'POR_HACER',
      fechaCreacion,
      creador
    ];

    db[grupo][proyecto].productBacklog.push(nuevaHistoria);
    
    // Actualizar métricas
    if (db[grupo].estadisticas) {
      db[grupo].estadisticas.metricas.totalStoryPoints += parseInt(historia.storyPoints);
    }

    await escribirDB(db);
    return id;
  } catch (error) {
    console.error('Error agregando historia:', error);
    throw error;
  }
}

/**
 * Obtiene las historias del product backlog filtradas por permisos del usuario
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {Object} usuario - Datos del usuario
 */
async function obtenerProductBacklog(grupo, proyecto, usuario) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto]) {
      return [];
    }

    const backlog = db[grupo][proyecto].productBacklog || [];
    
    // Administradores y líderes ven todo
    if (usuario.rol === 'auditor' || usuario.rol === 'lider') {
      return backlog;
    }
    
    // Scrum masters ven todo pero solo lectura
    if (usuario.rol === 'scrumMaster') {
      return backlog;
    }
    
    // Miembros ven solo historias relevantes para ellos
    return backlog.filter(historia => {
      // Lógica para filtrar historias relevantes para miembros
      return true; // Por ahora retornamos todas
    });
  } catch (error) {
    console.error('Error obteniendo product backlog:', error);
    throw error;
  }
}

/**
 * Crea una tarea técnica y la asigna a miembros del equipo
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint actual
 * @param {Object} tarea - Datos de la tarea
 */
async function crearTarea(grupo, proyecto, sprint, tarea) {
  try {
    if (!validarTarea(tarea)) {
      throw new Error('Datos de tarea incompletos');
    }

    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    const idTarea = generarIdTarea();
    const fechaCreacion = new Date().toISOString();
    
    const nuevaTarea = {
      id: idTarea,
      nombre: tarea.nombre,
      descripcion: tarea.descripcion,
      estado: 'POR_HACER',
      personas_asignadas: tarea.personasAsignadas || [],
      fechaCreacion: fechaCreacion,
      fechaActualizacion: fechaCreacion,
      historia_id: tarea.historiaId || null,
      estimacion: parseInt(tarea.estimacion) || 0
    };

    db[grupo][proyecto][sprint].tasks[idTarea] = nuevaTarea;
    
    // Actualizar scrum board si es necesario
    db[grupo][proyecto][sprint].scrumBoard.push(idTarea);

    await escribirDB(db);
    return idTarea;
  } catch (error) {
    console.error('Error creando tarea:', error);
    throw error;
  }
}

/**
 * Actualiza el estado de una tarea
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint actual
 * @param {string} tareaId - ID de la tarea
 * @param {string} nuevoEstado - Nuevo estado
 * @param {Object} usuario - Usuario que realiza el cambio
 */
async function actualizarEstadoTarea(grupo, proyecto, sprint, tareaId, nuevoEstado, usuario) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    const tarea = db[grupo][proyecto][sprint].tasks[tareaId];
    if (!tarea) {
      throw new Error('Tarea no encontrada');
    }

    // Verificar permisos
    const { puedeModificarTarea } = require('./auth');
    if (!puedeModificarTarea(usuario, tarea)) {
      throw new Error('Sin permisos para modificar esta tarea');
    }

    const estadosValidos = ['POR_HACER', 'EN_PROCESO', 'COMPLETADO'];
    if (!estadosValidos.includes(nuevoEstado)) {
      throw new Error('Estado inválido');
    }

    tarea.estado = nuevoEstado;
    tarea.fechaActualizacion = new Date().toISOString();
    
    // Si se completa la tarea, actualizar estadísticas del usuario
    if (nuevoEstado === 'COMPLETADO') {
      await actualizarEstadisticasUsuario(usuario.id, 'tareas_completadas');
    }

    await escribirDB(db);
  } catch (error) {
    console.error('Error actualizando estado de tarea:', error);
    throw error;
  }
}

/**
 * Obtiene las tareas de un usuario específico
 * @param {string} grupo - Nombre del grupo
 * @param {Object} usuario - Datos del usuario
 */
async function obtenerTareasUsuario(grupo, usuario) {
  try {
    const db = await leerDB();
    
    if (!db[grupo]) {
      return {};
    }

    const tareas = {};
    
    // Recorrer todos los proyectos del grupo
    for (const [proyectoNombre, proyectoData] of Object.entries(db[grupo])) {
      if (!proyectoData || typeof proyectoData !== 'object' || !proyectoData.sprintActual) {
        continue;
      }

      tareas[proyectoNombre] = {};
      
      // Recorrer todos los sprints del proyecto
      for (const [sprintNombre, sprintData] of Object.entries(proyectoData)) {
        if (!sprintNombre.startsWith('sprint') || !sprintData.tasks) {
          continue;
        }

        const tareasDelSprint = Object.values(sprintData.tasks).filter(tarea => {
          const { puedeAccederTarea } = require('./auth');
          return puedeAccederTarea(usuario, tarea);
        });

        if (tareasDelSprint.length > 0) {
          tareas[proyectoNombre][sprintNombre] = tareasDelSprint;
        }
      }
    }

    return tareas;
  } catch (error) {
    console.error('Error obteniendo tareas del usuario:', error);
    throw error;
  }
}

/**
 * Calcula métricas del equipo
 * @param {string} grupo - Nombre del grupo
 */
async function calcularMetricasEquipo(grupo) {
  try {
    const db = await leerDB();
    
    if (!db[grupo]) {
      throw new Error('Grupo no encontrado');
    }

    const metricas = {
      totalStoryPoints: 0,
      completedStoryPoints: 0,
      averageVelocity: 0,
      tareasTotal: 0,
      tareasCompletadas: 0,
      miembrosActivos: 0
    };

    // Calcular métricas de todos los proyectos
    for (const [proyectoNombre, proyectoData] of Object.entries(db[grupo])) {
      if (!proyectoData || typeof proyectoData !== 'object' || !proyectoData.productBacklog) {
        continue;
      }

      // Contar story points del product backlog
      proyectoData.productBacklog.forEach(historia => {
        const storyPoints = parseInt(historia[6]) || 0;
        metricas.totalStoryPoints += storyPoints;
        
        if (historia[7] === 'COMPLETADO') {
          metricas.completedStoryPoints += storyPoints;
        }
      });

      // Contar tareas de todos los sprints
      for (const [sprintNombre, sprintData] of Object.entries(proyectoData)) {
        if (!sprintNombre.startsWith('sprint') || !sprintData.tasks) {
          continue;
        }

        Object.values(sprintData.tasks).forEach(tarea => {
          metricas.tareasTotal++;
          if (tarea.estado === 'COMPLETADO') {
            metricas.tareasCompletadas++;
          }
        });
      }
    }

    // Calcular velocidad promedio (story points completados / sprints transcurridos)
    const sprintsTranscurridos = calcularSprintsTranscurridos(db[grupo]);
    metricas.averageVelocity = sprintsTranscurridos > 0 ? 
      Math.round(metricas.completedStoryPoints / sprintsTranscurridos * 100) / 100 : 0;

    // Contar miembros activos del grupo
    const usuarios = await leerUsuarios();
    metricas.miembrosActivos = Object.values(usuarios).filter(user => user.grupo === grupo).length;

    // Actualizar métricas en la base de datos
    if (!db[grupo].estadisticas) {
      db[grupo].estadisticas = { velocidadEquipo: [], satisfaccionCliente: [], metricas: {} };
    }
    
    db[grupo].estadisticas.metricas = metricas;
    await escribirDB(db);

    return metricas;
  } catch (error) {
    console.error('Error calculando métricas:', error);
    throw error;
  }
}

/**
 * Calcula cuántos sprints han transcurrido
 * @param {Object} grupoData - Datos del grupo
 * @returns {number} - Número de sprints transcurridos
 */
function calcularSprintsTranscurridos(grupoData) {
  let sprints = 0;
  
  // Contar sprints de GenT
  for (let i = 1; i <= 10; i++) {
    if (grupoData.GenT && grupoData.GenT[`sprint${i}`]) {
      const sprint = grupoData.GenT[`sprint${i}`];
      const fechaFin = new Date(sprint.fechaFin[2], sprint.fechaFin[1] - 1, sprint.fechaFin[0]);
      if (fechaFin <= new Date()) {
        sprints++;
      }
    }
  }
  
  return sprints;
}

/**
 * Obtiene el dashboard según el rol del usuario
 * @param {Object} usuario - Datos del usuario
 */
async function obtenerDashboard(usuario) {
  try {
    const dashboardData = {
      usuario: usuario,
      proyectoIniciado: false,
      proyectos: {},
      metricas: {},
      tareas: {}
    };

    // Verificar si es administrador
    if (usuario.rol === 'auditor') {
      return await obtenerDashboardAdmin(dashboardData);
    }

    const db = await leerDB();
    const grupoData = db[usuario.grupo];
    
    if (!grupoData || grupoData.started !== 'y') {
      return dashboardData;
    }

    dashboardData.proyectoIniciado = true;

    // Obtener datos específicos según el rol
    switch (usuario.rol) {
      case 'miembro':
        dashboardData.tareas = await obtenerTareasUsuario(usuario.grupo, usuario);
        break;
        
      case 'scrumMaster':
        dashboardData.tareas = await obtenerTareasUsuario(usuario.grupo, usuario);
        dashboardData.metricas = await calcularMetricasEquipo(usuario.grupo);
        break;
        
      case 'lider':
        dashboardData.proyectos = {
          GenT: grupoData.GenT,
          Proy: grupoData.Proy,
          Proy2: grupoData.Proy2
        };
        dashboardData.metricas = await calcularMetricasEquipo(usuario.grupo);
        break;
    }

    return dashboardData;
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    throw error;
  }
}

/**
 * Obtiene dashboard para administradores con vista de todos los grupos
 * @param {Object} dashboardData - Datos base del dashboard
 */
async function obtenerDashboardAdmin(dashboardData) {
  try {
    const db = await leerDB();
    const usuarios = await leerUsuarios();
    
    dashboardData.proyectoIniciado = true;
    dashboardData.todosLosGrupos = {};
    dashboardData.estadisticasGlobales = {
      gruposActivos: 0,
      usuariosTotal: Object.keys(usuarios).length,
      proyectosIniciados: 0
    };

    // Obtener datos de todos los grupos
    for (const [nombreGrupo, grupoData] of Object.entries(db)) {
      if (nombreGrupo.startsWith('Grupo') && grupoData) {
        dashboardData.todosLosGrupos[nombreGrupo] = {
          iniciado: grupoData.started === 'y',
          miembros: Object.values(usuarios).filter(user => user.grupo === nombreGrupo),
          proyectos: {
            GenT: grupoData.GenT,
            Proy: grupoData.Proy,
            Proy2: grupoData.Proy2
          }
        };
        
        if (grupoData.started === 'y') {
          dashboardData.estadisticasGlobales.proyectosIniciados++;
        }
        
        dashboardData.estadisticasGlobales.gruposActivos++;
      }
    }

    return dashboardData;
  } catch (error) {
    console.error('Error obteniendo dashboard admin:', error);
    throw error;
  }
}

/**
 * Actualiza las estadísticas de un usuario
 * @param {string} userId - ID del usuario
 * @param {string} metrica - Métrica a actualizar
 * @param {number} incremento - Valor a incrementar (default: 1)
 */
async function actualizarEstadisticasUsuario(userId, metrica, incremento = 1) {
  try {
    const usuarios = await leerUsuarios();
    
    if (!usuarios[userId]) {
      throw new Error('Usuario no encontrado');
    }

    const indiceMetrica = {
      'segundos_en_llamada': 0,
      'tareas_asignadas': 1,
      'tareas_completadas': 2
    };

    const indice = indiceMetrica[metrica];
    if (indice !== undefined) {
      usuarios[userId].stats[indice] += incremento;
      await escribirUsuarios(usuarios);
    }
  } catch (error) {
    console.error('Error actualizando estadísticas:', error);
    throw error;
  }
}

/**
 * Mueve una historia al sprint actual
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} historiaId - ID de la historia
 */
async function moverHistoriaASprint(grupo, proyecto, historiaId) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto]) {
      throw new Error('Proyecto no encontrado');
    }

    const backlog = db[grupo][proyecto].productBacklog;
    const historiaIndex = backlog.findIndex(h => h[0] === historiaId);
    
    if (historiaIndex === -1) {
      throw new Error('Historia no encontrada');
    }

    const historia = backlog[historiaIndex];
    const sprintActual = db[grupo][proyecto].sprintActual;
    
    // Mover al scrum board del sprint actual
    if (!db[grupo][proyecto][`sprint${sprintActual}`].scrumBoard.includes(historiaId)) {
      db[grupo][proyecto][`sprint${sprintActual}`].scrumBoard.push(historiaId);
    }

    await escribirDB(db);
  } catch (error) {
    console.error('Error moviendo historia a sprint:', error);
    throw error;
  }
}

/**
 * Obtiene todas las tareas de un sprint específico
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint específico
 */
async function obtenerTareasSprint(grupo, proyecto, sprint) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    return db[grupo][proyecto][sprint].tasks || {};
  } catch (error) {
    console.error('Error obteniendo tareas del sprint:', error);
    throw error;
  }
}

/**
 * Actualiza los datos del burndown chart
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint actual
 */
async function actualizarBurndownChart(grupo, proyecto, sprint) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    const sprintData = db[grupo][proyecto][sprint];
    const tareas = Object.values(sprintData.tasks || {});
    
    const trabajoTotal = tareas.reduce((sum, tarea) => sum + (tarea.estimacion || 0), 0);
    const trabajoCompletado = tareas
      .filter(tarea => tarea.estado === 'COMPLETADO')
      .reduce((sum, tarea) => sum + (tarea.estimacion || 0), 0);
    
    const trabajoRestante = trabajoTotal - trabajoCompletado;
    const fechaActual = new Date().toISOString().split('T')[0];

    // Actualizar datos del burndown chart
    if (!sprintData.burndownChart) {
      sprintData.burndownChart = { plannedWork: [], actualWork: [] };
    }

    // Agregar punto actual si no existe para esta fecha
    const existePunto = sprintData.burndownChart.actualWork.some(punto => punto.fecha === fechaActual);
    if (!existePunto) {
      sprintData.burndownChart.actualWork.push({
        fecha: fechaActual,
        trabajo: trabajoRestante
      });
    }

    await escribirDB(db);
  } catch (error) {
    console.error('Error actualizando burndown chart:', error);
    throw error;
  }
}

/**
 * Cambia el rol de un usuario (solo para administradores)
 * @param {string} userId - ID del usuario
 * @param {string} nuevoRol - Nuevo rol
 */
async function cambiarRolUsuario(userId, nuevoRol) {
  try {
    const usuarios = await leerUsuarios();
    
    if (!usuarios[userId]) {
      throw new Error('Usuario no encontrado');
    }

    const rolesValidos = ['miembro', 'scrumMaster', 'lider', 'auditor'];
    if (!rolesValidos.includes(nuevoRol)) {
      throw new Error('Rol inválido');
    }

    usuarios[userId].rol = nuevoRol;
    await escribirUsuarios(usuarios);
  } catch (error) {
    console.error('Error cambiando rol de usuario:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas globales del sistema
 */
async function obtenerEstadisticasGlobales() {
  try {
    const db = await leerDB();
    const usuarios = await leerUsuarios();
    
    const estadisticas = {
      grupos: {
        total: 0,
        iniciados: 0,
        pendientes: 0
      },
      usuarios: {
        total: Object.keys(usuarios).length,
        porRol: {
          miembro: 0,
          scrumMaster: 0,
          lider: 0,
          auditor: 0
        }
      },
      proyectos: {
        totalHistorias: 0,
        historiasCompletadas: 0,
        totalTareas: 0,
        tareasCompletadas: 0
      }
    };

    // Contar usuarios por rol
    Object.values(usuarios).forEach(usuario => {
      if (estadisticas.usuarios.porRol[usuario.rol] !== undefined) {
        estadisticas.usuarios.porRol[usuario.rol]++;
      }
    });

    // Analizar grupos y proyectos
    for (const [nombreGrupo, grupoData] of Object.entries(db)) {
      if (nombreGrupo.startsWith('Grupo')) {
        estadisticas.grupos.total++;
        
        if (grupoData && grupoData.started === 'y') {
          estadisticas.grupos.iniciados++;
          
          // Contar historias y tareas
          for (const [proyectoNombre, proyectoData] of Object.entries(grupoData)) {
            if (proyectoData && proyectoData.productBacklog) {
              estadisticas.proyectos.totalHistorias += proyectoData.productBacklog.length;
              estadisticas.proyectos.historiasCompletadas += 
                proyectoData.productBacklog.filter(h => h[7] === 'COMPLETADO').length;
              
              // Contar tareas de todos los sprints
              for (const [sprintNombre, sprintData] of Object.entries(proyectoData)) {
                if (sprintNombre.startsWith('sprint') && sprintData.tasks) {
                  const tareas = Object.values(sprintData.tasks);
                  estadisticas.proyectos.totalTareas += tareas.length;
                  estadisticas.proyectos.tareasCompletadas += 
                    tareas.filter(t => t.estado === 'COMPLETADO').length;
                }
              }
            }
          }
        } else {
          estadisticas.grupos.pendientes++;
        }
      }
    }

    return estadisticas;
  } catch (error) {
    console.error('Error obteniendo estadísticas globales:', error);
    throw error;
  }
}

module.exports = {
  autenticarUsuario,
  inicializarProyecto,
  agregarHistoria,
  obtenerProductBacklog,
  crearTarea,
  actualizarEstadoTarea,
  obtenerTareasUsuario,
  calcularMetricasEquipo,
  obtenerDashboard,
  actualizarEstadisticasUsuario,
  moverHistoriaASprint,
  obtenerTareasSprint,
  actualizarBurndownChart,
  cambiarRolUsuario,
  obtenerEstadisticasGlobales
};