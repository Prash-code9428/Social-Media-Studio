export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.url} - ${err.message}`);

  const statusCode = err.statusCode || (err.message.includes('not found') ? 404 : 400);

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message,
      code: err.code || 'INTERNAL_ERROR',
      details: err.details || undefined,
    },
  });
}
