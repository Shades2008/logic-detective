// Print generated cases for eyeballing.
//   npm run sample -- [level] [seed]          race mode: the ordered deck
//   npm run sample -- [level] [seed] --pool   pool mode: pool, par, public view
import { generateCase } from '../lib/generator.js';
import { describeClue } from '../lib/clues.js';
import { narrowing, popcount, survivorMask } from '../lib/solver.js';
import { publicView } from '../lib/view.js';

const args = process.argv.slice(2);
const pool = args.includes('--pool');
const [level = 1, seed] = args.filter((a) => !a.startsWith('--'));
const c = generateCase({ level: Number(level), seed, mode: pool ? 'pool' : 'race' });

console.log(`seed=${c.seed} level=${c.level} mode=${pool ? 'pool' : 'race'} attempts=${c.attempt + 1}\n`);
c.suspects.forEach((s, i) => {
  const mark = i === c.culprit ? '  <-- culprit' : '';
  console.log(`${i}. ${s.name.padEnd(18)} ${s.hat.padEnd(9)} ${s.coat.padEnd(6)} ${s.location.padEnd(14)} ${s.item}${mark}`);
});
console.log();

if (!pool) {
  const counts = narrowing(c.suspects, c.clues);
  c.clues.forEach((clue, k) => console.log(`${k + 1}. ${describeClue(clue)}  (${counts[k + 1]} left)`));
} else {
  console.log(`Pool (${c.clues.length} cards, par ${c.par}), in card order:`);
  c.clues.forEach((clue, k) => {
    const out = c.suspects.length - popcount(survivorMask(c.suspects, clue));
    console.log(`${String(k).padStart(2)}. ${describeClue(clue).padEnd(78)} rules out ${out}`);
  });
  console.log('\nPublic view (what a client sees):');
  console.log(JSON.stringify(publicView(c), null, 2));
}
