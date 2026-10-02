// Single-player scoring: pure functions, every number in SCORING.
//
// A case starts at baseScore. Each opened card and each wrong accusation costs
// points, and finishing at or under par earns a bonus. A case that was not
// solved scores 0, and a solved case never drops below 0.
//
// A run is a sequence of cases. Strikes (wrong accusations) add up across the
// run and the run ends when they reach maxStrikes. Consecutive solved cases
// earn a streak bonus.

export const SCORING = {
  baseScore: 1000,
  perCard: 75,
  perWrongAccusation: 200,
  parBonus: 150,
  maxStrikes: 3,
  // The nth solved case in a row earns (n - 1) * streakStep, with n - 1 capped.
  streakStep: 50,
  streakCap: 5,
};

function assertCount(name, value) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
}

// Score for one case. `par` is the case's par (smallest sufficient subset).
export function scoreCase({ cardsOpened, wrongAccusations, par, solved }, rules = SCORING) {
  assertCount('cardsOpened', cardsOpened);
  assertCount('wrongAccusations', wrongAccusations);
  assertCount('par', par);
  if (!solved) return 0;
  let score = rules.baseScore - rules.perCard * cardsOpened - rules.perWrongAccusation * wrongAccusations;
  if (cardsOpened <= par) score += rules.parBonus;
  return Math.max(0, score);
}

// caseResults: [{ cardsOpened, wrongAccusations, par, solved }, ...] in play order.
// Cases after the run-ending strike are ignored.
export function scoreRun(caseResults, rules = SCORING) {
  const caseScores = [];
  const streakBonuses = [];
  let strikes = 0;
  let streak = 0;
  let ended = false;

  for (const result of caseResults) {
    if (ended) break;
    const base = scoreCase(result, rules);
    strikes += result.wrongAccusations;
    if (result.solved) {
      streak += 1;
      streakBonuses.push(Math.min(streak - 1, rules.streakCap) * rules.streakStep);
    } else {
      streak = 0;
      streakBonuses.push(0);
    }
    caseScores.push(base);
    if (strikes >= rules.maxStrikes) ended = true;
  }

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    total: sum(caseScores) + sum(streakBonuses),
    caseScores,
    streakBonuses,
    casesCounted: caseScores.length,
    strikes,
    ended,
  };
}
