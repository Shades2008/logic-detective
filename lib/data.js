// Static game data: traits, names, and difficulty levels.

export const ATTRS = ['hat', 'coat', 'location', 'item'];

// Per-case, each attribute draws a random subset of its pool (see LEVELS.valuesPerAttr)
// so suspects overlap and a single clue rarely identifies anyone.
export const VALUE_POOLS = {
  hat: ['fedora', 'bowler', 'flat cap', 'top hat', 'beret', 'homburg', 'trilby'],
  coat: ['black', 'grey', 'tan', 'red', 'green', 'navy', 'white'],
  location: ['docks', 'jazz club', 'train station', 'casino', 'rooftop', 'alley', 'pier'],
  item: ['briefcase', 'umbrella', 'cigar', 'pocket watch', 'newspaper', 'violin case', 'cane'],
};

export const FIRST_NAMES = [
  'Vincent', 'Dolores', 'Mickey', 'Lola', 'Frankie', 'Velma',
  'Jack', 'Ruby', 'Eddie', 'Gloria', 'Walt', 'Irene',
];
export const LAST_NAMES = [
  'Kessler', 'Duval', 'Mercer', 'Voss', 'Calloway', 'Pryce',
  'Okafor', 'Brandt', 'Fontaine', 'Lindqvist', 'Maddox', 'Santoro',
];

// Clue classes: what a level is allowed to hand out.
//   direct         "The culprit wore a fedora."
//   negative       "The culprit was not carrying a cane."
//   relational     "The culprit stood next to someone in a red coat."
//   (a negated relational clue needs both `negative` and `relational`)
export const CLUE_KINDS = ['direct', 'negative', 'relational'];

const ALL_KINDS = CLUE_KINDS;

// minClues: a case shorter than this is too trivial to be a puzzle and is
// regenerated. The generator also steers towards it while choosing clues.
export const LEVELS = [
  { level: 1, suspects: 5, valuesPerAttr: 4, kinds: ['direct'], minClues: 2 },
  { level: 2, suspects: 6, valuesPerAttr: 4, kinds: ['direct', 'negative'], minClues: 3 },
  { level: 3, suspects: 7, valuesPerAttr: 5, kinds: ALL_KINDS, minClues: 4 },
  { level: 4, suspects: 8, valuesPerAttr: 5, kinds: ALL_KINDS, minClues: 5 },
];

export function getLevel(level) {
  const config = LEVELS[level - 1];
  if (!config) throw new RangeError(`Unknown level: ${level} (valid: 1-${LEVELS.length})`);
  return config;
}
