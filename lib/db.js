// lib/db.js
// Vercel-compatible in-memory store.
// All persistence happens in the browser (localStorage).
// The server just acts as a pass-through for the current request lifecycle.

const store = {
  decks: new Map(),
  results: [],
  feedback: [],
};

// ── Decks ──────────────────────────────────────────────────────────────────
export function saveDeck(deck) {
  const now = new Date().toISOString();
  store.decks.set(deck.id, {
    ...deck,
    updatedAt: now,
    createdAt: deck.createdAt || now,
  });
}

export function getAllDecks() {
  return Array.from(store.decks.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

export function deleteDeck(id) {
  store.decks.delete(id);
}

export function updateManyCards(cards) {
  for (const card of cards) {
    for (const [deckId, deck] of store.decks.entries()) {
      const idx = deck.cards?.findIndex(c => c.id === card.id);
      if (idx !== undefined && idx !== -1) {
        deck.cards[idx] = { ...deck.cards[idx], ...card };
        store.decks.set(deckId, deck);
        break;
      }
    }
  }
}

// ── Results ─────────────────────────────────────────────────────────────────
export function saveResult(r) {
  const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  store.results.push({
    id,
    deckId: r.deckId,
    deckName: r.deckName,
    mode: r.mode,
    score: r.score,
    total: r.total,
    accuracy: r.accuracy,
    durationSeconds: r.durationSeconds || 0,
    errors: r.errors || 0,
    topicBreakdown: r.topicBreakdown || {},
    completedAt: new Date().toISOString(),
  });
  return id;
}

export function getAllResults(limit = 100) {
  return store.results
    .slice()
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, limit);
}

export function getDeckResults(deckId) {
  return store.results
    .filter(r => r.deckId === deckId)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export function getStats() {
  const total = store.results.length;
  const avg = total
    ? store.results.reduce((s, r) => s + r.accuracy, 0) / total
    : 0;
  const best = total
    ? Math.max(...store.results.map(r => r.accuracy))
    : 0;

  const modeMap = {};
  for (const r of store.results) {
    if (!modeMap[r.mode]) modeMap[r.mode] = { count: 0, total: 0 };
    modeMap[r.mode].count++;
    modeMap[r.mode].total += r.accuracy;
  }
  const byMode = Object.entries(modeMap).map(([mode, v]) => ({
    mode,
    c: v.count,
    avg: v.total / v.count,
  }));

  return {
    total,
    avgAccuracy: Math.round(avg),
    bestScore: Math.round(best),
    byMode,
    streak: 0, // streak requires persistent DB — not available server-side
  };
}

// ── Feedback ────────────────────────────────────────────────────────────────
export function saveFeedback(f) {
  const id = `fb_${Date.now()}`;
  store.feedback.push({
    id,
    rating: f.rating,
    category: f.category || '',
    comment: f.comment || '',
    email: f.email || '',
    createdAt: new Date().toISOString(),
  });
  return id;
}

export function getAllFeedback() {
  return store.feedback
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}