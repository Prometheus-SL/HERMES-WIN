// Utility to install/uninstall the Node agent as a Windows service using node-windows
const Service = require('node-windows').Service;
const path = require('path');

function installService() {
  const svc = new Service({
    name: 'HermesNodeAgent',
    description: 'HERMES Node Agent service',
    script: path.join(__dirname, 'agent.js'),
  });

  svc.on('install', () => {
    console.log('Service installed');
    svc.start();
  });

  svc.install();
}

function uninstallService() {
  const svc = new Service({
    name: 'HermesNodeAgent',
    script: path.join(__dirname, 'agent.js'),
  });

  svc.on('uninstall', () => {
    console.log('Service uninstalled');
  });

  svc.uninstall();
}

module.exports = { installService, uninstallService };
