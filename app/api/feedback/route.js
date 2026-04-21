export const runtime = 'nodejs';
import { saveFeedback, getAllFeedback } from '../../../lib/db.js';
export async function GET() {
  try { return Response.json({ feedback: getAllFeedback() }); }
  catch(e) { return Response.json({ error: e.message }, { status:500 }); }
}
export async function POST(req) {
  try { const f = await req.json(); const id = saveFeedback(f); return Response.json({ ok:true, id }); }
  catch(e) { return Response.json({ error: e.message }, { status:500 }); }
}