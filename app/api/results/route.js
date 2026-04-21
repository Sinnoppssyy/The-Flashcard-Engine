export const runtime = 'nodejs';
import { saveResult, getAllResults, getDeckResults } from '../../../lib/db.js';
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const deckId = searchParams.get('deckId');
    if (deckId) return Response.json({ results: getDeckResults(deckId) });
    return Response.json({ results: getAllResults(100) });
  } catch(e) { return Response.json({ error: e.message }, { status:500 }); }
}
export async function POST(req) {
  try { const r = await req.json(); const id = saveResult(r); return Response.json({ ok:true, id }); }
  catch(e) { return Response.json({ error: e.message }, { status:500 }); }
}