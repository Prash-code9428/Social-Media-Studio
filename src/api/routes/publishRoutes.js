import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';

const listPublishLogsQuerySchema = z.object({
  variantId: z.string().optional(),
  platform: z.string().optional(),
  status: z.enum(['success', 'failure']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export function createPublishRoutes(service) {
  const router = Router();

  // Audit Logs Endpoint: GET /api/publish-logs
  router.get('/publish-logs', validateQuery(listPublishLogsQuerySchema), (req, res, next) => {
    try {
      const logs = service.getPublishLogs(req.validatedQuery);
      res.json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
