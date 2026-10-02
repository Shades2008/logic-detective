// Clue data model, evaluation, enumeration and wording.
//
// A clue is plain JSON so it can cross the API unchanged:
//   { type: 'attr', attr, value, negate }
//   { type: 'rel',  relation, attr, value, negate }
//
// Every clue is a statement about the culprit, evaluated against the public
// roster. `holds(clue, suspects, i)` answers: "if suspect i were the culprit,
// would this clue be true?" The roster order is the police lineup, so
// suspect i's neighbours are i-1 and i+1.
//
// Semantics (the solver and the generator share these, tests pin them down):
//   attr, !negate      suspects[i][attr] === value
//   attr,  negate      suspects[i][attr] !== value
//   rel,  !negate      SOME other suspect j related to i has suspects[j][attr] === value
//   rel,   negate      NO other suspect j related to i has suspects[j][attr] === value
// where "related" is: nextTo = lineup neighbour, sameLocation = same location.
// A suspect is never related to themselves.

import { ATTRS } from './data.js';

export const RELATIONS = ['nextTo', 'sameLocation'];

export function holds(clue, suspects, i) {
  if (!ATTRS.includes(clue.attr)) throw new TypeError(`Unknown attribute: ${clue.attr}`);
  const negate = clue.negate === true;
  if (clue.type === 'attr') {
    return (suspects[i][clue.attr] === clue.value) !== negate;
  }
  if (clue.type === 'rel') {
    let related;
    if (clue.relation === 'nextTo') {
      related = [i - 1, i + 1].filter((j) => j >= 0 && j < suspects.length);
    } else if (clue.relation === 'sameLocation') {
      related = suspects.flatMap((s, j) => (j !== i && s.location === suspects[i].location ? [j] : []));
    } else {
      throw new TypeError(`Unknown relation: ${clue.relation}`);
    }
    return related.some((j) => suspects[j][clue.attr] === clue.value) !== negate;
  }
  throw new TypeError(`Unknown clue type: ${clue.type}`);
}

// 'direct' | 'negative' | 'relational' | 'negativeRelational'
export function clueClass(clue) {
  if (clue.type === 'attr') return clue.negate ? 'negative' : 'direct';
  return clue.negate ? 'negativeRelational' : 'relational';
}

// Which clue classes a level's `kinds` list permits.
export function allowedClasses(kinds) {
  const classes = [];
  if (kinds.includes('direct')) classes.push('direct');
  if (kinds.includes('negative')) classes.push('negative');
  if (kinds.includes('relational')) classes.push('relational');
  if (kinds.includes('negative') && kinds.includes('relational')) classes.push('negativeRelational');
  return classes;
}

// Every clue of an allowed class that is TRUE of the culprit, grouped by class.
// Values come from the roster itself, so no clue mentions a trait nobody has.
export function trueCluePool(suspects, culprit, kinds) {
  const allowed = new Set(allowedClasses(kinds));
  const pool = {};
  for (const cls of allowed) pool[cls] = [];

  const consider = (clue) => {
    const cls = clueClass(clue);
    if (allowed.has(cls) && holds(clue, suspects, culprit)) pool[cls].push(clue);
  };

  for (const attr of ATTRS) {
    const values = [...new Set(suspects.map((s) => s[attr]))];
    for (const value of values) {
      for (const negate of [false, true]) {
        consider({ type: 'attr', attr, value, negate });
        for (const relation of RELATIONS) {
          // "same place as someone at <place>" is just a roundabout location clue.
          if (relation === 'sameLocation' && attr === 'location') continue;
          consider({ type: 'rel', relation, attr, value, negate });
        }
      }
    }
  }
  return pool;
}

// ---- wording -------------------------------------------------------------

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function phrase(attr, value) {
  switch (attr) {
    case 'hat': return `wearing ${article(value)} ${value}`;
    case 'coat': return `in ${article(value)} ${value} coat`;
    case 'location': return `at the ${value}`;
    case 'item': return `carrying ${article(value)} ${value}`;
    default: throw new TypeError(`Unknown attribute: ${attr}`);
  }
}

export function describeClue(clue) {
  const what = phrase(clue.attr, clue.value);
  if (clue.type === 'attr') {
    return `The culprit was ${clue.negate ? 'not ' : ''}${what}.`;
  }
  if (clue.relation === 'nextTo') {
    return clue.negate
      ? `The culprit was not standing next to anyone ${what}.`
      : `The culprit was standing next to someone ${what}.`;
  }
  return clue.negate
    ? `The culprit was not at the same place as anyone ${what}.`
    : `The culprit was at the same place as someone ${what}.`;
}
