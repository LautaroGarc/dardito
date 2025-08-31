const { leerUsuarios, leerDB } = require('./config');

/**
 * Middleware de autenticación - Verifica que el usuario esté autenticado
 */
async function requireAuth(req, res, next) {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    // Verificar que el usuario aún existe en el sistema
    const usuarios = await leerUsuarios();
    const usuario = usuarios[req.session.userId];
    
    if (!usuario) {
      req.session.destroy();
      return res.redirect('/login');
    }

    // Adjuntar datos del usuario a la request
    req.user = {
      id: req.session.userId,
      ...usuario
    };

    next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar autenticación'
    });
  }
}

/**
 * Middleware para verificar roles específicos
 * @param {Array<string>} rolesPermitidos - Lista de roles que pueden acceder
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: 'Permisos insuficientes para esta acción'
      });
    }

    next();
  };
}

/**
 * Middleware para verificar que el usuario es líder
 */
function requireLider(req, res, next) {
  return requireRole('lider')(req, res, next);
}

/**
 * Middleware para verificar que el usuario es scrum master o superior
 */
function requireScrumMaster(req, res, next) {
  return requireRole('scrumMaster', 'lider', 'auditor')(req, res, next);
}

/**
 * Middleware para verificar que el usuario es administrador
 */
function requireAdmin(req, res, next) {
  return requireRole('auditor')(req, res, next);
}

/**
 * Verifica si el proyecto del grupo está iniciado
 * @param {string} grupo - Nombre del grupo
 * @returns {Promise<boolean>} - True si está iniciado
 */
async function verificarProyectoIniciado(grupo) {
  try {
    const db = await leerDB();
    return db[grupo] && db[grupo].started === 'y';
  } catch (error) {
    console.error('Error verificando proyecto:', error);
    return false;
  }
}

/**
 * Middleware para redirigir según estado del proyecto
 */
async function checkProjectStatus(req, res, next) {
  try {
    if (!req.user) {
      return next();
    }

    const proyectoIniciado = await verificarProyectoIniciado(req.user.grupo);
    
    // Si el usuario es líder y el proyecto no está iniciado
    if (req.user.rol === 'lider' && !proyectoIniciado) {
      if (req.path !== '/iniciar-proyecto' && req.path !== '/dashboard') {
        return res.redirect('/iniciar-proyecto');
      }
    }
    
    // Si el proyecto no está iniciado y no es líder
    if (!proyectoIniciado && req.user.rol !== 'lider' && req.user.rol !== 'auditor') {
      return res.status(403).render('error', {
        message: 'El proyecto aún no ha sido iniciado por el líder del grupo',
        user: req.user
      });
    }

    next();
  } catch (error) {
    console.error('Error verificando estado del proyecto:', error);
    next(error);
  }
}

/**
 * Verifica permisos para acceder a datos de un grupo específico
 * @param {Object} usuario - Datos del usuario
 * @param {string} grupoObjetivo - Grupo al que se quiere acceder
 * @returns {boolean} - Tiene permisos
 */
function tienePermisoGrupo(usuario, grupoObjetivo) {
  // Administradores pueden acceder a cualquier grupo
  if (usuario.rol === 'auditor') {
    return true;
  }
  
  // Otros usuarios solo pueden acceder a su propio grupo
  return usuario.grupo === grupoObjetivo;
}

/**
 * Verifica permisos para modificar datos de un proyecto
 * @param {Object} usuario - Datos del usuario
 * @param {string} accion - Tipo de acción (leer, escribir, admin)
 * @returns {boolean} - Tiene permisos
 */
function tienePermisoAccion(usuario, accion) {
  const permisosPorRol = {
    miembro: ['leer'],
    scrumMaster: ['leer', 'metricas'],
    lider: ['leer', 'escribir', 'metricas'],
    auditor: ['leer', 'escribir', 'admin', 'metricas']
  };
  
  const permisosUsuario = permisosPorRol[usuario.rol] || [];
  return permisosUsuario.includes(accion);
}

/**
 * Middleware para API que requiere permisos específicos
 * @param {string} accion - Acción requerida
 */
function requirePermission(accion) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!tienePermisoAccion(req.user, accion)) {
      return res.status(403).json({
        success: false,
        message: `Permisos insuficientes para la acción: ${accion}`
      });
    }

    next();
  };
}

/**
 * Middleware para verificar acceso a grupo específico
 */
function requireGroupAccess(req, res, next) {
  const grupoObjetivo = req.params.grupo || req.body.grupo || req.user.grupo;
  
  if (!tienePermisoGrupo(req.user, grupoObjetivo)) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para acceder a este grupo'
    });
  }
  
  req.grupoObjetivo = grupoObjetivo;
  next();
}

/**
 * Verifica si el usuario puede acceder a una tarea específica
 * @param {Object} usuario - Datos del usuario
 * @param {Object} tarea - Datos de la tarea
 * @returns {boolean} - Puede acceder
 */
function puedeAccederTarea(usuario, tarea) {
  // Administradores y líderes pueden acceder a cualquier tarea
  if (usuario.rol === 'auditor' || usuario.rol === 'lider') {
    return true;
  }
  
  // Scrum masters pueden ver cualquier tarea pero no modificar
  if (usuario.rol === 'scrumMaster') {
    return true;
  }
  
  // Miembros solo pueden acceder a sus tareas asignadas
  if (usuario.rol === 'miembro') {
    return tarea.personas_asignadas && tarea.personas_asignadas.includes(usuario.nickname);
  }
  
  return false;
}

/**
 * Verifica si el usuario puede modificar una tarea específica
 * @param {Object} usuario - Datos del usuario
 * @param {Object} tarea - Datos de la tarea
 * @returns {boolean} - Puede modificar
 */
function puedeModificarTarea(usuario, tarea) {
  // Administradores y líderes pueden modificar cualquier tarea
  if (usuario.rol === 'auditor' || usuario.rol === 'lider') {
    return true;
  }
  
  // Miembros solo pueden modificar sus tareas asignadas
  if (usuario.rol === 'miembro') {
    return tarea.personas_asignadas && tarea.personas_asignadas.includes(usuario.nickname);
  }
  
  return false;
}

module.exports = {
  requireAuth,
  requireRole,
  requireLider,
  requireScrumMaster,
  requireAdmin,
  requirePermission,
  requireGroupAccess,
  checkProjectStatus,
  verificarProyectoIniciado,
  tienePermisoGrupo,
  tienePermisoAccion,
  puedeAccederTarea,
  puedeModificarTarea
};