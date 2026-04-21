export const runtime = 'nodejs';
import { updateManyCards } from '../../../../lib/db.js';
export async function POST(req) {
  try { const { cards } = await req.json(); updateManyCards(cards); return Response.json({ ok:true }); }
  catch(e) { return Response.json({ error: e.message }, { status:500 }); }
}