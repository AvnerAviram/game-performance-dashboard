/**
 * Feedback endpoint for user-reported data issues
 * POST /api/feedback - stores report for later review
 *
 * Body: { game_id, game_name, issue_type, description }
 * issue_type: "wrong_feature" | "missing_feature" | "wrong_theme" | "other"
 */
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_PATH = join(__dirname, '..', 'data', 'feedback.jsonl');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { game_id, game_name, issue_type, description } = req.body || {};

    if (!game_name || !issue_type || !description) {
      return res.status(400).json({ error: 'Missing required fields: game_name, issue_type, description' });
    }

    const validTypes = ['wrong_feature', 'missing_feature', 'wrong_theme', 'other'];
    if (!validTypes.includes(issue_type)) {
      return res.status(400).json({ error: `Invalid issue_type. Must be one of: ${validTypes.join(', ')}` });
    }

    const entry = {
      game_id: game_id || null,
      game_name,
      issue_type,
      description: description.slice(0, 1000),
      submitted_at: new Date().toISOString(),
      status: 'new',
    };

    await fs.appendFile(FEEDBACK_PATH, JSON.stringify(entry) + '\n', 'utf-8');

    return res.status(200).json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('Feedback error:', error);
    return res.status(500).json({ error: 'Failed to save feedback' });
  }
}
