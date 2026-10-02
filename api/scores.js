// Vercel route for /api/scores. All logic lives in server/scores.js so it can be
// tested without Vercel. Reads KV_REST_API_URL and KV_REST_API_TOKEN from the
// environment; if either is missing the handler answers 503.
import { handleScores } from '../server/scores.js';

export function GET(request) {
  return handleScores(request, { env: process.env });
}

export function POST(request) {
  return handleScores(request, { env: process.env });
}
