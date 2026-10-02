// Tiny DOM builder. Strings become text nodes and the `text` prop sets
// textContent, so player-supplied text is never parsed as HTML. The `html`
// prop is for fixed art strings from art.js only; names must never go there.
//
// createH(doc) takes the document so tests can pass a fake and check exactly
// what was written.

const isNode = (x) => x !== null && typeof x === 'object' && typeof x.nodeType === 'number';

export function createH(doc) {
  return function h(tag, props = {}, ...kids) {
    const el = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value; // fixed art strings only
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(isNode(kid) ? kid : doc.createTextNode(String(kid)));
    }
    return el;
  };
}

// Bound to the page's document the first time it is used.
export const h = (...args) => createH(globalThis.document)(...args);
