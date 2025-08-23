const { spawn } = require('child_process');
const config = require('./config.json');

console.log('🚀 Iniciando Dardito - Windows 64 bits');
console.log('🤖 Bot Discord + 🌐 Servidor Web');
console.log('--------------------------------------');

// Iniciar bot de Discord
console.log('\n🔵 Iniciando Bot de Discord...');
const botProcess = spawn('node', ['bot.js'], {
    stdio: 'inherit',
    shell: true,
    detached: true
});

// Esperar un momento y iniciar servidor web
setTimeout(() => {
    console.log('\n🟢 Iniciando Servidor Web...');
    const webProcess = spawn('node', ['app.js'], {
        stdio: 'inherit',
        shell: true,
        detached: true
    });

    console.log('\n✅ Sistema ejecutándose!');
    console.log('📊 Dashboard: http://localhost:3000');
    console.log('⚡ Bot conectado y listo');
    console.log('\n🛑 Para cerrar: Presiona Ctrl + C dos veces');

}, 3000);

// Manejar cierre
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando sistema...');
    try {
        process.kill(-botProcess.pid);
        process.exit(0);
    } catch (e) {
        process.exit(0);
    }
});