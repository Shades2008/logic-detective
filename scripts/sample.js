// Print generated cases for eyeballing: npm run sample -- [level] [seed]
import { generateCase } from '../lib/generator.js';
import { describeClue } from '../lib/clues.js';
import { narrowing } from '../lib/solver.js';

const level = Number(process.argv[2] ?? 1);
const seed = process.argv[3];
const c = generateCase({ level, seed });
const counts = narrowing(c.suspects, c.clues);

console.log(`seed=${c.seed} level=${c.level} attempts=${c.attempt + 1}\n`);
c.suspects.forEach((s, i) => {
  const mark = i === c.culprit ? '  <-- culprit' : '';
  console.log(`${i}. ${s.name.padEnd(18)} ${s.hat.padEnd(9)} ${s.coat.padEnd(6)} ${s.location.padEnd(14)} ${s.item}${mark}`);
});
console.log();
c.clues.forEach((clue, k) => console.log(`${k + 1}. ${describeClue(clue)}  (${counts[k + 1]} left)`));
