export const runtime = 'nodejs';
import { getAllDecks, saveDeck, deleteDeck } from '../../../lib/db.js';

export async function GET() {
  try {
    return Response.json({ decks: getAllDecks() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const deck = await req.json();
    saveDeck(deck);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { id } = await req.json();
    deleteDeck(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}