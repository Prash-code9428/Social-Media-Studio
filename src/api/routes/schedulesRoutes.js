import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';

const listSchedulesQuerySchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export function createSchedulesRouter(service) {
  const router = Router();

  // List schedules
  router.get('/', validateQuery(listSchedulesQuerySchema), (req, res, next) => {
    try {
      const schedules = service.dbCtx.schedules.findAll(req.validatedQuery);
      res.json({ success: true, data: schedules });
    } catch (err) {
      next(err);
    }
  });

  // Get single schedule
  router.get('/:id', (req, res, next) => {
    try {
      const schedule = service.dbCtx.schedules.findById(req.params.id);
      if (!schedule) {
        return res.status(404).json({ success: false, error: { message: 'Schedule not found', code: 'NOT_FOUND' } });
      }
      res.json({ success: true, data: schedule });
    } catch (err) {
      next(err);
    }
  });

  // Cancel schedule
  router.delete('/:id', async (req, res, next) => {
    try {
      const cancelled = await service.cancelSchedule(req.params.id);
      res.json({ success: true, data: cancelled, message: 'Schedule cancelled successfully' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
