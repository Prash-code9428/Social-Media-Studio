export function validateBody(schema) {
  return (req, res, next) => {
    try {
      const body = req.body || {};
      const result = schema.safeParse(body);
      if (!result.success) {
        const issues = result.error.issues || result.error.errors || [];
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: issues.map((e) => ({
              field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
              message: e.message,
            })),
          },
        });
      }
      req.validatedBody = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const query = req.query || {};
      const result = schema.safeParse(query);
      if (!result.success) {
        const issues = result.error.issues || result.error.errors || [];
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid query parameters',
            code: 'QUERY_VALIDATION_ERROR',
            details: issues.map((e) => ({
              field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
              message: e.message,
            })),
          },
        });
      }
      req.validatedQuery = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}
