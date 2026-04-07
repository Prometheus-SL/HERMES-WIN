const logger = require('./logger');
const AgentRuntime = require('./agentRuntime');

async function main() {
  const runtime = new AgentRuntime({ mode: 'service' });

  runtime.on('status', (status) => {
    logger.info(
      `Service runtime status=${status.lifecycle} connected=${status.connected} agentId=${status.agentId}`
    );
  });

  await runtime.start();

  process.on('SIGINT', async () => {
    await runtime.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await runtime.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error(`Service runtime failed: ${error.message || error}`);
  process.exit(1);
});
