import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createPostsRouter } from './routes/postsRoutes.js';
import { createVariantsRouter } from './routes/variantsRoutes.js';
import { createProfilesRouter } from './routes/profilesRoutes.js';
import { createSchedulesRouter } from './routes/schedulesRoutes.js';
import { createPublishRoutes } from './routes/publishRoutes.js';
import { createHealthRouter } from './routes/healthRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp({ service, dbCtx, publishQueue, publisherRegistry }) {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  const postsRouter = createPostsRouter(service);
  const variantsRouter = createVariantsRouter(service);
  const profilesRouter = createProfilesRouter(service);
  const schedulesRouter = createSchedulesRouter(service);
  const publishRouter = createPublishRoutes(service);
  const healthRouter = createHealthRouter({ dbCtx, publishQueue, publisherRegistry });

  // Mount on both root paths and /api/* prefixes
  app.use('/', healthRouter);
  app.use('/api', healthRouter);

  app.use('/posts', postsRouter);
  app.use('/api/posts', postsRouter);

  app.use('/variants', variantsRouter);
  app.use('/api/variants', variantsRouter);

  app.use('/profiles', profilesRouter);
  app.use('/api/profiles', profilesRouter);

  app.use('/schedules', schedulesRouter);
  app.use('/api/schedules', schedulesRouter);

  app.use('/', publishRouter);
  app.use('/api', publishRouter);

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
