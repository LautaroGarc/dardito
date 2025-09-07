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

async function autenticarUsuario(token) {
  try {
    console.log('=== AUTENTICACIÓN DEBUG ===');
    console.log('Token recibido:', JSON.stringify(token));
    console.log('Tipo de token:', typeof token);
    console.log('Longitud del token:', token ? token.length : 'undefined');
    
    if (!token) {
      console.log('ERROR: Token vacío o undefined');
      return null;
    }
    
    const tokenLimpio = token.toString().trim().replace(/[^\w]/g, '');
    console.log('Token limpio:', JSON.stringify(tokenLimpio));
    console.log('Longitud token limpio:', tokenLimpio.length);
    
    const usuarios = await leerUsuarios();
    console.log('Total usuarios cargados:', Object.keys(usuarios).length);
    
    for (const [userId, userData] of Object.entries(usuarios)) {
      console.log(`\n--- Usuario ${userId} ---`);
      console.log('Nickname:', userData.nickname);
      console.log('Rol:', userData.rol);
      console.log('Grupo:', userData.grupo);
      console.log('Token almacenado:', JSON.stringify(userData.token));
      console.log('Token limpio almacenado:', userData.token ? userData.token.trim() : 'undefined');
      
      const tokenAlmacenadoLimpio = userData.token ? userData.token.toString().trim() : '';
      console.log('Comparación:', `"${tokenLimpio}" === "${tokenAlmacenadoLimpio}"`, '=', tokenLimpio === tokenAlmacenadoLimpio);
      
      if (tokenLimpio === tokenAlmacenadoLimpio) {
        console.log('¡¡¡ TOKEN ENCONTRADO !!!');
        console.log('Usuario autenticado:', userData.nickname);
        return {
          id: userId,
          ...userData
        };
      }
    }
    
    console.log('❌ TOKEN NO ENCONTRADO EN NINGÚN USUARIO');
    return null;
  } catch (error) {
    console.error('💥 ERROR CRÍTICO en autenticación:', error);
    console.error('Stack trace:', error.stack);
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
    console.log('🚀 Inicializando proyecto para grupo:', grupo);
    console.log('Configuración:', configuracion);
    
    const db = await leerDB();
    const fechaActual = obtenerFechaActual();
    const { cantidadProyectos, duracionSprintGenT, duracionSprintProyecto } = configuracion;
    
    if (!cantidadProyectos || cantidadProyectos < 1 || cantidadProyectos > 2) {
      throw new Error('Cantidad de proyectos debe ser 1 o 2');
    }

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
    console.log('✅ Proyecto inicializado exitosamente');
  } catch (error) {
    console.error('💥 Error inicializando proyecto:', error);
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
    
    if (usuario.rol === 'auditor' || usuario.rol === 'lider') {
      return backlog;
    }
    
    if (usuario.rol === 'scrumMaster') {
      return backlog;
    }
    
    return backlog.filter(historia => {
      return true;
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
    
    for (const [proyectoNombre, proyectoData] of Object.entries(db[grupo])) {
      if (!proyectoData || typeof proyectoData !== 'object' || !proyectoData.sprintActual) {
        continue;
      }

      tareas[proyectoNombre] = {};
      
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

    for (const [proyectoNombre, proyectoData] of Object.entries(db[grupo])) {
      if (!proyectoData || typeof proyectoData !== 'object' || !proyectoData.productBacklog) {
        continue;
      }

      proyectoData.productBacklog.forEach(historia => {
        const storyPoints = parseInt(historia[6]) || 0;
        metricas.totalStoryPoints += storyPoints;
        
        if (historia[7] === 'COMPLETADO') {
          metricas.completedStoryPoints += storyPoints;
        }
      });

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

    const usuarios = await leerUsuarios();
    metricas.miembrosActivos = Object.values(usuarios).filter(user => user.grupo === grupo).length;

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
    console.log('\n📊 === OBTENIENDO DASHBOARD ===');
    console.log('Usuario:', usuario.nickname);
    console.log('Rol:', usuario.rol);
    console.log('Grupo:', usuario.grupo);
    
    if (!usuario || !usuario.grupo) {
      throw new Error('Usuario o grupo no definido');
    }

    const dashboardData = {
      user: usuario,
      proyectoIniciado: false,
      proyectos: {},
      metricas: {},
      tareas: {}
    };

    if (usuario.rol === 'auditor') {
      console.log('→ Cargando dashboard de administrador');
      return await obtenerDashboardAdmin(dashboardData);
    }

    console.log('→ Verificando estado del proyecto para grupo:', usuario.grupo);
    const db = await leerDB();
    console.log('DB cargada exitosamente');
    
    const grupoData = db[usuario.grupo];
    console.log('Datos del grupo:', grupoData ? 'ENCONTRADOS' : 'NO ENCONTRADOS');
    
    if (!grupoData) {
      console.log('❌ Grupo no encontrado en DB');
      return dashboardData;
    }
    
    console.log('Estado "started":', grupoData.started);
    console.log('Claves del grupo:', Object.keys(grupoData));
    
    if (!grupoData || grupoData.started !== 'y') {
      console.log('❌ Proyecto no iniciado para grupo:', usuario.grupo);
      return dashboardData;
    }

    console.log('✅ Proyecto iniciado, cargando datos...');
    dashboardData.proyectoIniciado = true;

    console.log('→ Cargando datos específicos para rol:', usuario.rol);
    
    switch (usuario.rol) {
      case 'miembro':
        console.log('→ Cargando tareas para miembro');
        dashboardData.tareas = await obtenerTareasUsuario(usuario.grupo, usuario);
        console.log('Tareas cargadas:', Object.keys(dashboardData.tareas).length, 'proyectos');
        break;
        
      case 'scrumMaster':
        console.log('→ Cargando tareas y métricas para scrumMaster');
        dashboardData.tareas = await obtenerTareasUsuario(usuario.grupo, usuario);
        dashboardData.metricas = await calcularMetricasEquipo(usuario.grupo);
        console.log('Datos cargados para scrumMaster');
        break;
        
      case 'lider':
        console.log('→ Cargando proyectos y métricas para líder');
        dashboardData.proyectos = {
          GenT: grupoData.GenT,
          Proy: grupoData.Proy,
          Proy2: grupoData.Proy2
        };
        dashboardData.metricas = await calcularMetricasEquipo(usuario.grupo);
        console.log('Proyectos cargados:', Object.keys(dashboardData.proyectos));
        break;
        
      default:
        console.log('⚠️ Rol no reconocido:', usuario.rol);
    }

    console.log('✅ Dashboard cargado exitosamente');
    console.log('=== FIN OBTENER DASHBOARD ===\n');
    
    return dashboardData;
  } catch (error) {
    console.error('💥 ERROR CRÍTICO en obtenerDashboard:', error);
    console.error('Stack trace:', error.stack);
    return {
      user: usuario,
      proyectoIniciado: false,
      proyectos: {},
      metricas: {},
      tareas: {}
    };
  }
}

/**
 * Obtiene dashboard para administradores con vista de todos los grupos
 * @param {Object} dashboardData - Datos base del dashboard
 */
async function obtenerDashboardAdmin(dashboardData) {
  try {
    console.log('🔧 Cargando dashboard de administrador...');
    
    const db = await leerDB();
    const usuarios = await leerUsuarios();
    
    dashboardData.proyectoIniciado = true;
    dashboardData.todosLosGrupos = {};
    dashboardData.estadisticasGlobales = {
      gruposActivos: 0,
      usuariosTotal: Object.keys(usuarios).length,
      proyectosIniciados: 0
    };

    console.log('Total de grupos en DB:', Object.keys(db).length);

    for (const [nombreGrupo, grupoData] of Object.entries(db)) {
      if (nombreGrupo.startsWith('Grupo') && grupoData) {
        console.log(`Procesando grupo: ${nombreGrupo}`);
        
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

    console.log('✅ Dashboard admin cargado exitosamente');
    return dashboardData;
  } catch (error) {
    console.error('💥 Error obteniendo dashboard admin:', error);
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

    if (!sprintData.burndownChart) {
      sprintData.burndownChart = { plannedWork: [], actualWork: [] };
    }

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

    Object.values(usuarios).forEach(usuario => {
      if (estadisticas.usuarios.porRol[usuario.rol] !== undefined) {
        estadisticas.usuarios.porRol[usuario.rol]++;
      }
    });

    for (const [nombreGrupo, grupoData] of Object.entries(db)) {
      if (nombreGrupo.startsWith('Grupo')) {
        estadisticas.grupos.total++;
        
        if (grupoData && grupoData.started === 'y') {
          estadisticas.grupos.iniciados++;
          
          for (const [proyectoNombre, proyectoData] of Object.entries(grupoData)) {
            if (proyectoData && proyectoData.productBacklog) {
              estadisticas.proyectos.totalHistorias += proyectoData.productBacklog.length;
              estadisticas.proyectos.historiasCompletadas += 
                proyectoData.productBacklog.filter(h => h[7] === 'COMPLETADO').length;
              
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

/**
 * Obtiene el scrumboard con las historias de usuario de un sprint específico
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint específico
 * @returns {Promise<Array>} - Array de historias de usuario del scrumboard
 */
async function obtenerScrumboardSprint(grupo, proyecto, sprint) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    const sprintData = db[grupo][proyecto][sprint];
    const scrumBoardIds = sprintData.scrumBoard || [];
    const productBacklog = db[grupo][proyecto].productBacklog || [];
    
    console.log(`📋 Scrumboard del ${sprint}:`, scrumBoardIds);
    console.log(`Total historias en scrumboard: ${scrumBoardIds.length}`);

    // Filtrar las historias que están en el scrumboard
    const historiasScrumboard = productBacklog.filter(historia => {
      // Buscar por ID de historia (primer elemento del array)
      return scrumBoardIds.some(idArray => {
        // Manejar tanto arrays como strings/IDs simples
        const historiaId = Array.isArray(idArray) ? idArray[0] : idArray;
        return historiaId === historia[0];
      });
    });

    console.log(`Historias encontradas en scrumboard: ${historiasScrumboard.length}`);
    
    return historiasScrumboard;
  } catch (error) {
    console.error('Error obteniendo scrumboard del sprint:', error);
    throw error;
  }
}

/**
 * Obtiene las fechas de inicio y fin de un sprint específico
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint específico
 * @returns {Promise<Object>} - Fechas del sprint
 */
async function obtenerFechasSprint(grupo, proyecto, sprint) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    const sprintData = db[grupo][proyecto][sprint];
    
    return {
      fechaInicio: sprintData.fechaIni || null,
      fechaFin: sprintData.fechaFin || null,
      sprint: sprint,
      proyecto: proyecto,
      grupo: grupo
    };
  } catch (error) {
    console.error('Error obteniendo fechas del sprint:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas del scrumboard de un sprint
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint específico
 */
async function obtenerEstadisticasScrumboard(grupo, proyecto, sprint) {
  try {
    const scrumboard = await obtenerScrumboardSprint(grupo, proyecto, sprint);
    
    const estadisticas = {
      totalHistorias: scrumboard.length,
      totalStoryPoints: scrumboard.reduce((sum, historia) => sum + (historia[6] || 0), 0),
      porEstado: {
        POR_HACER: scrumboard.filter(h => h[7] === 'POR_HACER').length,
        EN_PROGRESO: scrumboard.filter(h => h[7] === 'EN_PROGRESO').length,
        COMPLETADO: scrumboard.filter(h => h[7] === 'COMPLETADO').length
      },
      porPrioridad: {
        Alta: scrumboard.filter(h => h[5] === 'Alta').length,
        Media: scrumboard.filter(h => h[5] === 'Media').length,
        Baja: scrumboard.filter(h => h[5] === 'Baja').length
      }
    };
    
    return estadisticas;
  } catch (error) {
    console.error('Error obteniendo estadísticas del scrumboard:', error);
    throw error;
  }
}

/**
 * Obtiene información específica de un proyecto
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @returns {Promise<Object>} - Información del proyecto
 */
async function obtenerInfoProyecto(grupo, proyecto) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto]) {
      throw new Error('Proyecto no encontrado');
    }

    const proyectoData = db[grupo][proyecto];
    
    return {
      nombre: proyecto,
      sprintActual: proyectoData.sprintActual || '1',
      totalHistorias: proyectoData.productBacklog ? proyectoData.productBacklog.length : 0,
      sprints: obtenerSprintsDisponibles(proyectoData),
      fechaInicio: proyectoData.sprint1 ? proyectoData.sprint1.fechaIni : null,
      duracionSprint: proyecto === 'GenT' ? 
        db[grupo]['duracion-sprint-gent'] : 
        db[grupo]['duracion-sprint-proyecto']
    };
  } catch (error) {
    console.error('Error obteniendo información del proyecto:', error);
    throw error;
  }
}

/**
 * Obtiene la lista de sprints disponibles de un proyecto
 * @param {Object} proyectoData - Datos del proyecto
 * @returns {Array<string>} - Lista de sprints disponibles
 */
function obtenerSprintsDisponibles(proyectoData) {
  const sprints = [];
  
  for (let i = 1; i <= 10; i++) {
    if (proyectoData[`sprint${i}`]) {
      sprints.push(i.toString());
    }
  }
  
  return sprints;
}

/**
 * Obtiene estadísticas específicas de un miembro
 * @param {string} grupo - Nombre del grupo
 * @param {Object} usuario - Datos del usuario
 * @returns {Promise<Object>} - Estadísticas del miembro
 */
async function obtenerEstadisticasMiembro(grupo, usuario) {
  try {
    const usuarios = await leerUsuarios();
    const misDatos = usuarios[usuario.id];
    
    if (!misDatos) {
      throw new Error('Datos del usuario no encontrados');
    }

    const misTareas = await obtenerTareasUsuario(grupo, usuario);
    
    // Calcular estadísticas del miembro
    let totalTareasAsignadas = 0;
    let totalTareasCompletadas = 0;
    let totalHorasEstimadas = 0;
    let totalHorasCompletadas = 0;
    
    for (const [proyecto, sprints] of Object.entries(misTareas)) {
      for (const [sprint, tareas] of Object.entries(sprints)) {
        const tareasAsignadas = tareas.filter(t => 
          t.personas_asignadas && t.personas_asignadas.includes(usuario.nickname)
        );
        
        totalTareasAsignadas += tareasAsignadas.length;
        totalTareasCompletadas += tareasAsignadas.filter(t => t.estado === 'COMPLETADO').length;
        
        tareasAsignadas.forEach(tarea => {
          const estimacion = parseInt(tarea.estimacion) || 0;
          totalHorasEstimadas += estimacion;
          if (tarea.estado === 'COMPLETADO') {
            totalHorasCompletadas += estimacion;
          }
        });
      }
    }
    
    return {
      segundosEnLlamada: misDatos.stats[0] || 0,
      tareasAsignadas: totalTareasAsignadas,
      tareasCompletadas: totalTareasCompletadas,
      horasEstimadas: totalHorasEstimadas,
      horasCompletadas: totalHorasCompletadas,
      eficiencia: totalTareasAsignadas > 0 ? 
        Math.round((totalTareasCompletadas / totalTareasAsignadas) * 100) : 0,
      eficienciaHoras: totalHorasEstimadas > 0 ?
        Math.round((totalHorasCompletadas / totalHorasEstimadas) * 100) : 0,
      grupo: usuario.grupo,
      rol: usuario.rol
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas del miembro:', error);
    throw error;
  }
}

/**
 * Obtiene las tareas asignadas específicamente a un usuario
 * @param {string} grupo - Nombre del grupo
 * @param {Object} usuario - Datos del usuario
 * @returns {Promise<Object>} - Tareas asignadas al usuario
 */
async function obtenerMisTareas(grupo, usuario) {
  try {
    const todasLasTareas = await obtenerTareasUsuario(grupo, usuario);
    const misTareas = {};
    
    for (const [proyecto, sprints] of Object.entries(todasLasTareas)) {
      misTareas[proyecto] = {};
      
      for (const [sprint, tareas] of Object.entries(sprints)) {
        const tareasAsignadas = tareas.filter(tarea => 
          tarea.personas_asignadas && tarea.personas_asignadas.includes(usuario.nickname)
        );
        
        if (tareasAsignadas.length > 0) {
          misTareas[proyecto][sprint] = tareasAsignadas;
        }
      }
    }
    
    return misTareas;
  } catch (error) {
    console.error('Error obteniendo mis tareas:', error);
    throw error;
  }
}

/**
 * Verifica si un proyecto existe para un grupo
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @returns {Promise<boolean>} - Existe el proyecto
 */
async function verificarProyectoExiste(grupo, proyecto) {
  try {
    const db = await leerDB();
    return !!(db[grupo] && db[grupo][proyecto]);
  } catch (error) {
    console.error('Error verificando proyecto:', error);
    return false;
  }
}

/**
 * Obtiene el dashboard con datos específicos para miembros
 * @param {Object} usuario - Datos del usuario
 * @returns {Promise<Object>} - Datos del dashboard optimizados para miembros
 */
async function obtenerDashboardMiembro(usuario) {
  try {
    const dashboardBase = await obtenerDashboard(usuario);
    
    // Agregar datos específicos para miembros
    dashboardBase.proyectosInfo = {};
    dashboardBase.misEstadisticas = await obtenerEstadisticasMiembro(usuario.grupo, usuario);
    dashboardBase.misTareas = await obtenerMisTareas(usuario.grupo, usuario);
    
    // Obtener información de cada proyecto
    const proyectos = ['GenT', 'Proy', 'Proy2'];
    for (const proyecto of proyectos) {
      if (await verificarProyectoExiste(usuario.grupo, proyecto)) {
        dashboardBase.proyectosInfo[proyecto] = await obtenerInfoProyecto(usuario.grupo, proyecto);
      }
    }
    
    return dashboardBase;
  } catch (error) {
    console.error('Error obteniendo dashboard de miembro:', error);
    throw error;
  }
}

/**
 * Calcula porcentajes de completado para un proyecto
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 */
async function calcularPorcentajesProyecto(grupo, proyecto) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto]) {
      throw new Error('Proyecto no encontrado');
    }

    const proyectoData = db[grupo][proyecto];
    const backlog = proyectoData.productBacklog || [];
    
    // Calcular total de HUs
    const totalHUs = backlog.length;
    
    // Calcular HUs en sprint actual
    const sprintActual = proyectoData.sprintActual || '1';
    const scrumBoard = proyectoData[`sprint${sprintActual}`]?.scrumBoard || [];
    const HUsEnSprint = scrumBoard.length;
    
    // Calcular HUs completadas (estado COMPLETADO)
    const HUsCompletadas = backlog.filter(historia => historia[7] === 'COMPLETADO').length;
    
    // Calcular History Points
    const totalHistoryPoints = backlog.reduce((sum, historia) => sum + (historia[6] || 0), 0);
    const completedHistoryPoints = backlog
      .filter(historia => historia[7] === 'COMPLETADO')
      .reduce((sum, historia) => sum + (historia[6] || 0), 0);
    
    // Calcular porcentajes
    const porcentajeSprint = totalHUs > 0 ? Math.round((HUsEnSprint / totalHUs) * 100) : 0;
    const porcentajeTotal = totalHUs > 0 ? Math.round((HUsCompletadas / totalHUs) * 100) : 0;
    const porcentajeHistoryPoints = totalHistoryPoints > 0 ? 
      Math.round((completedHistoryPoints / totalHistoryPoints) * 100) : 0;
    
    return {
      totalHUs,
      HUsEnSprint,
      HUsCompletadas,
      porcentajeSprint,
      porcentajeTotal,
      totalHistoryPoints,
      completedHistoryPoints,
      porcentajeHistoryPoints
    };
  } catch (error) {
    console.error('Error calculando porcentajes del proyecto:', error);
    throw error;
  }
}

/**
 * Calcula promedio de History Points entre sprints
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 */
async function calcularPromedioHistoryPoints(grupo, proyecto) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto]) {
      throw new Error('Proyecto no encontrado');
    }

    const proyectoData = db[grupo][proyecto];
    const sprintActual = parseInt(proyectoData.sprintActual || '1');
    
    // Si solo hay un sprint, no hay promedio
    if (sprintActual <= 1) {
      return {
        promedio: 0,
        sprintsAnteriores: 0,
        comparacion: 'none'
      };
    }
    
    // Calcular History Points completados en sprints anteriores
    let totalHistoryPointsAnteriores = 0;
    let sprintsConDatos = 0;
    
    for (let i = 1; i < sprintActual; i++) {
      const sprintKey = `sprint${i}`;
      if (proyectoData[sprintKey] && proyectoData[sprintKey].tasks) {
        const tasks = Object.values(proyectoData[sprintKey].tasks);
        const historyPointsSprint = tasks
          .filter(t => t.estado === 'COMPLETADO')
          .reduce((sum, t) => sum + (t.estimacion || 0), 0);
        
        totalHistoryPointsAnteriores += historyPointsSprint;
        sprintsConDatos++;
      }
    }
    
    // Calcular promedio
    const promedio = sprintsConDatos > 0 ? 
      Math.round(totalHistoryPointsAnteriores / sprintsConDatos) : 0;
    
    // Calcular History Points del sprint actual
    const sprintActualKey = `sprint${sprintActual}`;
    const tasksActual = proyectoData[sprintActualKey] ? 
      Object.values(proyectoData[sprintActualKey].tasks) : [];
    
    const historyPointsActual = tasksActual
      .filter(t => t.estado === 'COMPLETADO')
      .reduce((sum, t) => sum + (t.estimacion || 0), 0);
    
    // Comparación con el promedio
    let comparacion = 'equal';
    if (sprintsConDatos > 0) {
      if (historyPointsActual > promedio) {
        comparacion = 'better';
      } else if (historyPointsActual < promedio) {
        comparacion = 'worse';
      }
    }
    
    return {
      promedio,
      historyPointsActual,
      comparacion,
      sprintsAnteriores: sprintsConDatos
    };
  } catch (error) {
    console.error('Error calculando promedio de History Points:', error);
    throw error;
  }
}

/**
 * Genera datos para el Burndown Chart
 * @param {string} grupo - Nombre del grupo
 * @param {string} proyecto - Nombre del proyecto
 * @param {string} sprint - Sprint específico
 */
async function generarDatosBurndown(grupo, proyecto, sprint) {
  try {
    const db = await leerDB();
    
    if (!db[grupo] || !db[grupo][proyecto] || !db[grupo][proyecto][sprint]) {
      throw new Error('Sprint no encontrado');
    }

    const sprintData = db[grupo][proyecto][sprint];
    const burndownData = sprintData.burndownChart || { plannedWork: [], actualWork: [] };
    
    // Si no hay datos suficientes, generar datos de ejemplo
    if (burndownData.actualWork.length <= 1) {
      const fechaInicio = arrayAFecha(sprintData.fechaIni);
      const fechaFin = arrayAFecha(sprintData.fechaFin);
      const diasDuracion = calcularDiferenciaDias(sprintData.fechaIni, sprintData.fechaFin);
      
      // Calcular trabajo total
      const tareas = Object.values(sprintData.tasks || {});
      const trabajoTotal = tareas.reduce((sum, tarea) => sum + (tarea.estimacion || 0), 0);
      
      // Generar línea ideal
      const plannedWork = [];
      for (let i = 0; i <= diasDuracion; i++) {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fecha.getDate() + i);
        const trabajoRestanteIdeal = trabajoTotal - (trabajoTotal / diasDuracion) * i;
        plannedWork.push({
          fecha: fechaAArray(fecha),
          trabajo: Math.max(0, trabajoRestanteIdeal)
        });
      }
      
      // Usar datos actuales si existen, o solo el punto final
      const actualWork = burndownData.actualWork.length > 0 ? 
        burndownData.actualWork : [
        {
          fecha: sprintData.fechaIni,
          trabajo: trabajoTotal
        },
        {
          fecha: sprintData.fechaFin,
          trabajo: 0
        }
      ];
      
      return {
        plannedWork,
        actualWork,
        trabajoTotal,
        diasDuracion
      };
    }
    
    return {
      plannedWork: burndownData.plannedWork,
      actualWork: burndownData.actualWork,
      trabajoTotal: burndownData.plannedWork[0]?.trabajo || 0,
      diasDuracion: burndownData.plannedWork.length - 1
    };
  } catch (error) {
    console.error('Error generando datos de burndown:', error);
    throw error;
  }
}

