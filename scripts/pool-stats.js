// Pool-mode tuning table: npm run stats -- [casesPerLevel]
import { generateCase } from '../lib/generator.js';
import { LEVELS } from '../lib/data.js';

const cases = Number(process.argv[2] ?? 1000);
console.log('level | suspects | pool | minClues | minPar | avg par | par histogram | par==minClues | par==minPar | avg attempts');
for (const cfg of LEVELS) {
  let par = 0, atClues = 0, atPar = 0, attempts = 0;
  const hist = {};
  for (let n = 0; n < cases; n++) {
    const c = generateCase({ seed: `stats-${cfg.level}-${n}`, level: cfg.level, mode: 'pool' });
    par += c.par;
    hist[c.par] = (hist[c.par] ?? 0) + 1;
    if (c.par === cfg.minClues) atClues++;
    if (c.par === cfg.minPar) atPar++;
    attempts += c.attempt + 1;
  }
  const pct = (x) => `${((100 * x) / cases).toFixed(0)}%`;
  console.log(
    `${cfg.level} | ${cfg.suspects} | ${cfg.poolSize} | ${cfg.minClues} | ${cfg.minPar} | ${(par / cases).toFixed(2)} | ` +
    `${JSON.stringify(hist)} | ${pct(atClues)} | ${pct(atPar)} | ${(attempts / cases).toFixed(2)}`,
  );
}
