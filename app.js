const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// VERIFICACIÓN INICIAL DE ARCHIVOS
// ===============================
function verificarArchivosIniciales() {
  console.log('🔍 === VERIFICACIÓN INICIAL ===');
  
  const usersPath = path.join(__dirname, 'databases', 'users.json');
  const dbPath = path.join(__dirname, 'databases', 'db.json');
  
  console.log('Directorio actual:', __dirname);
  console.log('Ruta users.json:', usersPath);
  console.log('Existe users.json:', fs.existsSync(usersPath));
  
  if (fs.existsSync(usersPath)) {
    try {
      const content = fs.readFileSync(usersPath, 'utf8');
      console.log('Contenido users.json (primeros 200 chars):', content.substring(0, 200));
      
      const users = JSON.parse(content);
      console.log('✅ users.json válido');
      console.log('Total usuarios:', Object.keys(users).length);
      
      // Verificar usuario admin específico
      const adminUser = users['413453518079393799'];
      if (adminUser) {
        console.log('✅ Usuario admin encontrado:', adminUser.nickname);
        console.log('Token admin:', JSON.stringify(adminUser.token));
        console.log('Longitud token admin:', adminUser.token.length);
      } else {
        console.log('❌ Usuario admin NO encontrado con ID 413453518079393799');
        console.log('IDs disponibles:', Object.keys(users));
      }
    } catch (error) {
      console.log('❌ Error parsing users.json:', error.message);
    }
  } else {
    console.log('❌ Archivo users.json NO EXISTE');
  }
  
  console.log('Existe db.json:', fs.existsSync(dbPath));
  console.log('=== FIN VERIFICACIÓN ===\n');
}

// Ejecutar verificación al inicio
verificarArchivosIniciales();

// ===============================
// CONFIGURACIÓN DE MIDDLEWARES (ORDEN CRÍTICO)
// ===============================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`\n🌐 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  
  if (req.path.includes('dashboard') || req.path.includes('proyecto') || req.path.includes('auth')) {
    console.log('📍 Ruta importante detectada:', {
      method: req.method,
      path: req.path,
      sessionId: req.sessionID,
      hasSession: !!req.session,
      userId: req.session?.userId
    });
  }
  
  next();
});

app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/auth') {
    console.log('\n🔍 === MIDDLEWARE DEBUG /auth ===');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body));
    console.log('Body completo:', JSON.stringify(req.body, null, 2));
    console.log('req.body.token:', JSON.stringify(req.body.token));
    console.log('=== FIN MIDDLEWARE DEBUG ===\n');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'dardito_secret_key_2025', 
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    httpOnly: true,
    maxAge: 10 * 60 * 60 * 1000
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  if (req.path.includes('dashboard') || req.path.includes('auth') || req.path.includes('proyecto')) {
    console.log('🔐 Sesión actual:', {
      sessionId: req.sessionID,
      userId: req.session.userId,
      path: req.path,
      method: req.method
    });
  }
  next();
});

/*app.use(cors({
  origin: ['right-mite-infinite.ngrok-free.app'], // Solo tu dominio
  credentials: true
}));*/

// ===============================
// RUTAS
// ===============================

// Importar rutas DESPUÉS de configurar middlewares
const routes = require('./routes');
app.use('/', routes);

// ===============================
// MANEJO DE ERRORES MEJORADO
// ===============================

// Middleware de manejo de errores global con logging detallado
app.use((err, req, res, next) => {
  console.error('\n💥 === ERROR EN SERVIDOR ===');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Ruta:', req.method, req.path);
  console.error('Usuario:', req.session?.userId || 'No autenticado');
  console.error('Error name:', err.name);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
  console.error('Error code:', err.code);
  console.error('Request body:', JSON.stringify(req.body, null, 2));
  console.error('Request params:', JSON.stringify(req.params, null, 2));
  console.error('Request query:', JSON.stringify(req.query, null, 2));
  console.error('=== FIN ERROR ===\n');
  
  // Errores de JSON malformado
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Datos JSON inválidos'
    });
  }
  
  // Errores de archivo no encontrado
  if (err.code === 'ENOENT') {
    return res.status(500).json({
      success: false,
      message: 'Error al acceder a los archivos del sistema',
      details: `Archivo no encontrado: ${err.path}`
    });
  }
  
  // Errores de template no encontrado
  if (err.message && err.message.includes('Failed to lookup view')) {
    console.error('❌ Template EJS no encontrado:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Template de vista no encontrado',
      details: err.message
    });
  }
  
  // Error genérico del servidor
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Contactar al administrador'
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  console.log(`❌ Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// ===============================
// INICIAR SERVIDOR
// ===============================
app.listen(PORT, () => {
  console.log('\n🚀 === SERVIDOR DARDITO INICIADO ===');
  console.log(`📍 URL: http://right-mite-infinite.ngrok-free.app`);
  console.log(`📅 Fecha: ${new Date().toLocaleString('es-AR')}`);
  console.log('💡 Sistema de gestión ágil para proyectos escolares');
  console.log('🔧 Modo DEBUG activado');
  console.log('=======================================\n');
  
  // Verificar archivos nuevamente después del inicio
  setTimeout(verificarArchivosIniciales, 1000);
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('\n💀 UNCAUGHT EXCEPTION:');
  console.error('Error:', err.name, '-', err.message);
  console.error('Stack:', err.stack);
  console.error('💀 El servidor continuará ejecutándose...\n');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n⚠️ UNHANDLED REJECTION:');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('⚠️ El servidor continuará ejecutándose...\n');
});

// Manejo de cierre graceful del servidor
process.on('SIGTERM', () => {
  console.log('⚠️ Cerrando servidor Dardito...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️ Cerrando servidor Dardito...');
  process.exit(0);
});

module.exports = app;