import { env } from '../config/env.js';
import { createDatabaseContext } from '../db/index.js';
import { PublisherRegistry } from '../publishers/publisherRegistry.js';
import { PublishQueue } from '../queue/publishQueue.js';
import { PublishWorker } from '../queue/publishWorker.js';
import { ReconciliationService } from '../queue/reconciliationService.js';

async function runWorker() {
  console.log('⚙️ Starting Social Media Studio Publish Worker...');

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

  // Run startup reconciliation to recover any pending/orphaned jobs
  const reconciler = new ReconciliationService({ dbCtx, publishQueue });
  const reconResult = await reconciler.reconcile();
  console.log(`🔄 Reconciled pending schedules: ${reconResult.recoveredCount}/${reconResult.totalChecked} recovered.`);

  console.log('✨ Publish Worker is running and listening for jobs...');

  const shutdown = async () => {
    console.log('\n🛑 Shutting down Publish Worker gracefully...');
    await worker.close();
    await publishQueue.close();
    dbCtx.db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

runWorker().catch((err) => {
  console.error('❌ Fatal Publish Worker error:', err);
  process.exit(1);
});
