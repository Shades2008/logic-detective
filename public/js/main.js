// UI controller. Draws what the game client hands it and sends taps back.
// No game rules live here, and the culprit is never known to this file until
// the client puts it in a finished case's result.

import { createGameClient, GameError } from './gameClient.js';
import { SCORING } from '../lib/scoring.js';
import { LEVELS } from '../lib/data.js';
import { figureSvg, LOCATION_ICONS, ITEM_ICONS, TRAIT_ICONS, CARD_ICONS } from './art.js';
import { loadProfile, saveProfile } from './storage.js';
import { FEEDBACK_URL } from './config.js';

const client = createGameClient();

const ui = {
  screen: 'title',
  view: null, // current case view from the client
  accuseMode: false,
  selected: null, // suspect index picked in accuse mode
  crossed: new Set(), // the player's own notes; never sent anywhere
  feedback: null, // { text, kind } line above the Accuse button
  lastAccused: null, // name of the suspect accused on the last strike
  profile: loadProfile(),
};

// ---- helpers ---------------------------------------------------------------

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value; // only ever fixed art strings from art.js
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');
const signed = (n) => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const screens = {
  title: $('screen-title'),
  case: $('screen-case'),
  result: $('screen-result'),
  final: $('screen-final'),
};

let announceTimer;
function announce(message) {
  const el = $('announcer');
  el.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = message; }, 40);
}

function show(name) {
  ui.screen = name;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  window.scrollTo(0, 0);
  screens[name].querySelector('[data-heading]')?.focus({ preventScroll: true });
}

function guard(fn) {
  try {
    return fn();
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
    ui.feedback = { text: err.message, kind: 'bad' };
    if (ui.screen === 'case') renderCase();
    return undefined;
  }
}

// ---- how to play -------------------------------------------------------------

