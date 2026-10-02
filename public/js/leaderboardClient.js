// Talks to /api/scores. Never throws: every outcome is a { status } object the
// UI can show. The browser sends the nickname and the per-case results only:
// no total, no par, no seed. The server works out the score itself.

// Only these four fields leave the browser for each case.
export function toSubmission(name, summary) {
  return {
    name,
    cases: summary.cases.map(({ level, cardsOpened, wrongAccusations, solved }) => ({ level, cardsOpened, wrongAccusations, solved })),
  };
}

export function createLeaderboardClient({ fetchImpl = (...args) => globalThis.fetch(...args), url = 'api/scores' } = {}) {
  const readJson = async (response) => {
    try { return await response.json(); } catch { return null; }
  };

  return {
    // -> { status: 'ok', entries } | { status: 'unavailable' } | { status: 'error' }
    async fetchTop() {
      try {
        const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
        if (response.status === 503) return { status: 'unavailable' };
        const body = await readJson(response);
        if (!response.ok || !body || !Array.isArray(body.entries)) return { status: 'error' };
        return { status: 'ok', entries: body.entries };
      } catch {
        return { status: 'error' };
      }
    },

    // -> { status: 'ok', id, score, rank } | 'unavailable' | 'rate-limited' | 'rejected' | 'error'
    async submit(name, summary) {
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toSubmission(name, summary)),
        });
        const body = await readJson(response);
        if (response.status === 503) return { status: 'unavailable' };
        if (response.status === 429) return { status: 'rate-limited', retryAfter: Number(response.headers.get('retry-after')) || null };
        if (response.status === 400) return { status: 'rejected', message: typeof body?.message === 'string' ? body.message : 'The run was not accepted.' };
        if (response.status === 201 && body?.ok && typeof body.id === 'string') {
          return { status: 'ok', id: body.id, score: body.score, rank: Number.isInteger(body.rank) ? body.rank : null };
        }
        return { status: 'error' };
      } catch {
        return { status: 'error' };
      }
    },
  };
}
