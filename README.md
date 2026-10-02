# Logic Detective

Procedurally generated noir deduction game where a solver guarantees every case has exactly one culprit.

Status: **generator, solver, pool mode, public view, scoring + tests** (no UI yet). Planned: single-player UI, then 2-8 player rooms
(Upstash Redis, polling `/api/state`), deployed on Vercel.

## How a case is made

1. Build a lineup of suspects (hat, coat colour, location, item carried) and pick the culprit.
2. Collect every clue that is *true* of the culprit.
3. Reveal clues one at a time, each ruling out at least one remaining suspect, until one is left.
4. Run the solver over the clue list. Exactly one suspect must fit, and it must be the culprit; otherwise regenerate.

Same `seed` + `level` always gives the same case.

| Level | Suspects | Clues                                   |
| ----- | -------- | --------------------------------------- |
| 1     | 5        | direct                                  |
| 2     | 6        | direct, negative                        |
| 3     | 7        | direct, negative, relational            |
| 4     | 8        | direct, negative, relational (longer)   |

Clue examples: "The culprit was wearing a fedora." / "...was not carrying a cane." /
"...was standing next to someone in a red coat." / "...was not at the same place as anyone carrying an umbrella."
Roster order is the police lineup, so "next to" means a neighbour in the array.

## Modes

`generateCase({ seed, level, mode })`

- **`race`** (default, multiplayer): the minimal deck above, revealed in order. Every clue narrows the field.
- **`pool`** (single-player): the same kind of deck padded with extra true clues into a shuffled pool of
  `poolSize` cards (6 / 7 / 8 / 10). The player opens the cards they choose, so skill is picking informative ones.
  - Every card is true of the culprit; no two cards have the same effect on the roster.
  - The pool always holds a *strong* card (rules out half the suspects or more) and a *weak* one (rules out one or two).
  - `par` is the size of the smallest subset of the pool that identifies the culprit (brute-forced).
    It is stored on the case and never sent to clients.
  - `verifyCase` (solver) is the final gate: every clue true, exactly one survivor, par correct. Otherwise regenerate.

`minPar` (per level) is the pool-mode floor on par. It is lower than `minClues` at levels 3-4 on purpose: a pool with a
strong card leaves at most floor(n/2) suspects, which caps par at floor(n/2).

## What a client may see

`publicView(case)` gives suspects plus `{ index, label }` cards, where the label is only a category
(Hat, Coat, Location, Item, Neighbors, Same place). `revealClue(case, index)` returns the full clue for one card.
The view never contains the culprit, par, clue values, or the seed (the shared generator could rebuild the case from it).

## Scoring

`lib/scoring.js`, all numbers in `SCORING`: 1000 per case, -75 per card opened, -200 per wrong accusation,
+150 at or under par, floor 0, unsolved = 0. Strikes accumulate across a run and three end it. Consecutive
solved cases earn a streak bonus. `scoreCase(...)` and `scoreRun(caseResults)`.

## Layout

```
lib/        shared by the front end and /api (plain ESM, no Node-only APIs)
  data.js       traits, names, difficulty levels
  rng.js        seeded PRNG
  clues.js      clue format, holds(), clue enumeration, wording
  solver.js     solve(), isUnique(), narrowing(), smallestSufficientSubset(), verifyCase()
  generator.js  generateCase({ seed, level, mode })
  view.js       publicView(), revealClue()
  scoring.js    SCORING, scoreCase(), scoreRun()
test/       node:test suites
scripts/    sample.js (print a case), pool-stats.js (tuning table)
```

A race case is `{ seed, level, attempt, suspects, culprit, clues }`; a pool case adds `mode: 'pool'` and `par`. `culprit` is an index kept
**outside** the suspect objects so a server can send `suspects` and `clues.slice(0, k)` without leaking it.

## Commands

```
npm test                   # needs Node >= 20, no dependencies
npm run sample -- 4 myseed # level 4, seed "myseed", race deck
npm run sample -- 4 myseed --pool  # pool, par and the public view
npm run stats              # per-level pool/par table for tuning LEVELS
```