function buildHowTo() {
  const dialog = $('howto');
  const sizes = LEVELS.map((l) => l.suspects).join(', ');
  const streakTop = SCORING.streakStep * SCORING.streakCap;

  dialog.replaceChildren(
    h('div', { class: 'howto-body' },
      h('h2', { id: 'howto-title', text: 'How to play' }),
      h('p', { text: 'Each case has one culprit hiding in a lineup of suspects. Work out who it is.' }),

      h('h3', { text: 'The goal' }),
      h('ul', {},
        h('li', { text: `A run is ${LEVELS.length} cases, each harder than the last: ${sizes} suspects.` }),
        h('li', { text: 'Name the culprit using as few clue cards as you can.' })),

      h('h3', { text: 'Clue cards' }),
      h('ul', {},
        h('li', { text: 'Cards start face down and show only a category: Hat, Coat, Location, Item, Neighbors or Same place. Tap a card to open it. Opened clues stay in the Clue log.' }),
        h('li', { text: 'Every clue is true of the culprit. Every card rules out at least one suspect, so there are no tricks and no decoys.' }),
        h('li', { text: `Each card you open costs ${SCORING.perCard} points, so choose the categories that will tell you the most.` })),

      h('h3', { text: 'The lineup' }),
      h('ul', {},
        h('li', { text: 'Suspects stand in a numbered lineup. "Next to" means directly beside: the suspect numbered one lower or one higher. The first and last suspects have only one neighbor.' }),
        h('li', { text: '"Same place" means another suspect whose location matches the culprit\'s.' }),
        h('li', { text: 'A "Neither..." or "No other..." clue is also true when nobody qualifies. If the culprit was alone at their location, "No other suspect at the culprit\'s location was carrying a cane" is true.' })),

      h('h3', { text: 'Crossing off suspects' }),
      h('ul', {},
        h('li', { text: 'Opening a card never crosses anyone off. That is your job.' }),
        h('li', { text: 'Tap a suspect to cross them off, and tap again to bring them back. It is only your notebook and never affects your score.' })),

      h('h3', { text: 'Accusing' }),
      h('ul', {},
        h('li', { text: 'When you are sure, press Accuse, tap a suspect, then confirm.' }),
        h('li', { text: `A wrong accusation is a strike (−${SCORING.perWrongAccusation}). That suspect is cleared and you carry on with the same case. Strikes add up across the whole run, and the ${SCORING.maxStrikes === 3 ? 'third' : 'last'} strike ends it.` })),

      h('h3', { text: 'Scoring' }),
      h('ul', {},
        h('li', { text: `Each case starts at ${fmt(SCORING.baseScore)}. Subtract ${SCORING.perCard} for every card opened and ${SCORING.perWrongAccusation} for every strike.` }),
        h('li', { text: `Par is the number of cards a sharp player needs. Solve the case using par cards or fewer for a +${SCORING.parBonus} bonus.` }),
        h('li', { text: 'A case never scores below 0, and a case you fail scores 0.' }),
        h('li', { text: `Solving cases back to back earns a streak bonus: +${SCORING.streakStep} for the second, +${2 * SCORING.streakStep} for the third, and so on up to +${streakTop}.` }),
        h('li', { text: 'Your best run is saved on this device.' }))),
    h('div', { class: 'howto-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'howto-close', text: 'Got it' })));

  $('howto-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // tap the backdrop
  dialog.addEventListener('close', () => {
    if (!ui.profile.seenHowTo) {
      ui.profile.seenHowTo = true;
      saveProfile({ seenHowTo: true });
    }
  });
}

function openHowTo() {
  const dialog = $('howto');
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  $('howto-close').focus();
}

// ---- title ----------------------------------------------------------------------

function renderTitle() {
  const best = ui.profile.best;
  screens.title.replaceChildren(
    h('div', { class: 'title-screen' },
      h('div', { class: 'title-mark', 'aria-hidden': 'true', text: '🕵️' }),
      h('h1', { id: 'title-heading', tabindex: '-1', 'data-heading': '', text: 'Logic Detective' }),
      h('p', { class: 'tagline', text: `${plural(LEVELS.length, 'noir case')}. One culprit each. Every clue is true.` }),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: startRun, text: 'Start' }),
        h('button', { type: 'button', class: 'btn', onclick: openHowTo, text: 'How to play' })),
      best != null ? h('p', { class: 'best', text: `Personal best: ${fmt(best)}` }) : null));
}

function startRun() {
  ui.view = client.startRun();
  resetCaseNotes();
  show('case');
  renderCase();
  screens.case.querySelector('[data-heading]')?.focus({ preventScroll: true });
}

function resetCaseNotes() {
  ui.accuseMode = false;
  ui.selected = null;
  ui.crossed = new Set();
  ui.feedback = null;
}

// ---- case screen --------------------------------------------------------------------

function stat(label, value) {
  return h('div', { class: 'stat' }, h('span', { text: label }), h('strong', { text: String(value) }));
}

function hud(v) {
  const pips = Array.from({ length: v.maxStrikes }, (_, i) => h('span', { class: `pip${i < v.strikes ? ' on' : ''}` }));
  return h('div', { class: 'hud' },
    h('h1', { class: 'hud-case', id: 'case-heading', tabindex: '-1', 'data-heading': '' },
      `Case ${v.caseNumber} of ${v.totalCases}`, h('small', { text: `Level ${v.level}` })),
    h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'How to play', onclick: openHowTo, text: '?' }),
    h('div', { class: 'hud-stats' },
      stat('Cards', v.cardsOpened),
      stat('Par', v.par),
      h('div', { class: 'stat' },
        h('span', { text: 'Strikes' }),
        h('span', { class: 'pips', role: 'img', 'aria-label': `${v.strikes} of ${v.maxStrikes} strikes` }, pips)),
      stat('Run score', fmt(v.runScore))));
}

function suspectTile(s, v) {
  const innocent = v.innocents.includes(s.index);
  const crossed = ui.crossed.has(s.index) && !innocent;
  const selected = ui.accuseMode && ui.selected === s.index;
  const [first, ...rest] = s.name.split(' ');

  const state = innocent ? 'Cleared as innocent.' : selected ? 'Selected to accuse.' : crossed ? 'Crossed off.' : '';
  const label = `Suspect ${s.position}, ${s.name}. ${s.hat}, ${s.coat} coat, at the ${s.location}, carrying ${s.item}. ${state}`.trim();
  const badge = innocent ? '✕ Innocent' : selected ? '✓ Accusing' : crossed ? '✕ Crossed off' : '';

  const classes = ['suspect', innocent && 'innocent', crossed && 'crossed', selected && 'selected'].filter(Boolean).join(' ');

  const onTap = () => {
    if (innocent) return;
    if (ui.accuseMode) {
      ui.selected = ui.selected === s.index ? null : s.index;
      announce(ui.selected === null ? 'Selection cleared.' : `Selected ${s.name}. Confirm to accuse.`);
    } else {
      if (ui.crossed.has(s.index)) ui.crossed.delete(s.index); else ui.crossed.add(s.index);
      announce(`${s.name} ${ui.crossed.has(s.index) ? 'crossed off' : 'back in play'}.`);
    }
    renderCase(`suspect-${s.index}`);
  };

  return h('li', {},
    h('button', {
      type: 'button', class: classes, 'data-focus': `suspect-${s.index}`, 'aria-label': label,
      'aria-pressed': innocent ? null : String(ui.accuseMode ? selected : crossed),
      'aria-disabled': innocent ? 'true' : null, onclick: onTap,
    },
    h('span', { class: 'pos', 'aria-hidden': 'true', text: String(s.position) }),
    h('span', { html: figureSvg(s) }),
    h('span', { class: 'name', 'aria-hidden': 'true' }, first, rest.length ? h('span', { class: 'last', text: ` ${rest.join(' ')}` }) : null),
    h('ul', { class: 'traits', 'aria-hidden': 'true' },
      h('li', {}, h('span', { class: 'ico', text: TRAIT_ICONS.hat }), h('span', { class: 'txt', text: s.hat })),
      h('li', {}, h('span', { class: 'ico', text: TRAIT_ICONS.coat }), h('span', { class: 'txt', text: `${s.coat} coat` })),
      h('li', {}, h('span', { class: 'ico', text: LOCATION_ICONS[s.location] ?? '📍' }), h('span', { class: 'txt', text: s.location })),
      h('li', {}, h('span', { class: 'ico', text: ITEM_ICONS[s.item] ?? '🎒' }), h('span', { class: 'txt', text: s.item }))),
    h('span', { class: 'badge', 'aria-hidden': 'true', text: badge })));
}

