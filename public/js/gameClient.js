// Game-client adapter: the ONLY thing the UI talks to.
//
//   startRun()            begin a 4-case run, returns the first case view
//   getCase()             the current case view
//   openCard(index)       open a clue card (opening twice costs nothing extra)
//   accuse(suspectIndex)  { correct, case } - a wrong guess is a strike
//   nextCase()            move on after a finished case
//   getRunSummary()       totals and per-case breakdown
//
// Today it runs the game locally. Later this file is replaced by one that
// makes fetch calls to /api with the same six methods and the same return
// shapes, and nothing in the UI changes. Until a case ends, nothing returned
// here contains the culprit, the seed, or the text of an unopened card.
//
// All rules live here or in /lib; the UI only draws what it is handed.

import { generateCase } from '../lib/generator.js';
import { LEVELS } from '../lib/data.js';
import { SCORING, scoreBreakdown, scoreRun } from '../lib/scoring.js';
import { publicView, revealClue, resolveAccusation } from '../lib/view.js';
import { clueToText } from '../lib/text.js';

export const TOTAL_CASES = LEVELS.length;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

// 64 bits from the platform CSPRNG. Never a counter or the clock.
function newRunSeed(random) {
  const bytes = random.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// `random` and `generate` are seams for tests (and later, for the server swap).
export function createGameClient({ random = globalThis.crypto, generate = generateCase } = {}) {
  let run = null;

  const requireRun = () => {
    if (!run) throw new GameError('no-run', 'Start a run first.');
    return run;
  };
  const requireOpenCase = () => {
    const r = requireRun();
    if (r.current.ended) throw new GameError('case-over', 'This case is already finished.');
    return r.current;
  };

  // Par is read from the level, so the number on screen, the number the bonus
  // is judged against, and LEVELS can never disagree.
  const parFor = (level) => LEVELS[level - 1].minPar;

  const startCase = (caseIndex) => {
    const level = caseIndex + 1;
    const data = generate({ seed: `${run.seed}-${level}`, level, mode: 'pool' });
    run.caseIndex = caseIndex;
    run.current = { data, level, opened: [], cleared: [], wrong: 0, ended: false, solved: false };
  };

  const inputOf = (f) => ({ cardsOpened: f.cardsOpened, wrongAccusations: f.wrongAccusations, par: f.par, solved: f.solved });
  const strikesSoFar = () => run.finished.reduce((n, f) => n + f.wrongAccusations, 0) + (run.current.ended ? 0 : run.current.wrong);
  const runIsOver = () => run.current.ended && (run.caseIndex === TOTAL_CASES - 1 || strikesSoFar() >= SCORING.maxStrikes);

  const finishCase = (solved) => {
    const cs = run.current;
    cs.ended = true;
    cs.solved = solved;
    run.finished.push({
      level: cs.level,
      solved,
      cardsOpened: cs.opened.length,
      par: parFor(cs.level),
      wrongAccusations: cs.wrong,
      culprit: cs.data.culprit,
      culpritName: cs.data.suspects[cs.data.culprit].name,
    });
  };

  const caseView = () => {
    const cs = run.current;
    const pub = publicView(cs.data);
    const opened = new Set(cs.opened);
    const textOf = (index) => clueToText(revealClue(cs.data, index));

    const view = {
      caseNumber: run.caseIndex + 1,
      totalCases: TOTAL_CASES,
      level: cs.level,
      par: parFor(cs.level),
      cardsOpened: cs.opened.length,
      strikes: strikesSoFar(),
      maxStrikes: SCORING.maxStrikes,
      runScore: scoreRun(run.finished.map(inputOf)).total,
      status: !cs.ended ? 'playing' : cs.solved ? 'solved' : 'failed',
      runOver: runIsOver(),
      suspects: pub.suspects.map((s, index) => ({ index, position: index + 1, ...s })),
      cards: pub.cards.map((card) => (opened.has(card.index)
        ? { ...card, opened: true, text: textOf(card.index) }
        : { ...card, opened: false })),
      log: cs.opened.map((index) => ({ index, label: pub.cards[index].label, text: textOf(index) })),
      innocents: cs.cleared.slice(),
      result: null,
    };

    if (cs.ended) {
      const f = run.finished[run.finished.length - 1];
      const breakdown = scoreBreakdown(inputOf(f));
      view.result = {
        solved: f.solved,
        culprit: f.culprit,
        culpritName: f.culpritName,
        cardsOpened: f.cardsOpened,
        par: f.par,
        wrongAccusations: f.wrongAccusations,
        breakdown,
        caseScore: breakdown.total,
      };
    }
    return view;
  };

  return {
    startRun() {
      run = { seed: newRunSeed(random), caseIndex: 0, current: null, finished: [] };
      startCase(0);
      return caseView();
    },

    getCase() {
      requireRun();
      return caseView();
    },

    openCard(index) {
      const cs = requireOpenCase();
      if (!Number.isInteger(index) || index < 0 || index >= cs.data.clues.length) {
        throw new GameError('bad-index', `No such card: ${index}`);
      }
      if (!cs.opened.includes(index)) cs.opened.push(index); // already open: no extra cost
      return caseView();
    },

    accuse(suspectIndex) {
      const cs = requireOpenCase();
      if (!Number.isInteger(suspectIndex) || suspectIndex < 0 || suspectIndex >= cs.data.suspects.length) {
        throw new GameError('bad-index', `No such suspect: ${suspectIndex}`);
      }
      if (cs.cleared.includes(suspectIndex)) {
        throw new GameError('already-cleared', 'That suspect has already been cleared.');
      }
      const { correct } = resolveAccusation(cs.data, suspectIndex);
      if (correct) {
        finishCase(true);
      } else {
        cs.wrong += 1;
        cs.cleared.push(suspectIndex);
        if (strikesSoFar() >= SCORING.maxStrikes) finishCase(false);
      }
      return { correct, case: caseView() };
    },

    nextCase() {
      const r = requireRun();
      if (!r.current.ended) throw new GameError('case-not-over', 'Finish this case first.');
      if (runIsOver()) throw new GameError('run-over', 'The run is over.');
      startCase(r.caseIndex + 1);
      return caseView();
    },

    getRunSummary() {
      const r = requireRun();
      const scored = scoreRun(r.finished.map(inputOf));
      const over = runIsOver();
      return {
        over,
        endedBy: !over ? null : strikesSoFar() >= SCORING.maxStrikes ? 'strikes' : 'completed',
        total: scored.total,
        streakBonusTotal: scored.streakBonuses.reduce((a, b) => a + b, 0),
        casesSolved: r.finished.filter((f) => f.solved).length,
        totalCases: TOTAL_CASES,
        strikes: strikesSoFar(),
        maxStrikes: SCORING.maxStrikes,
        cases: r.finished.map((f, i) => ({
          level: f.level,
          solved: f.solved,
          cardsOpened: f.cardsOpened,
          par: f.par,
          wrongAccusations: f.wrongAccusations,
          caseScore: scored.caseScores[i],
          streakBonus: scored.streakBonuses[i],
          breakdown: scoreBreakdown(inputOf(f)),
          culpritName: f.culpritName,
        })),
      };
    },
  };
}
