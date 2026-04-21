export const runtime = 'nodejs';
import { getStats } from '../../../lib/db.js';
export async function GET() {
  try { return Response.json({ stats: getStats() }); }
  catch(e) { return Response.json({ error: e.message }, { status:500 }); }
}