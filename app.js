const express = require('express');
const session = require('express-session');
const path = require('path');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesiones
app.use(session({
  secret: 'dardito_secret_key_2025', 
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Cambiar a true en producción con HTTPS
    httpOnly: true,
    maxAge: 4 * 60 * 60 * 1000 // 4 horas en milisegundos
  }
}));

// Configuración del motor de plantillas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Usar todas las rutas del sistema
app.use('/', routes);

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error en servidor:', err.stack);
  
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
      message: 'Error al acceder a los archivos del sistema'
    });
  }
  
  // Error genérico del servidor
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Dardito iniciado en http://localhost:${PORT}`);
  console.log(`📅 Fecha de inicio: ${new Date().toLocaleString('es-AR')}`);
  console.log('💡 Sistema de gestión ágil para proyectos escolares');
});

// Manejo de cierre graceful del servidor
process.on('SIGTERM', () => {
  console.log('⏹️  Cerrando servidor Dardito...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⏹️  Cerrando servidor Dardito...');
  process.exit(0);
});

module.exports = app;