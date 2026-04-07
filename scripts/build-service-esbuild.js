const esbuild = require('esbuild');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const serviceDir = path.join(projectRoot, 'src', 'service');
const outDir = path.join(projectRoot, 'dist', 'service');

esbuild
  .build({
    entryPoints: {
      agent: path.join(serviceDir, 'agent.js'),
      manualAgent: path.join(serviceDir, 'manualAgent.js'),
      agentManager: path.join(serviceDir, 'agentManager.js'),
    },
    outdir: outDir,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node20'],
    sourcemap: true,
    external: ['keytar', 'node-windows', 'win_volume'],
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
