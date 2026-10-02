// Clue JSON -> plain English for the player.
//
// The wording is deliberately roster-independent: it says what is true of the
// culprit without hinting at where they stand in the lineup.
//
//   "next to" always means the suspect directly left or right in the lineup
//   "same place" means another suspect with the same location as the culprit
//
// Negated relational clues are also true when nobody qualifies (for example, a
// culprit standing alone at their location has no one else there to be
// wearing a fedora), which the How to Play panel calls out.

import { ATTRS } from './data.js';

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// The trait, as a phrase that follows "was" / "someone".
function phrase(attr, value) {
  switch (attr) {
    case 'hat': return `wearing ${article(value)} ${value}`;
    case 'coat': return `wearing ${article(value)} ${value} coat`;
    case 'location': return `at the ${value}`;
    case 'item': return `carrying ${article(value)} ${value}`;
    default: throw new TypeError(`Unknown attribute: ${attr}`);
  }
}

export function clueToText(clue) {
  if (!ATTRS.includes(clue.attr)) throw new TypeError(`Unknown attribute: ${clue.attr}`);
  const what = phrase(clue.attr, clue.value);
  const negate = clue.negate === true;

  if (clue.type === 'attr') {
    const lead = clue.attr === 'location' ? 'That night, the culprit was' : 'The culprit was';
    return `${lead} ${negate ? 'not ' : ''}${what}.`;
  }
  if (clue.type === 'rel' && clue.relation === 'nextTo') {
    return negate
      ? `Neither of the culprit's neighbors in the lineup (directly left or right) was ${what}.`
      : `At least one of the culprit's neighbors in the lineup (directly left or right) was ${what}.`;
  }
  if (clue.type === 'rel' && clue.relation === 'sameLocation') {
    return negate
      ? `No other suspect at the culprit's location was ${what}.`
      : `Another suspect at the culprit's location was ${what}.`;
  }
  throw new TypeError(`Unknown clue: ${clue.type}/${clue.relation}`);
}