function lineupPanel(v) {
  const last = v.suspects.length;
  return h('div', { class: `panel${ui.accuseMode ? ' accusing' : ''}` },
    h('h2', { text: 'The lineup' }),
    h('p', { class: 'hint', text: ui.accuseMode
      ? 'Tap the suspect you are accusing.'
      : 'Tap a suspect to cross them off, or tap again to bring them back. This is your notebook only.' }),
    h('ol', { class: 'lineup', style: `--n:${last}` }, v.suspects.map((s) => suspectTile(s, v))),
    h('p', { class: 'legend', text: `Neighbors are the suspects numbered one lower and one higher. #1 and #${last} have only one neighbor.` }));
}

function trayPanel(v) {
  const cards = v.cards.map((card) => {
    const label = `${card.label} card, ${card.index + 1} of ${v.cards.length}, ${card.opened ? 'opened' : 'face down'}`;
    return h('li', {},
      h('button', {
        type: 'button', class: `card${card.opened ? ' opened' : ''}`, 'data-focus': `card-${card.index}`,
        'aria-label': label, 'aria-disabled': card.opened ? 'true' : null,
        onclick: () => openCard(card.index),
      },
      h('span', { class: 'ico', 'aria-hidden': 'true', text: CARD_ICONS[card.label] ?? '❔' }),
      h('span', { text: card.label }),
      h('span', { class: 'state', 'aria-hidden': 'true', text: card.opened ? 'Opened' : 'Tap to open' })));
  });
  return h('div', { class: 'panel' },
    h('h2', { text: 'Clue cards' }),
    h('p', { class: 'hint', text: `Tap a card to open it. Each one costs ${SCORING.perCard} points, so pick the categories you think will tell you the most.` }),
    h('ul', { class: 'tray' }, cards));
}

function logPanel(v) {
  const entries = v.log.map((entry, i) =>
    h('li', {}, h('span', { class: 'tag', text: `Clue ${i + 1} · ${entry.label}` }), entry.text));
  return h('div', { class: 'panel' },
    h('h2', { text: 'Clue log' }),
    entries.length
      ? h('ul', { class: 'log', 'aria-label': 'Opened clues, newest first' }, entries.reverse())
      : h('p', { class: 'log-empty', text: 'No clues yet. Open a card to get started.' }));
}

function actionBar(v) {
  const feedback = ui.feedback ? h('p', { class: `feedback ${ui.feedback.kind}`, text: ui.feedback.text }) : null;

  if (!ui.accuseMode) {
    return h('div', { class: 'actionbar' }, feedback,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'accuse', onclick: beginAccuse, text: 'Accuse a suspect' })));
  }

  const picked = ui.selected === null ? null : v.suspects[ui.selected];
  return h('div', { class: 'actionbar' },
    h('p', { text: picked
      ? `Accuse #${picked.position} ${picked.name}? A wrong guess is a strike (−${SCORING.perWrongAccusation}).`
      : 'Tap the suspect you want to accuse.' }),
    h('div', { class: 'btn-row' },
      picked ? h('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'confirm', onclick: confirmAccuse, text: `Yes, accuse ${picked.name.split(' ')[0]}` }) : null,
      h('button', { type: 'button', class: 'btn', 'data-focus': 'cancel', onclick: cancelAccuse, text: 'Cancel' })));
}

