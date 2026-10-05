// Hash router. Relative-URL friendly (works from a GitHub Pages subpath).

/** "#/play/quickmath?deck=italian" → { name:'play', id:'quickmath', params:['quickmath'], query:{deck:'italian'} } */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { name: segs[0] || 'home', params: segs.slice(1), id: segs[1] ?? null, query };
}

export const navigate = (hash) => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
};

/**
 * routes: { name: (outlet, route) => cleanupFn | void }. Unknown names fall back to `home`.
 * onRoute(route) runs before each render (used to toggle nav chrome).
 */
export function startRouter({ routes, outlet, onRoute }) {
  let cleanup = null;
  function render() {
    const route = parseHash(location.hash);
    if (!routes[route.name]) route.name = 'home';
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    outlet.replaceChildren();
    onRoute?.(route);
    cleanup = routes[route.name](outlet, route);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  render();
  return () => {
    window.removeEventListener('hashchange', render);
    if (typeof cleanup === 'function') cleanup();
  };
}
