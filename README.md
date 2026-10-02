# Logic Detective

A noir deduction game. Four cases, one culprit each, and every clue is true.
Open clue cards, cross off suspects, and name the culprit in as few cards as you can.

**Play it:** `https://YOUR-VERCEL-URL.vercel.app` (placeholder: add the live link after the first deploy)

No login, no install, no backend. It runs entirely in the browser.

## How to play

- A run is **4 cases** with 5, 6, 7 and 8 suspects. Each case has exactly one culprit.
- Suspects stand in a numbered lineup. Clue cards start **face down**, labelled only by category
  (Hat, Coat, Location, Item, Neighbors, Same place). Tap a card to open it.
- **Every clue is true of the culprit**, and every card rules out at least one suspect. No tricks, no decoys.
- "Next to" means the suspect numbered one lower or one higher in the lineup.
- Opening a card does **not** cross anyone off. That's your job: tap a suspect to cross them off (it's only your notebook).
- When you're sure, press **Accuse**, tap a suspect, and confirm.
  A wrong accusation is a **strike**. Strikes add up across the whole run, and the third one ends it.
- Scoring: 1000 per case, -75 per card opened, -200 per strike, +150 for solving in par cards or fewer,
  never below 0. Solving cases back to back earns a streak bonus. Your best run is saved on your device.

## How the solver works

Cases are generated **from the truth**, then proven solvable:

1. Build a lineup of suspects with four traits each (hat, coat colour, location, item carried) and pick the culprit.
2. List every clue that is *true of the culprit*: direct ("wore a fedora"), negative ("was not carrying a cane"),
   and relational ("a neighbor in the lineup wore a red coat", "no one else at their location carried a cane").
3. Pick clues until only the culprit is left. Each pick must rule out at least one remaining suspect.
4. **Run the solver.** A clue is a yes/no test on a suspect, so the solver simply keeps every suspect for whom all clues
   hold. The case ships only if that leaves exactly one suspect, and it is the culprit. Otherwise it is thrown away and
   regenerated. A separate check also confirms every clue is true of the culprit.

Same `seed` + `level` + `mode` always produces the same case.

There are two ways to deal the clues (`generateCase({ seed, level, mode })`):

- **`pool`** (single-player, what the site uses): a shuffled pool of 6 to 10 clue cards, all true and none equivalent to
  another. The player chooses which to open. **Par** is the size of the smallest subset of the pool that identifies the
  culprit, found by brute force over every subset (at most 1024). The pool always contains at least one strong card
  (rules out half the suspects or more) and one weak card (rules out one or two), so choosing matters.
- **`race`** (planned multiplayer): a short ordered deck revealed one clue at a time. Each clue narrows the field at the
  moment it is revealed, but the deck is **not** guaranteed to be the smallest possible set of clues: a later clue can
  make an earlier one redundant.

The solver and generator are plain ES modules in `lib/`, shared by the browser and (later) the serverless API.

## Run it

Needs Node 20 or newer. No dependencies.

```
npm test                # unit tests, 1000 random cases per level, UI state machine, site checks
npm run dev             # http://localhost:8080  (PORT=3000 npm run dev to change)
npm run build           # copy lib/ into public/lib/ (done for you by pretest and by Vercel)
npm run sample -- 4 myseed --pool   # print a pool case, its par and the public view
npm run stats           # per-level pool/par table for tuning
```

## Deploy (Vercel)

Import the repo as a new project. `vercel.json` sets the build and output folder:

- `buildCommand`: `npm run build` copies `lib/*.js` to `public/lib/` so the browser can import it.
  The rules live once, in `lib/`; `public/lib/` is generated and gitignored.
- `outputDirectory`: `public`. The site uses only relative URLs, so it works from the root of a domain.

## Layout

```
lib/        shared rules (browser and server): data, rng, clues, solver, generator, view, scoring, text
public/     the static site: index.html, css/, js/ (main.js UI, gameClient.js adapter, art.js, storage.js)
scripts/    build.js, dev.js, sample.js, pool-stats.js
test/       node:test suites
```

`public/js/gameClient.js` is the only thing the UI talks to (`startRun`, `getCase`, `openCard`, `accuse`,
`nextCase`, `getRunSummary`). It holds the full case privately and hands the UI copies that contain no culprit, seed,
or unopened clue text until a case ends. When multiplayer arrives, that file is the one swapped for calls to `/api`.

## Roadmap

Multiplayer: 2 to 8 players join by room code, state in Upstash Redis, clients poll `/api/state`, three rounds,
earlier correct accusations score more.