function renderCase(focusKey) {
  const v = ui.view;
  screens.case.replaceChildren(
    hud(v),
    h('div', { class: 'case-body' },
      h('div', { class: 'case-main' }, lineupPanel(v), trayPanel(v)),
      h('div', { class: 'case-side' }, logPanel(v))),
    actionBar(v));
  if (focusKey) screens.case.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
}

function openCard(index) {
  if (ui.view.cards[index].opened) return;
  guard(() => {
    ui.view = client.openCard(index);
    ui.feedback = null;
    const entry = ui.view.log[ui.view.log.length - 1];
    announce(`Clue ${ui.view.log.length}: ${entry.text}`);
    renderCase(`card-${index}`);
  });
}

function beginAccuse() {
  ui.accuseMode = true;
  ui.selected = null;
  ui.feedback = null;
  announce('Accuse mode. Tap the suspect you are accusing.');
  const firstOpen = ui.view.suspects.find((s) => !ui.view.innocents.includes(s.index));
  renderCase(firstOpen ? `suspect-${firstOpen.index}` : 'cancel');
}

function cancelAccuse() {
  ui.accuseMode = false;
  ui.selected = null;
  announce('Accusation cancelled.');
  renderCase('accuse');
}

function confirmAccuse() {
  if (ui.selected === null) return;
  guard(() => {
    const accused = ui.view.suspects[ui.selected];
    const { correct, case: view } = client.accuse(ui.selected);
    ui.view = view;
    ui.accuseMode = false;
    ui.selected = null;
    ui.lastAccused = accused.name;
    if (correct) { showResult(); return; }
    if (view.runOver) { showFinal(); return; }
    ui.feedback = {
      kind: 'bad',
      text: `${accused.name} is innocent. Strike ${view.strikes} of ${view.maxStrikes} (−${SCORING.perWrongAccusation}). Keep going.`,
    };
    announce(ui.feedback.text);
    renderCase('accuse');
  });
}

// ---- result screen -------------------------------------------------------------------

function breakdownRow(label, detail, amount, className = '') {
  return h('tr', { class: className },
    h('th', { scope: 'row' }, label, detail ? h('span', { class: 'sub', text: detail }) : null),
    h('td', { class: amount > 0 ? 'pos-num' : amount < 0 ? 'neg-num' : '', text: amount === 0 && !className ? '0' : signed(amount) }));
}

function showResult() {
  const v = ui.view;
  const r = v.result;
  const summary = client.getRunSummary();
  const entry = summary.cases[summary.cases.length - 1];
  const b = r.breakdown;
  const culprit = v.suspects[r.culprit];

  let streak = 0;
  for (let i = summary.cases.length - 1; i >= 0 && summary.cases[i].solved; i--) streak++;

  const overPar = r.cardsOpened - r.par;
  const parLine = r.cardsOpened <= r.par
    ? `${plural(r.cardsOpened, 'card')} opened against par ${r.par}: par bonus earned.`
    : `${plural(r.cardsOpened, 'card')} opened against par ${r.par}: ${plural(overPar, 'card')} over, so no par bonus.`;

  const rows = [
    breakdownRow('Base score', null, b.base),
    breakdownRow('Cards opened', `${r.cardsOpened} × ${SCORING.perCard}`, b.cardPenalty),
    breakdownRow('Strikes', `${r.wrongAccusations} × ${SCORING.perWrongAccusation}`, b.strikePenalty),
    breakdownRow('Par bonus', `${r.cardsOpened} cards vs par ${r.par}`, b.parBonus),
    b.floored ? breakdownRow('Floor at zero', 'A case never scores below 0', -b.subtotal) : null,
    breakdownRow('Case score', null, b.total, 'total'),
  ];

  const next = LEVELS[v.level]; // undefined after the last case
  screens.result.replaceChildren(
    h('div', { class: 'result-head' },
      h('h2', { class: 'verdict good', id: 'result-heading', tabindex: '-1', 'data-heading': '', text: 'Case solved' }),
      h('div', { class: 'panel' },
        h('div', { class: 'culprit-card' },
          h('span', { html: figureSvg(culprit) }),
          h('div', {},
            h('strong', { text: `It was #${culprit.position}, ${culprit.name}.` }),
            h('div', { class: 'fine', text: `${culprit.hat}, ${culprit.coat} coat, at the ${culprit.location}, carrying ${culprit.item}.` }))),
        h('p', { text: parLine }),
        h('p', { text: r.wrongAccusations === 0
          ? 'No strikes on this case.'
          : `${plural(r.wrongAccusations, 'strike')} on this case. Run strikes: ${v.strikes} of ${v.maxStrikes}.` }),
        h('table', { class: 'breakdown' }, h('tbody', {}, rows)),
        entry.streakBonus > 0
          ? h('p', { class: 'pos-num', text: `Streak bonus ${signed(entry.streakBonus)} (${streak} cases solved in a row)` })
          : null,
        h('p', {}, `Run score so far: `, h('strong', { text: fmt(summary.total) }))),
      h('div', { class: 'btn-row' },
        v.runOver
          ? h('button', { type: 'button', class: 'btn btn-primary', onclick: showFinal, text: 'See final results' })
          : h('button', { type: 'button', class: 'btn btn-primary', onclick: nextCase, text: `Next case: Level ${v.level + 1} (${next.suspects} suspects)` }))));
  show('result');
}

