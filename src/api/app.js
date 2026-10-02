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

  // Mount API Routers
  app.use('/api', createHealthRouter({ dbCtx, publishQueue, publisherRegistry }));
  app.use('/api/posts', createPostsRouter(service));
  app.use('/api/variants', createVariantsRouter(service));
  app.use('/api/profiles', createProfilesRouter(service));
  app.use('/api/schedules', createSchedulesRouter(service));
  app.use('/api', createPublishRoutes(service));

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
