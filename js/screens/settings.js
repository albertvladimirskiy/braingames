import { h, fill, toast } from '../core/ui.js';
import { APP_NAME, VERSION } from '../config.js';
import { benchmarkNote } from '../core/benchmarks.js';
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


function syncCard(services) {
  const { sync, storage } = services;
  const box = h('section', { class: 'card stack-sm', id: 'sync-card' });
  const urlIn = h('input', { type: 'text', id: 'sync-url', placeholder: 'https://your-server.example or http://localhost:8787', 'aria-label': 'Server URL', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  const nameIn = h('input', { type: 'text', id: 'sync-name', placeholder: 'Display name (optional)', 'aria-label': 'Display name for the leaderboard', maxlength: '20', autocomplete: 'off' });
  const codeIn = h('input', { type: 'text', id: 'sync-code', placeholder: 'Paste a link code from another device', 'aria-label': 'Link code', autocomplete: 'off', spellcheck: 'false' });
  const say = h('p', { class: 'muted', id: 'sync-status', role: 'status', 'aria-live': 'polite' });
  const run = async (fn, okMsg) => {
    say.textContent = 'Working…';
    try {
      await fn();
      say.textContent = okMsg;
    } catch (err) {
      say.textContent = err.message;
    }
    draw();
  };

  function draw() {
    const cfg = storage.get().settings.sync;
    const intro = h('p', { class: 'muted' }, 'Optional and off by default. Nothing leaves this device until you connect a server you trust (see docs/BACKEND_PLAN.md). Connecting uploads your progress and Daily answers there; the server re-checks Daily scores.');
    if (!cfg) {
      fill(box, h('h2', null, 'Sync & leaderboard'), intro, urlIn, nameIn,
        h('button', { class: 'btn', type: 'button', id: 'sync-connect', onClick: () => run(() => sync.connect(urlIn.value, nameIn.value), 'Connected and synced.') }, 'Connect'),
        h('details', null, h('summary', null, 'Link this device to another one'), h('div', { class: 'stack-sm' }, codeIn,
          h('button', { class: 'btn', type: 'button', id: 'sync-link', onClick: () => run(() => sync.connectWithCode(codeIn.value, nameIn.value), 'Linked and synced.') }, 'Link with code'))),
        say);
      return;
    }
    const st = sync.status;
    fill(box, h('h2', null, 'Sync & leaderboard'), intro,
      h('div', { class: 'kv' }, h('span', null, 'Server'), h('strong', { class: 'break' }, cfg.url)),
      h('div', { class: 'kv' }, h('span', null, 'Status'), h('strong', null, st.state === 'error' ? `Error: ${st.message}` : st.message || 'Connected')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', type: 'button', id: 'sync-now', onClick: () => run(() => sync.syncNow().then((r) => { if (!r.ok) throw new Error(r.error); }), 'Synced.') }, 'Sync now'),
        h('button', { class: 'btn', type: 'button', id: 'sync-show-code', onClick: () => { codeOut.value = sync.linkCode(); codeOut.hidden = false; codeOut.select(); } }, 'Show link code'),
        h('button', { class: 'btn btn-danger', type: 'button', id: 'sync-disconnect', onClick: () => { sync.disconnect(); say.textContent = 'Disconnected. Local data was kept.'; draw(); } }, 'Disconnect')),
      codeOut,
      h('p', { class: 'muted small' }, 'A link code lets another device use the same anonymous identity. Treat it like a password.'),
      say);
  }
  const codeOut = h('input', { type: 'text', id: 'sync-code-out', readonly: true, hidden: true, 'aria-label': 'Your link code' });
  draw();
  return box;
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
              toast(err.message.startsWith('Save is from a newer') ? err.message : 'That text is not a valid backup export.', { title: 'Import failed' });
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
      syncCard(services),
      h('div', { class: 'card' },
        h('h2', null, 'About'),
        h('p', null, `${APP_NAME} v${VERSION}. Short games for practicing mental skills.`),
        h('p', { class: 'muted' }, benchmarkNote()),
      ),
    ),
  );
}
