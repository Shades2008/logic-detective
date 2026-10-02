// Draws the leaderboard states: loading, empty, unavailable, error, and the
// ranked list. Pure drawing: it gets a state and returns DOM nodes. Every
// name goes through textContent via h(), never innerHTML.

import { MAX_CASES } from '../lib/leaderboard.js';

const fmt = (n) => Number(n).toLocaleString('en-US');

// state: { status: 'loading' | 'ok' | 'unavailable' | 'error', entries? }
// latest: { id, rank, score, name } for the player's latest submitted run, or null.
export function renderLeaderboard({ h, state, latest = null, onRetry }) {
  const retry = () => h('button', { type: 'button', class: 'btn', onclick: onRetry, text: 'Try again' });

  if (state.status === 'loading') {
    return h('p', { class: 'lb-note', role: 'status', text: 'Loading the leaderboard…' });
  }
  if (state.status === 'unavailable') {
    return h('div', { class: 'lb-note', role: 'status' },
      h('p', { text: 'The leaderboard is unavailable right now. You can still play; scores just will not be posted.' }), retry());
  }
  if (state.status === 'error') {
    return h('div', { class: 'lb-note', role: 'status' },
      h('p', { text: 'Could not load the leaderboard. Check your connection and try again.' }), retry());
  }
  if (!state.entries.length) {
    return h('p', { class: 'lb-note', role: 'status', text: 'No runs yet. Finish a run with a nickname to be the first.' });
  }

  const mineHere = latest ? state.entries.some((e) => e.id === latest.id) : false;
  const rows = state.entries.map((e) => {
    const mine = latest && e.id === latest.id;
    return h('tr', { class: mine ? 'mine' : null, 'aria-current': mine ? 'true' : null },
      h('th', { scope: 'row', class: 'rank', text: String(e.rank) }),
      h('td', { class: 'who' }, e.name, mine ? h('span', { class: 'you', text: ' You' }) : null),
      h('td', { class: 'num', text: fmt(e.score) }),
      h('td', { class: 'num', text: `${e.solved} of ${MAX_CASES}` }));
  });

  return h('div', {},
    h('table', { class: 'board' },
      h('caption', { class: 'sr-only', text: 'Top runs' }),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', text: '#' }), h('th', { scope: 'col', text: 'Name' }),
        h('th', { scope: 'col', class: 'num', text: 'Score' }), h('th', { scope: 'col', class: 'num', text: 'Solved' }))),
      h('tbody', {}, rows)),
    latest && !mineHere
      ? h('p', { class: 'lb-latest', text: latest.rank
        ? `Your latest run: #${latest.rank}, ${latest.name}, ${fmt(latest.score)} points.`
        : `Your latest run (${fmt(latest.score)} points) did not make the top 100.` })
      : null);
}
