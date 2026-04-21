import Database from 'better-sqlite3';
import path from 'path';

let _db = null;

export function getDb() {
  if (_db) return _db;
  const DB_PATH = path.join(process.cwd(), 'flashmind.db');
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pages INTEGER DEFAULT 0,
      card_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      short_answer TEXT DEFAULT '',
      topic TEXT DEFAULT 'General',
      options TEXT DEFAULT '[]',
      correct_index INTEGER DEFAULT 0,
      interval_hours REAL DEFAULT 24,
      ease_factor REAL DEFAULT 2.5,
      repetitions INTEGER DEFAULT 0,
      next_review TEXT,
      last_review TEXT,
      history TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL,
      deck_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      topic_breakdown TEXT DEFAULT '{}',
      completed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      rating INTEGER NOT NULL,
      category TEXT DEFAULT '',
      comment TEXT DEFAULT '',
      email TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_results_date ON test_results(completed_at);
    CREATE INDEX IF NOT EXISTS idx_results_deck ON test_results(deck_id);
  `);
}

// ── Decks ──────────────────────────────────────────────────────────────────
export function saveDeck(deck) {
  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`INSERT OR REPLACE INTO decks(id,name,pages,card_count,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run(deck.id, deck.name, deck.pages||0, deck.cards.length, deck.createdAt||now, now);
    for (const c of deck.cards) {
      db.prepare(`INSERT OR REPLACE INTO cards(id,deck_id,front,back,short_answer,topic,options,correct_index,interval_hours,ease_factor,repetitions,next_review,last_review,history,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(c.id,deck.id,c.front,c.back,c.shortAnswer||'',c.topic||'General',JSON.stringify(c.options||[]),c.correctIndex||0,c.intervalHours||24,c.easeFactor||2.5,c.repetitions||0,c.nextReview||now,c.lastReview||null,JSON.stringify(c.history||[]),c.createdAt||now);
    }
  });
  tx();
}

export function getAllDecks() {
  const db = getDb();
  return db.prepare('SELECT * FROM decks ORDER BY created_at DESC').all().map(d => ({
    ...d, createdAt: d.created_at, updatedAt: d.updated_at,
    cards: getCards(d.id),
  }));
}

export function deleteDeck(id) {
  getDb().prepare('DELETE FROM decks WHERE id=?').run(id);
}

function getCards(deckId) {
  return getDb().prepare('SELECT * FROM cards WHERE deck_id=? ORDER BY created_at').all(deckId).map(c => ({
    id:c.id, deckId:c.deck_id, front:c.front, back:c.back,
    shortAnswer:c.short_answer, topic:c.topic,
    options:JSON.parse(c.options||'[]'), correctIndex:c.correct_index,
    intervalHours:c.interval_hours, easeFactor:c.ease_factor,
    repetitions:c.repetitions, nextReview:c.next_review,
    lastReview:c.last_review, history:JSON.parse(c.history||'[]'),
    createdAt:c.created_at,
  }));
}

export function updateManyCards(cards) {
  const db = getDb();
  const stmt = db.prepare('UPDATE cards SET interval_hours=?,ease_factor=?,repetitions=?,next_review=?,last_review=?,history=? WHERE id=?');
  const tx = db.transaction(cards => { for (const c of cards) stmt.run(c.intervalHours,c.easeFactor,c.repetitions,c.nextReview,c.lastReview,JSON.stringify(c.history||[]),c.id); });
  tx(cards);
}

// ── Results ─────────────────────────────────────────────────────────────────
export function saveResult(r) {
  const db = getDb();
  const id = `r_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  db.prepare(`INSERT INTO test_results(id,deck_id,deck_name,mode,score,total,accuracy,duration_seconds,errors,topic_breakdown,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,r.deckId,r.deckName,r.mode,r.score,r.total,r.accuracy,r.durationSeconds||0,r.errors||0,JSON.stringify(r.topicBreakdown||{}),new Date().toISOString());
  return id;
}

export function getAllResults(limit=100) {
  return getDb().prepare('SELECT * FROM test_results ORDER BY completed_at DESC LIMIT ?').all(limit).map(r=>({
    ...r, topicBreakdown:JSON.parse(r.topic_breakdown||'{}'),
    completedAt:r.completed_at, deckId:r.deck_id, deckName:r.deck_name,
    durationSeconds:r.duration_seconds,
  }));
}

export function getDeckResults(deckId) {
  return getDb().prepare('SELECT * FROM test_results WHERE deck_id=? ORDER BY completed_at DESC').all(deckId).map(r=>({
    ...r, topicBreakdown:JSON.parse(r.topic_breakdown||'{}'),
    completedAt:r.completed_at, deckId:r.deck_id, deckName:r.deck_name,
    durationSeconds:r.duration_seconds,
  }));
}

export function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM test_results').get().c;
  const avg   = db.prepare('SELECT AVG(accuracy) as a FROM test_results').get().a || 0;
  const best  = db.prepare('SELECT MAX(accuracy) as a FROM test_results').get().a || 0;
  const byMode = db.prepare('SELECT mode,COUNT(*) as c,AVG(accuracy) as avg FROM test_results GROUP BY mode').all();
  const streak = calcStreak(db);
  return { total, avgAccuracy:Math.round(avg), bestScore:Math.round(best), byMode, streak };
}

function calcStreak(db) {
  const rows = db.prepare(`SELECT DATE(completed_at) as d FROM test_results GROUP BY DATE(completed_at) ORDER BY d DESC`).all();
  if (!rows.length) return 0;
  let streak=0, check=new Date().toISOString().slice(0,10);
  for (const r of rows) {
    if (r.d===check) { streak++; const d=new Date(check); d.setDate(d.getDate()-1); check=d.toISOString().slice(0,10); }
    else break;
  }
  return streak;
}

// ── Feedback ────────────────────────────────────────────────────────────────
export function saveFeedback(f) {
  const id=`fb_${Date.now()}`;
  getDb().prepare(`INSERT INTO feedback(id,rating,category,comment,email,created_at) VALUES(?,?,?,?,?,?)`).run(id,f.rating,f.category||'',f.comment||'',f.email||'',new Date().toISOString());
  return id;
}

export function getAllFeedback() {
  return getDb().prepare('SELECT * FROM feedback ORDER BY created_at DESC').all().map(f=>({...f,createdAt:f.created_at}));
}