function nextCase() {
  guard(() => {
    ui.view = client.nextCase();
    resetCaseNotes();
    show('case');
    renderCase();
    screens.case.querySelector('[data-heading]')?.focus({ preventScroll: true });
  });
}

// ---- final screen ---------------------------------------------------------------------

let recordedFor = null;

function showFinal() {
  const summary = client.getRunSummary();
  const struckOut = summary.endedBy === 'strikes';

  // Personal best, once per finished run.
  let isNewBest = false;
  let saved = true;
  if (recordedFor !== summary) {
    recordedFor = summary;
    const best = ui.profile.best;
    if (summary.total > 0 && (best == null || summary.total > best)) {
      isNewBest = true;
      ui.profile.best = summary.total;
      saved = saveProfile({ best: summary.total });
    }
  }

  const last = summary.cases[summary.cases.length - 1];
  const caseItems = summary.cases.map((c, i) => h('li', {},
    h('div', { class: 'row' },
      h('strong', { text: `Case ${i + 1} · Level ${c.level}` }),
      h('span', { class: c.solved ? 'tag-solved' : 'tag-failed', text: c.solved ? '✓ Solved' : '✕ Not solved' })),
    h('div', { class: 'row meta' },
      h('span', { text: `Cards ${c.cardsOpened} (par ${c.par}) · Strikes ${c.wrongAccusations}` }),
      h('span', { text: `${fmt(c.caseScore)}${c.streakBonus ? ` + ${c.streakBonus} streak` : ''}` })),
    h('div', { class: 'meta', text: `The culprit: ${c.culpritName}` })));

  screens.final.replaceChildren(
    h('div', { class: 'result-head' },
      h('h2', { class: `verdict ${struckOut ? 'bad' : 'good'}`, id: 'final-heading', tabindex: '-1', 'data-heading': '',
        text: struckOut ? 'Game over: three strikes' : `Run complete: all ${summary.totalCases} cases solved` }),
      struckOut && ui.lastAccused
        ? h('p', { text: `You accused ${ui.lastAccused}, but the culprit was ${last.culpritName}.` })
        : null,
      h('div', { class: 'panel' },
        h('div', { class: 'fine', text: 'Run total' }),
        h('div', { class: 'big-score', text: fmt(summary.total) }),
        isNewBest ? h('p', { class: 'pos-num', text: 'New personal best!' })
          : ui.profile.best != null ? h('p', { class: 'fine', text: `Personal best: ${fmt(ui.profile.best)}` }) : null,
        isNewBest && !saved ? h('p', { class: 'fine', text: 'This browser would not let us save your best, so it only lasts until you close the page.' }) : null,
        h('div', { class: 'stats-line' },
          h('span', {}, 'Cases solved ', h('strong', { text: `${summary.casesSolved} of ${summary.totalCases}` })),
          h('span', {}, 'Strikes ', h('strong', { text: `${summary.strikes} of ${summary.maxStrikes}` })),
          h('span', {}, 'Streak bonus ', h('strong', { text: signed(summary.streakBonusTotal) })))),
      h('h3', { text: 'Case by case' }),
      h('ol', { class: 'case-list' }, caseItems),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: startRun, text: 'Play again' }),
        h('button', { type: 'button', class: 'btn', onclick: openHowTo, text: 'How to play' })),
      h('a', { class: 'feedback-link', href: FEEDBACK_URL, text: 'Send feedback' })));
  show('final');
}

// ---- boot --------------------------------------------------------------------------------

buildHowTo();
$('btn-howto-top').addEventListener('click', openHowTo);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.accuseMode && ui.screen === 'case' && !$('howto').open) cancelAccuse();
});

renderTitle();
show('title');
window.__ldReady = true;
if (!ui.profile.seenHowTo) openHowTo(); // first visit: explain the game before the first case
