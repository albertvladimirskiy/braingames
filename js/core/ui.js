// Tiny DOM helpers. h('button', {class:'btn', onClick: fn}, 'Label')
const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  return append(el, children);
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  return append(el, children);
}

/** Replace el's children with `children` (null/false skipped, strings become text), unlike raw replaceChildren. */
export function fill(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export const clear = (el) => {
  el.replaceChildren();
  return el;
};

/** Politely announce text to screen readers via the #live region. */
export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  // re-set on next frame so identical consecutive messages are re-announced
  requestAnimationFrame(() => (live.textContent = text));
}

/** Short non-blocking message (achievements, import results). Also announced. */
export function toast(message, { title, duration = 3200 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: 'toast' }, title && h('strong', null, title), h('span', null, message));
  host.append(el);
  setTimeout(() => el.remove(), duration);
}
