# Logic Detective

Procedurally generated noir deduction game where a solver guarantees every case has exactly one culprit.

Status: **generator + solver + tests** (no UI yet). Planned: single-player UI, then 2-8 player rooms
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

## Layout

```
lib/        shared by the front end and /api (plain ESM, no Node-only APIs)
  data.js       traits, names, difficulty levels
  rng.js        seeded PRNG
  clues.js      clue format, holds(), clue enumeration, wording
  solver.js     solve(), isUnique(), narrowing()
  generator.js  generateCase({ seed, level })
test/       node:test suites
scripts/    sample.js: print a case for eyeballing
```

A generated case is `{ seed, level, attempt, suspects, culprit, clues }`. `culprit` is an index kept
**outside** the suspect objects so a server can send `suspects` and `clues.slice(0, k)` without leaking it.

## Commands

```
npm test                   # needs Node >= 20, no dependencies
npm run sample -- 4 myseed # level 4, seed "myseed"
```
