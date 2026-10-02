import { Router } from 'express';

export function createHealthRouter({ dbCtx, publishQueue, publisherRegistry }) {
  const router = Router();

  router.get('/health', async (req, res) => {
    let dbStatus = 'ok';
    try {
      dbCtx.db.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }

    const platforms = publisherRegistry ? publisherRegistry.listPlatforms() : [];

    res.json({
      status: 'healthy',
      service: 'Social Media Studio',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      supportedPlatforms: platforms,
    });
  });

  return router;
}
