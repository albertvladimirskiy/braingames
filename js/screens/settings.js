import { h, toast } from '../core/ui.js';
import { APP_NAME, VERSION, PLACEHOLDER_NOTE } from '../config.js';
import { applySettings } from '../core/settings.js';

function toggle(label, id, checked, onChange) {
  return h('label', { class: 'field', for: id },
    h('span', null, label),
    h('input', { type: 'checkbox', id, class: 'switch', checked, onChange: (e) => onChange(e.target.checked) }),
  );
}

function select(label, id, value, options, onChange) {
  return h('label', { class: 'field', for: id },
    h('span', null, label),
    h('select', { id, onChange: (e) => onChange(e.target.value) },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))),
  );
}

export function renderSettings(outlet, services) {
  const { storage } = services;
  const set = (key, value) => {
    storage.update((s) => (s.settings[key] = value));
    applySettings(storage.get().settings, services);
  };
  const s = storage.get().settings;

  const area = h('textarea', { id: 'data-area', 'aria-label': 'Export or import data (JSON)', spellcheck: 'false', placeholder: 'Exported JSON appears here. Paste a backup here to import it.' });
  const download = () => {
    const blob = new Blob([storage.exportJson()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${APP_NAME.toLowerCase()}-backup.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  outlet.append(
    h('div', { class: 'stack' },
      h('h1', null, 'Settings'),
      h('div', { class: 'card' },
        toggle('Sound effects', 'set-sound', s.sound, (v) => set('sound', v)),
        toggle('Haptics (vibration)', 'set-haptics', s.haptics, (v) => set('haptics', v)),
        select('Theme', 'set-theme', s.theme, [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']], (v) => set('theme', v)),
        select('Motion', 'set-motion', s.motion, [['system', 'Follow system'], ['reduce', 'Reduce motion'], ['full', 'Allow all motion']], (v) => set('motion', v)),
      ),
      h('div', { class: 'card stack-sm' },
        h('h2', null, 'Your data'),
        h('p', { class: 'muted' }, 'Everything is stored on this device only. Export a backup, or import one to restore it.'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', type: 'button', onClick: () => (area.value = storage.exportJson()) }, 'Show export'),
          h('button', { class: 'btn', type: 'button', onClick: download }, 'Download file'),
        ),
        area,
        h('button', {
          class: 'btn', type: 'button',
          onClick() {
            try {
              storage.importJson(area.value);
              applySettings(storage.get().settings, services);
              toast('Data imported.', { title: 'Import' });
            } catch (err) {
              toast(`That is not a valid backup (${err.message}).`, { title: 'Import failed' });
            }
          },
        }, 'Import from box'),
        h('button', {
          class: 'btn btn-danger', type: 'button',
          onClick() {
            if (confirm('Erase all ratings, history, streaks and settings on this device?')) {
              storage.reset();
              applySettings(storage.get().settings, services);
              area.value = '';
              toast('All data erased.', { title: 'Reset' });
            }
          },
        }, 'Reset all data'),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'About'),
        h('p', null, `${APP_NAME} v${VERSION}. Short games for practicing mental skills.`),
        h('p', { class: 'muted' }, PLACEHOLDER_NOTE),
      ),
    ),
  );
}
