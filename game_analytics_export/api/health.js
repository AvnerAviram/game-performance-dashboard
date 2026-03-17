/**
 * Health check endpoint for uptime monitoring
 * GET /api/health - returns 200 with status
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    version: pkg.version || '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
