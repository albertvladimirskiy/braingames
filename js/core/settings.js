// Applies persisted settings to the document and the sensory services.
export function resolveTheme(setting) {
  if (setting === 'light' || setting === 'dark') return setting;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveReducedMotion(setting) {
  if (setting === 'reduce') return true;
  if (setting === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applySettings(settings, { audio, haptics, juice }) {
  const root = document.documentElement;
  const theme = resolveTheme(settings.theme);
  root.dataset.theme = theme;
  const reduced = resolveReducedMotion(settings.motion);
  root.dataset.motion = reduced ? 'reduced' : 'full';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5fa' : '#0d0e13');
  audio.setMuted(!settings.sound);
  haptics.setEnabled(settings.haptics);
  juice.setReduced(reduced);
}
