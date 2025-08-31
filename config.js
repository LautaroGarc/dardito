const fs = require('fs').promises;
const path = require('path');

// Configuración del servidor
const config = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'dardito_secret_key_2025',
  dbPath: path.join(__dirname, 'db.json'),
  usersPath: path.join(__dirname, 'users.json'),
  maxRetries: 3,
  retryDelay: 100
};

/**
 * Lee y parsea un archivo JSON con manejo de errores robusto
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<Object>} - Contenido parseado del archivo
 */
async function leerJSON(filePath) {
  let retries = 0;
  
  while (retries < config.maxRetries) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      retries++;
      
      if (error.code === 'ENOENT') {
        throw new Error(`Archivo no encontrado: ${filePath}`);
      }
      
      if (error instanceof SyntaxError) {
        throw new Error(`JSON inválido en archivo: ${filePath}`);
      }
      
      if (retries >= config.maxRetries) {
        throw new Error(`Error al leer archivo después de ${config.maxRetries} intentos: ${error.message}`);
      }
      
      // Esperar antes del siguiente intento
      await new Promise(resolve => setTimeout(resolve, config.retryDelay * retries));
    }
  }
}

/**
 * Escribe datos en formato JSON con manejo de errores
 * @param {string} filePath - Ruta del archivo
 * @param {Object} data - Datos a escribir
 */
async function escribirJSON(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf8');
  } catch (error) {
    throw new Error(`Error al escribir archivo ${filePath}: ${error.message}`);
  }
}

/**
 * Lee la base de datos principal (db.json)
 * @returns {Promise<Object>} - Contenido de la base de datos
 */
async function leerDB() {
  return await leerJSON(config.dbPath);
}

/**
 * Escribe en la base de datos principal (db.json)
 * @param {Object} data - Datos a escribir
 */
async function escribirDB(data) {
  await escribirJSON(config.dbPath, data);
}

/**
 * Lee el archivo de usuarios (users.json)
 * @returns {Promise<Object>} - Contenido del archivo de usuarios
 */
async function leerUsuarios() {
  return await leerJSON(config.usersPath);
}

/**
 * Escribe en el archivo de usuarios (users.json)
 * @param {Object} data - Datos a escribir
 */
async function escribirUsuarios(data) {
  await escribirJSON(config.usersPath, data);
}

/**
 * Obtiene la fecha actual en formato [día, mes, año]
 * @returns {Array<number>} - Fecha actual
 */
function obtenerFechaActual() {
  const fecha = new Date();
  return [
    fecha.getDate(),
    fecha.getMonth() + 1, // Mes base 1
    fecha.getFullYear()
  ];
}

/**
 * Calcula fecha fin basada en fecha inicio y duración en semanas
 * @param {Array<number>} fechaInicio - [día, mes, año]
 * @param {number} duracionSemanas - Duración en semanas
 * @returns {Array<number>} - Fecha final calculada
 */
function calcularFechaFin(fechaInicio, duracionSemanas) {
  const [dia, mes, anio] = fechaInicio;
  const fechaIni = new Date(anio, mes - 1, dia); // Mes base 0 para Date
  
  // Agregar semanas (7 días * duracionSemanas)
  const fechaFin = new Date(fechaIni.getTime() + (duracionSemanas * 7 * 24 * 60 * 60 * 1000));
  
  return [
    fechaFin.getDate(),
    fechaFin.getMonth() + 1,
    fechaFin.getFullYear()
  ];
}

/**
 * Convierte fecha de array a objeto Date
 * @param {Array<number>} fechaArray - [día, mes, año]
 * @returns {Date} - Objeto Date
 */
function arrayAFecha(fechaArray) {
  const [dia, mes, anio] = fechaArray;
  return new Date(anio, mes - 1, dia);
}

/**
 * Convierte objeto Date a array de fecha
 * @param {Date} fecha - Objeto Date
 * @returns {Array<number>} - [día, mes, año]
 */
function fechaAArray(fecha) {
  return [
    fecha.getDate(),
    fecha.getMonth() + 1,
    fecha.getFullYear()
  ];
}

/**
 * Calcula diferencia en días entre dos fechas
 * @param {Array<number>} fecha1 - [día, mes, año]
 * @param {Array<number>} fecha2 - [día, mes, año]
 * @returns {number} - Diferencia en días
 */
function calcularDiferenciaDias(fecha1, fecha2) {
  const f1 = arrayAFecha(fecha1);
  const f2 = arrayAFecha(fecha2);
  const diferencia = Math.abs(f2.getTime() - f1.getTime());
  return Math.ceil(diferencia / (1000 * 60 * 60 * 24));
}

/**
 * Genera ID único para historias de usuario
 * @returns {string} - ID único
 */
function generarIdHistoria() {
  return `HU${Date.now()}`;
}

/**
 * Genera ID único para tareas
 * @returns {string} - ID único
 */
function generarIdTarea() {
  return `T${Date.now()}`;
}

/**
 * Valida estructura de historia de usuario
 * @param {Object} historia - Historia a validar
 * @returns {boolean} - Es válida
 */
function validarHistoria(historia) {
  const camposRequeridos = ['titulo', 'como', 'quiero', 'para', 'prioridad', 'storyPoints'];
  return camposRequeridos.every(campo => historia[campo] !== undefined && historia[campo] !== '');
}

/**
 * Valida estructura de tarea
 * @param {Object} tarea - Tarea a validar
 * @returns {boolean} - Es válida
 */
function validarTarea(tarea) {
  const camposRequeridos = ['nombre', 'descripcion', 'estado'];
  return camposRequeridos.every(campo => tarea[campo] !== undefined && tarea[campo] !== '');
}

/**
 * Verifica si un usuario pertenece a un grupo específico
 * @param {Object} usuario - Datos del usuario
 * @param {string} grupo - Nombre del grupo
 * @returns {boolean} - Pertenece al grupo
 */
function usuarioPerteneceAGrupo(usuario, grupo) {
  return usuario.grupo === grupo;
}

/**
 * Obtiene la configuración del servidor
 * @returns {Object} - Configuración
 */
function obtenerConfig() {
  return { ...config };
}

module.exports = {
  config,
  leerDB,
  escribirDB,
  leerUsuarios,
  escribirUsuarios,
  obtenerFechaActual,
  calcularFechaFin,
  arrayAFecha,
  fechaAArray,
  calcularDiferenciaDias,
  generarIdHistoria,
  generarIdTarea,
  validarHistoria,
  validarTarea,
  usuarioPerteneceAGrupo,
  obtenerConfig
};