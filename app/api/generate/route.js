export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { text, deckName } = await request.json();

    // Validate input text
    if (!text || text.trim().length < 50) {
      return Response.json({ error: 'Text too short.' }, { status: 400 });
    }

    // Validate API key exists
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'GROQ_API_KEY missing in .env.local' }, { status: 500 });
    }

    const truncated = text.slice(0, 14000);

    const prompt = `You are a world-class educator creating the best possible flashcards.

RULES:
1. FRONT: One clear specific question requiring active recall.
2. BACK: 3–6 sentence elaborated answer — explain WHY, give a real example or analogy. Write like a great teacher, not a bot.
3. shortAnswer: 1-sentence summary of the correct answer (for matching game).
4. Generate 15–22 cards covering all key concepts.
5. 4 multiple-choice options: index 0 = correct, 1–3 = plausible wrong answers.
6. topic: 2–4 word label.

CONTENT:
${truncated}

Output ONLY raw JSON array (no markdown fences):
[{"front":"...","back":"...","shortAnswer":"...","topic":"...","options":["correct","wrong1","wrong2","wrong3"],"correctIndex":0}]`;

    // Call Groq API
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 6000,
      }),
    });

    // Handle Groq API errors with detailed message
    if (!resp.ok) {
      let errorMessage = 'AI call failed.';
      try {
        const errBody = await resp.json();
        errorMessage = errBody?.error?.message || `HTTP ${resp.status}: ${resp.statusText}`;
        console.error('Groq API error:', resp.status, errBody);
      } catch {
        errorMessage = `HTTP ${resp.status}: ${resp.statusText}`;
        console.error('Groq API error (non-JSON):', resp.status, resp.statusText);
      }
      return Response.json({ error: `AI call failed: ${errorMessage}` }, { status: 500 });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    if (!raw) {
      return Response.json({ error: 'Empty response from AI.' }, { status: 500 });
    }

    // Clean and parse JSON response
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let cards;
    try {
      cards = JSON.parse(cleaned);
    } catch {
      // Fallback: try to extract JSON array from the response
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          cards = JSON.parse(match[0]);
        } catch {
          console.error('Failed to parse extracted JSON:', match[0].slice(0, 200));
          return Response.json({ error: 'Invalid AI response format.' }, { status: 500 });
        }
      } else {
        console.error('No JSON array found in response:', cleaned.slice(0, 200));
        return Response.json({ error: 'Invalid AI response format.' }, { status: 500 });
      }
    }

    if (!Array.isArray(cards) || !cards.length) {
      return Response.json({ error: 'No cards generated.' }, { status: 500 });
    }

    // Enrich and validate cards
    const now = new Date().toISOString();
    const enriched = cards
      .filter(c => c.front && c.back)
      .map((c, i) => ({
        id: `${Date.now()}_${i}`,
        front: String(c.front).trim(),
        back: String(c.back).trim(),
        shortAnswer: String(c.shortAnswer || c.back.slice(0, 80)).trim(),
        topic: String(c.topic || 'General').trim(),
        options:
          Array.isArray(c.options) && c.options.length === 4
            ? c.options.map(String)
            : [
                String(c.back).slice(0, 80),
                'Not applicable',
                'The opposite',
                'None of the above',
              ],
        correctIndex: typeof c.correctIndex === 'number' ? c.correctIndex : 0,
        intervalHours: 24,
        easeFactor: 2.5,
        repetitions: 0,
        nextReview: now,
        lastReview: null,
        history: [],
        createdAt: now,
      }));

    if (!enriched.length) {
      return Response.json({ error: 'No valid cards after filtering.' }, { status: 500 });
    }

    return Response.json({ cards: enriched, count: enriched.length });

  } catch (e) {
    console.error('Unexpected server error:', e);
    return Response.json({ error: e.message || 'Unexpected server error.' }, { status: 500 });
  }
}