import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validator.js';

const updateProfileSchema = z.object({
  maxLength: z.number().int().positive().optional(),
  allowedTones: z.array(z.string()).optional(),
  maxHashtags: z.number().int().min(0).optional(),
  minHashtags: z.number().int().min(0).optional(),
  mediaAllowed: z.boolean().optional(),
});

export function createProfilesRouter(service) {
  const router = Router();

  // List all constraint profiles
  router.get('/', (req, res, next) => {
    try {
      const profiles = service.listProfiles();
      res.json({ success: true, data: profiles });
    } catch (err) {
      next(err);
    }
  });

  // Get specific platform profile
  router.get('/:platform', (req, res, next) => {
    try {
      const profile = service.dbCtx.profiles.findByPlatform(req.params.platform);
      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Profile not found', code: 'NOT_FOUND' } });
      }
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  });

  // Update platform profile
  router.put('/:platform', validateBody(updateProfileSchema), (req, res, next) => {
    try {
      const updated = service.updateProfile(req.params.platform, req.validatedBody);
      if (!updated) {
        return res.status(404).json({ success: false, error: { message: 'Profile not found', code: 'NOT_FOUND' } });
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
