const serviceManager = require('../src/service/serviceManager');

const actions = {
  status: 'getServiceStatus',
  install: 'installService',
  start: 'startService',
  stop: 'stopService',
  uninstall: 'uninstallService',
};

async function main() {
  const action = String(process.argv[2] || '').trim();
  const methodName = actions[action];

  if (!methodName) {
    throw new Error(
      `Unknown service action '${action}'. Expected one of: ${Object.keys(actions).join(', ')}.`
    );
  }

  const result = await serviceManager[methodName]();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
