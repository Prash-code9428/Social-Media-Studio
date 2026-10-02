import { env } from './config/env.js';
import { createDatabaseContext } from './db/index.js';
import { PublisherRegistry } from './publishers/publisherRegistry.js';
import { PublishQueue } from './queue/publishQueue.js';
import { PublishWorker } from './queue/publishWorker.js';
import { ReconciliationService } from './queue/reconciliationService.js';
import { SocialStudioService } from './services/socialStudioService.js';
import { createApp } from './api/app.js';

async function bootstrap() {
  console.log('🚀 Initializing Social Media Studio...');

  // 1. Database Context
  const dbCtx = createDatabaseContext(env.DATABASE_PATH);
  console.log(`✅ SQLite initialized at: ${env.DATABASE_PATH}`);

  // 2. Publisher Registry
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
  console.log('✅ Publisher adapters registered: Telegram (Real), X (Mock), LinkedIn (Mock)');

  // 3. BullMQ Queue & Worker
  const publishQueue = new PublishQueue();
  const worker = new PublishWorker({ dbCtx, publisherRegistry });
  worker.start();
  console.log('✅ BullMQ publisher worker started');

  // 4. Startup Reconciliation
  const reconciler = new ReconciliationService({ dbCtx, publishQueue });
  const reconResult = await reconciler.reconcile();
  if (reconResult.recoveredCount > 0) {
    console.log(`🔄 Reconciled ${reconResult.recoveredCount} pending schedules into queue.`);
  }

  // 5. Core Studio Service
  const service = new SocialStudioService({
    dbCtx,
    publishQueue,
    publisherRegistry,
  });

  // 6. Express Application
  const app = createApp({ service, dbCtx, publishQueue, publisherRegistry });

  const server = app.listen(env.PORT, () => {
    console.log(`✨ Social Media Studio API server listening on http://localhost:${env.PORT}`);
  });

  // Graceful Shutdown
  const shutdown = async () => {
    console.log('\n🛑 Gracefully shutting down...');
    server.close();
    await worker.close();
    await publishQueue.close();
    dbCtx.db.close();
    console.log('👋 Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
