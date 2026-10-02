# Logic Detective

Noir deduction game. Procedurally generated cases; a solver guarantees exactly one culprit per case. Portfolio project, built single-player first, multiplayer later.

## Core design
- Each case is generated from the truth: pick a culprit and traits (hat, coat color, location, item carried), generate true clues, then run a solver to confirm exactly one suspect fits all clues. Regenerate if not.
- Difficulty scales from 5 suspects with direct clues to 8 suspects with relational and negative clues.
- Scoring rewards fewer clues used. Wrong accusation = a strike; three strikes ends the run.
- Style: flat-color noir, no art assets (shapes, emoji, or simple SVG).

## Stack and layout
- /lib     case generator + solver (shared by single-player and multiplayer)
- /public  static front end
- /api     Vercel serverless routes (multiplayer phase)
- /tests   generator/solver tests
- Deploys from GitHub to Vercel on push to main. Separate from my other projects.

## Multiplayer phase (later)
- 2-8 players join by room code; clients poll /api/state every 1-2 seconds.
- State in Upstash Redis. The server only sends clues revealed so far, never the answer.
- 3 rounds; players race to accuse; earlier correct accusations score more.

## Rules for working in this repo
- Write and test the generator/solver before any UI.
- Tests must generate thousands of random cases and assert each has exactly one valid culprit.
- Commit in small, descriptive steps. Never commit secrets; use .env.local and .env.example.
- Keep the game logic free of UI code so it can run on the server later.
