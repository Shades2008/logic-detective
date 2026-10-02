// Flat-colour suspect art: inline SVG figures plus emoji. No image assets.
// Everything interpolated here comes from the fixed trait lists in lib/data.js.

export const COAT_COLORS = {
  black: '#23262d',
  grey: '#8b9099',
  tan: '#c3a574',
  red: '#a8413a',
  green: '#40694f',
  navy: '#2d3f6c',
  white: '#e7e4db',
};

const HAT_FILL = '#3a4050';
const HAT_BAND = '#b08d4a';

// Each hat is drawn in a 48x56 box above the head (head centre 24,17).
const HATS = {
  fedora: `<ellipse cx="24" cy="11" rx="16" ry="3.6" fill="${HAT_FILL}"/><path d="M13 11 Q13 2 24 2 Q35 2 35 11Z" fill="${HAT_FILL}"/><rect x="13" y="7.6" width="22" height="2.6" fill="${HAT_BAND}"/>`,
  trilby: `<ellipse cx="24" cy="11" rx="13" ry="3" fill="${HAT_FILL}"/><path d="M15 11 Q15 4 24 4 Q33 4 33 11Z" fill="${HAT_FILL}"/><rect x="15" y="8" width="18" height="2.2" fill="${HAT_BAND}"/>`,
  bowler: `<ellipse cx="24" cy="12" rx="15" ry="2.6" fill="${HAT_FILL}"/><path d="M12 12 Q12 1 24 1 Q36 1 36 12Z" fill="${HAT_FILL}"/><rect x="12" y="8.6" width="24" height="2.2" fill="${HAT_BAND}"/>`,
  'top hat': `<ellipse cx="24" cy="12.5" rx="15" ry="3" fill="${HAT_FILL}"/><rect x="16" y="0.5" width="16" height="12" rx="1" fill="${HAT_FILL}"/><rect x="16" y="8" width="16" height="2.6" fill="${HAT_BAND}"/>`,
  'flat cap': `<path d="M11 12 Q13 4 26 4 Q37 4 38 11 L37 12.5 L11 12.5Z" fill="${HAT_FILL}"/><path d="M11 12.5 L2 14 Q6 10.5 11 10.5Z" fill="${HAT_FILL}"/>`,
  beret: `<ellipse cx="24" cy="7.5" rx="14" ry="6" transform="rotate(-10 24 7.5)" fill="${HAT_FILL}"/><circle cx="24" cy="2" r="1.8" fill="${HAT_FILL}"/>`,
  homburg: `<ellipse cx="24" cy="11" rx="15" ry="3.2" fill="${HAT_FILL}"/><path d="M14 11 Q14 3 20 3 L24 5.5 L28 3 Q34 3 34 11Z" fill="${HAT_FILL}"/><rect x="14" y="8" width="20" height="2.4" fill="${HAT_BAND}"/>`,
};

// A small figure: hat, head, coat in the suspect's coat colour.
export function figureSvg({ hat, coat }) {
  const coatFill = COAT_COLORS[coat] ?? '#777';
  return `<svg viewBox="0 0 48 56" aria-hidden="true" focusable="false">
    <path d="M5 56 L9 31 Q24 22 39 31 L43 56Z" fill="${coatFill}"/>
    <path d="M24 27 L18.5 56 M24 27 L29.5 56" stroke="rgba(0,0,0,.4)" stroke-width="1.6" fill="none"/>
    <circle cx="24" cy="19" r="8" fill="#cbb79b"/>
    ${HATS[hat] ?? ''}
  </svg>`;
}

export const LOCATION_ICONS = {
  docks: '⚓',
  'jazz club': '🎷',
  'train station': '🚉',
  casino: '🎰',
  rooftop: '🌆',
  alley: '🚪',
  pier: '🌊',
};

export const ITEM_ICONS = {
  briefcase: '💼',
  umbrella: '☂️',
  cigar: '🚬',
  'pocket watch': '⏱️',
  newspaper: '📰',
  'violin case': '🎻',
  cane: '🦯',
};

export const TRAIT_ICONS = { hat: '🎩', coat: '🧥' };

export const CARD_ICONS = {
  Hat: '🎩',
  Coat: '🧥',
  Location: '📍',
  Item: '🎒',
  Neighbors: '↔️',
  'Same place': '📌',
};
