import { env } from './config/env.js';
import { createDatabaseContext } from './db/index.js';
import { PublisherRegistry } from './publishers/publisherRegistry.js';
import { PublishQueue } from './queue/publishQueue.js';
import { PublishWorker } from './queue/publishWorker.js';
import { ReconciliationService } from './queue/reconciliationService.js';

async function runWorker() {
  console.log('⚙️ Starting standalone Social Media Studio Worker...');

  const dbCtx = createDatabaseContext(env.DATABASE_PATH);
  const publisherRegistry = new PublisherRegistry({
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
    },
    x: {
      failureRate: env.MOCK_X_FAILURE_RATE,
    },
    linkedin: {
      failureRate: env.MOCK_LINKEDIN_FAILURE_RATE,
    },
  });

  const publishQueue = new PublishQueue();
  const worker = new PublishWorker({ dbCtx, publisherRegistry });
  worker.start();

  const reconciler = new ReconciliationService({ dbCtx, publishQueue });
  await reconciler.reconcile();

  console.log('✨ Worker is active and waiting for publishing jobs...');

  const shutdown = async () => {
    console.log('\n🛑 Shutting down worker...');
    await worker.close();
    await publishQueue.close();
    dbCtx.db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

runWorker().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