/**
 * Genera datos para el HeatMap de usuarios
 * @param {string} grupo - Nombre del grupo
 */
async function generarHeatMapUsuarios(grupo) {
  try {
    const db = await leerDB();
    const usuarios = await leerUsuarios();
    
    if (!db[grupo]) {
      throw new Error('Grupo no encontrado');
    }

    const miembros = Object.values(usuarios).filter(user => user.grupo === grupo);
    const heatMapData = [];
    
    for (const usuario of miembros) {
      // Obtener estadísticas del usuario
      const stats = await obtenerEstadisticasMiembro(grupo, usuario);
      
      // Calcular porcentaje de tiempo en reunión (usando segundos_en_llamada)
      const totalSegundosSemana = 7 * 24 * 60 * 60; // 7 días en segundos
      const porcentajeTiempoReunion = totalSegundosSemana > 0 ?
        Math.min(100, Math.round((usuario.stats[0] / totalSegundosSemana) * 100)) : 0;
      
      // Calcular porcentaje de trabajo completado
      const porcentajeCompletado = stats.tareasAsignadas > 0 ?
        Math.round((stats.tareasCompletadas / stats.tareasAsignadas) * 100) : 0;
      
      // Calcular porcentaje de tareas asignadas (relativo al miembro con más tareas)
      const maxTareas = Math.max(...miembros.map(m => {
        const userStats = usuarios[m.id]?.stats || [0, 0, 0];
        return userStats[1] || 0; // tareas_asignadas
      }));
      
      const porcentajeTareasAsignadas = maxTareas > 0 ?
        Math.round((usuario.stats[1] / maxTareas) * 100) : 0;
      
      // Determinar color basado en los tres factores
      const puntuacion = (porcentajeCompletado * 0.5) + (porcentajeTareasAsignadas * 0.3) + 
                         ((100 - porcentajeTiempoReunion) * 0.2);
      
      let color = '';
      if (puntuacion >= 80) color = 'verde-oscuro';
      else if (puntuacion >= 60) color = 'verde';
      else if (puntuacion >= 40) color = 'amarillo';
      else if (puntuacion >= 20) color = 'naranja';
      else color = 'rojo';
      
      heatMapData.push({
        usuario: usuario.nickname,
        porcentajeTiempoReunion,
        porcentajeCompletado,
        porcentajeTareasAsignadas,
        puntuacion,
        color
      });
    }
    
    return heatMapData;
  } catch (error) {
    console.error('Error generando heatmap de usuarios:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas detalladas de todos los miembros del grupo
 * @param {string} grupo - Nombre del grupo
 */
async function obtenerEstadisticasGrupoCompletas(grupo) {
  try {
    const usuarios = await leerUsuarios();
    const miembros = Object.values(usuarios).filter(user => user.grupo === grupo);
    
    const estadisticas = [];
    
    for (const usuario of miembros) {
      const stats = await obtenerEstadisticasMiembro(grupo, usuario);
      estadisticas.push({
        ...usuario,
        statsDetalladas: stats
      });
    }
    
    return estadisticas;
  } catch (error) {
    console.error('Error obteniendo estadísticas completas del grupo:', error);
    throw error;
  }
}

/**
 * Cuenta las tareas pendientes de un usuario
 * @param {string} grupo - Nombre del grupo
 * @param {Object} usuario - Datos del usuario
 * @returns {Promise<number>} - Número de tareas pendientes
 */
async function contarTareasPendientes(grupo, usuario) {
  try {
    const todasLasTareas = await obtenerTareasUsuario(grupo, usuario);
    let totalPendientes = 0;
    
    for (const [proyecto, sprints] of Object.entries(todasLasTareas)) {
      for (const [sprint, tareas] of Object.entries(sprints)) {
        const tareasPendientes = tareas.filter(tarea => 
          tarea.personas_asignadas && 
          tarea.personas_asignadas.includes(usuario.nickname) &&
          tarea.estado !== 'COMPLETADO'
        );
        
        totalPendientes += tareasPendientes.length;
      }
    }
    
    return totalPendientes;
  } catch (error) {
    console.error('Error contando tareas pendientes:', error);
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
  calcularPorcentajesProyecto,
  calcularPromedioHistoryPoints,
  generarDatosBurndown,
  generarHeatMapUsuarios,
  obtenerEstadisticasGrupoCompletas,
  contarTareasPendientes,
  obtenerScrumboardSprint,
  obtenerEstadisticasScrumboard,
  obtenerTareasUsuario,
  calcularMetricasEquipo,
  obtenerDashboard,
  actualizarEstadisticasUsuario,
  moverHistoriaASprint,
  obtenerTareasSprint,
  actualizarBurndownChart,
  cambiarRolUsuario,
  obtenerEstadisticasGlobales,
  obtenerScrumboardSprint,
  obtenerEstadisticasScrumboard,
  obtenerInfoProyecto,
  obtenerSprintsDisponibles,
  obtenerEstadisticasMiembro,
  obtenerMisTareas,
  verificarProyectoExiste,
  obtenerDashboardMiembro,
  obtenerFechasSprint,
  calcularPorcentajesProyecto,
  calcularPromedioHistoryPoints,
  generarDatosBurndown,
  generarHeatMapUsuarios,
  obtenerEstadisticasGrupoCompletas,
  contarTareasPendientes
};