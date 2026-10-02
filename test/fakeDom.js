// A minimal fake DOM for tests. It does NOT parse markup: anything written via
// innerHTML is recorded in `writes.innerHTML`, so a test can tell "rendered as
// text" (a text node holding the raw string) from "written as HTML".
export function createFakeDom() {
  const writes = { innerHTML: [] };

  class FakeNode {
    constructor(tag) { this.nodeType = 1; this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...kids) { this.children.push(...kids); }
    replaceChildren(...kids) { this.children = [...kids]; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    focus() { this.focused = true; }
    set className(v) { this.attrs.class = v; }
    get className() { return this.attrs.class ?? ''; }
    set textContent(v) { this.children = [{ nodeType: 3, text: String(v) }]; }
    get textContent() { return textOf(this); }
    set innerHTML(v) { writes.innerHTML.push(String(v)); this.children = [{ nodeType: 3, text: String(v) }]; }
  }

  const document = {
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => ({ nodeType: 3, text }),
  };

  function textOf(node) {
    if (node.nodeType === 3) return node.text;
    return node.children.map(textOf).join('');
  }
  function all(node, out = []) {
    if (node.nodeType === 1) { out.push(node); node.children.forEach((k) => all(k, out)); }
    return out;
  }
  const findAll = (node, pred) => all(node).filter(pred);
  const find = (node, pred) => findAll(node, pred)[0];
  const textNodes = (node) => {
    const out = [];
    (function walk(n) { if (n.nodeType === 3) out.push(n.text); else n.children.forEach(walk); })(node);
    return out;
  };

  return { document, writes, textOf, find, findAll, textNodes };
}
