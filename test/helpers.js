// Hand-built roster used by the semantics tests. Lineup order = array order.
//
//   0 Ann    fedora  red   docks    cane
//   1 Bob    fedora  grey  docks    umbrella
//   2 Cy     beret   red   casino   cane
//   3 Dee    beret   tan   casino   cigar
//   4 Eve    cap     tan   alley    umbrella
export const roster = [
  { name: 'Ann', hat: 'fedora', coat: 'red', location: 'docks', item: 'cane' },
  { name: 'Bob', hat: 'fedora', coat: 'grey', location: 'docks', item: 'umbrella' },
  { name: 'Cy', hat: 'beret', coat: 'red', location: 'casino', item: 'cane' },
  { name: 'Dee', hat: 'beret', coat: 'tan', location: 'casino', item: 'cigar' },
  { name: 'Eve', hat: 'cap', coat: 'tan', location: 'alley', item: 'umbrella' },
];

export const attr = (a, value, negate = false) => ({ type: 'attr', attr: a, value, negate });
export const rel = (relation, a, value, negate = false) => ({ type: 'rel', relation, attr: a, value, negate });
