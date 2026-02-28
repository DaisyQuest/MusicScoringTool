export interface KeyboardCommandBinding {
  commandId: string;
  key: string;
}

export interface UiStat {
  label: string;
  value: string;
}

export type UiNotificationLevel = 'success' | 'error' | 'info';

export interface UiNotification {
  level: UiNotificationLevel;
  message: string;
}

export interface DesktopShellUiModel {
  title: string;
  modeLabel: string;
  transportLabel: string;
  projectLabel: string;
  statusTone: 'stable' | 'dirty';
  stats: UiStat[];
  notifications: UiNotification[];
  scorePreview: {
    clef: string;
    measures: Array<{
      number: number;
      notes: string[];
      isSelected: boolean;
    }>;
  };
  engraving: {
    tempoBpm: number;
    repeatStart: boolean;
    repeatEnd: boolean;
    articulation: 'none' | 'accent' | 'staccato' | 'tenuto';
    dynamics: 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
    chordSymbol: string;
    navigationMarker?: 'DC' | 'DS' | 'Fine' | 'Coda';
  };
  entryIntent?: {
    duration: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
    accidental: 'flat' | 'natural' | 'sharp';
    dot: boolean;
    tie: boolean;
    chordMode: boolean;
  };
  densityPreset?: 'compact' | 'default';
}

export const defaultBindings: KeyboardCommandBinding[] = [
  { commandId: 'insertNote', key: 'N' },
  { commandId: 'transpose', key: 'T' },
];

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const notificationClass = (level: UiNotificationLevel): string => {
  switch (level) {
    case 'success':
      return 'notification success';
    case 'error':
      return 'notification error';
    default:
      return 'notification info';
  }
};

const renderStats = (stats: UiStat[]): string => {
  if (!stats.length) {
    return '<p class="empty-state">No score metrics yet. Start entering notes to populate analytics.</p>';
  }

  return `<dl class="stats-grid">${stats
    .map((stat) => `<div class="stat-card"><dt>${escapeHtml(stat.label)}</dt><dd>${escapeHtml(stat.value)}</dd></div>`)
    .join('')}</dl>`;
};

const renderNotifications = (notifications: UiNotification[]): string => {
  if (!notifications.length) {
    return '<p class="empty-state">No notifications.</p>';
  }

  return `<ul class="notification-list">${notifications
    .map((notification) => `<li class="${notificationClass(notification.level)}">${escapeHtml(notification.message)}</li>`)
    .join('')}</ul>`;
};

const STEP_OFFSETS: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', number> = { C: 6, D: 5, E: 4, F: 3, G: 2, A: 1, B: 0 };

const noteToY = (note: string): number => {
  const match = /^([A-G])([0-9])$/.exec(note);
  if (!match) {
    return 74;
  }
  const [, stepRaw, octaveRaw] = match;
  const step = stepRaw as keyof typeof STEP_OFFSETS;
  const octave = Number(octaveRaw);
  const diatonic = octave * 7 + STEP_OFFSETS[step];
  const e4 = 4 * 7 + STEP_OFFSETS.E;
  return 74 - (diatonic - e4) * 6;
};

const renderMeasure = (
  measure: DesktopShellUiModel['scorePreview']['measures'][number],
  index: number,
): string => {
  const width = 228;
  const xBase = 24 + (index % 4) * width;
  const localIndex = index % 4;
  const safeNotes = measure.notes.map((note) => escapeHtml(note));
  const notesMarkup = safeNotes
    .slice(0, 4)
    .map((note, noteIndex) => {
      const x = xBase + 64 + noteIndex * 34;
      const y = noteToY(note);
      return `<g class="staff-note" aria-label="${note}"><ellipse cx="${x}" cy="${y}" rx="8" ry="6" /><line x1="${x + 8}" y1="${y}" x2="${x + 8}" y2="${y - 28}" /></g>`;
    })
    .join('');

  return `<g class="measure${measure.isSelected ? ' selected' : ''}" data-measure="${measure.number}"><rect x="${xBase}" y="32" width="${width - 10}" height="84" rx="10" class="measure-bg" /><line x1="${xBase}" y1="50" x2="${xBase + width - 10}" y2="50" /><line x1="${xBase}" y1="62" x2="${xBase + width - 10}" y2="62" /><line x1="${xBase}" y1="74" x2="${xBase + width - 10}" y2="74" /><line x1="${xBase}" y1="86" x2="${xBase + width - 10}" y2="86" /><line x1="${xBase}" y1="98" x2="${xBase + width - 10}" y2="98" />${localIndex === 0 ? '<text x="32" y="84" class="clef">𝄞</text>' : ''}<text x="${xBase + 12}" y="45" class="measure-label">M${measure.number}</text>${notesMarkup || `<text x="${xBase + 64}" y="74" class="placeholder-note">Rest</text>`}</g>`;
};

const renderScorePreview = (preview: DesktopShellUiModel['scorePreview']): string => {
  const safeClef = escapeHtml(preview.clef);
  if (!preview.measures.length) {
    return '<section><h2>Sheet music preview</h2><p class="empty-state">No measures available.</p></section>';
  }

  const systems = Array.from({ length: Math.ceil(preview.measures.length / 4) }, (_, systemIndex) => {
    const start = systemIndex * 4;
    const end = start + 4;
    const measures = preview.measures.slice(start, end);
    const systemMarkup = measures.map((measure, measureOffset) => renderMeasure(measure, measureOffset)).join('');
    return `<svg viewBox="0 0 940 140" class="staff-preview" role="img" aria-label="System ${systemIndex + 1} showing measures ${measures[0]!.number}-${measures.at(-1)!.number}"><g class="staff-lines">${systemMarkup}</g></svg>`;
  });

  return `<section><h2>Sheet music preview</h2><p class="subhead">${safeClef} clef · ${preview.measures.length} measure${preview.measures.length === 1 ? '' : 's'}</p><div class="score-preview-grid">${systems.join('')}</div></section>`;
};

const inferActiveMode = (modeLabel: string): 'select' | 'note-input' | 'text-lines' => {
  const normalized = modeLabel.trim().toLowerCase();
  if (normalized.includes('note')) {
    return 'note-input';
  }
  if (normalized.includes('text')) {
    return 'text-lines';
  }
  return 'select';
};

const playbackStatusTone = (transportLabel: string): 'active' | 'idle' =>
  transportLabel.toLowerCase().includes('playing') ? 'active' : 'idle';

export const renderDesktopShellHtml = (model: DesktopShellUiModel): string => {
  const activeMode = inferActiveMode(model.modeLabel);
  const playbackTone = playbackStatusTone(model.transportLabel);
  const intent = model.entryIntent ?? {
    duration: 'quarter',
    accidental: 'natural',
    dot: false,
    tie: false,
    chordMode: false,
  };
  const densityPreset = model.densityPreset ?? 'default';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(model.title)} · Scorecraft Desktop</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #09090f;
        --panel: #141422;
        --panel-strong: #1d2033;
        --text: #f6f7ff;
        --muted: #b1b7d9;
        --accent: #6ee7ff;
        --warning: #fbbf24;
        --success: #34d399;
        --error: #fb7185;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top right, #253369 0%, var(--bg) 55%); color: var(--text); padding: 1rem; }
      main { width: min(1280px, 100%); margin: 0 auto; background: color-mix(in oklab, var(--panel), black 20%); border: 1px solid #2f3452; border-radius: 20px; box-shadow: 0 30px 70px rgb(5 6 16 / 45%); overflow: hidden; }
      button, select, input { background: #141a30; color: var(--text); border: 1px solid #3a466f; border-radius: 10px; padding: 0.45rem 0.65rem; }
      button { cursor: pointer; }
      button:hover { border-color: var(--accent); }
      .top-shell { padding: 1rem 1.3rem; border-bottom: 1px solid #2f3452; background: linear-gradient(125deg, #202a4a, #1a1e34 45%, #141422); display: grid; gap: 0.75rem; }
      .command-region { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
      .command-region label { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--muted); font-size: 0.85rem; }
      .project-meta { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
      .mode-tabs { display: inline-flex; gap: 0.35rem; }
      .mode-tab.active { border-color: var(--accent); color: var(--accent); }
      .status-bar { display: flex; gap: 0.65rem; flex-wrap: wrap; }
      .status-chip { border-radius: 999px; padding: 0.2rem 0.6rem; border: 1px solid #374167; font-size: 0.8rem; color: var(--muted); }
      .status-chip.playback-active { color: var(--accent); border-color: var(--accent); }
      .status-chip.project-dirty { color: var(--warning); border-color: var(--warning); }
      .workspace { display: grid; grid-template-columns: 240px minmax(0, 1fr) 300px; gap: 1rem; padding: 1rem; }
      .panel { background: var(--panel-strong); border-radius: 14px; border: 1px solid #313755; padding: 0.9rem; }
      .left-rail ul { list-style: none; margin: 0.8rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
      .left-rail li { display: flex; justify-content: space-between; border: 1px solid #374167; border-radius: 10px; padding: 0.45rem 0.55rem; }
      .score-stage .entry-strip { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.7rem; }
      .entry-chip { border: 1px solid #374167; border-radius: 999px; padding: 0.2rem 0.5rem; color: var(--muted); }
      .entry-chip.active { border-color: var(--accent); color: var(--accent); }
      .inspector-grid { display: grid; gap: ${densityPreset === 'compact' ? '0.45rem' : '0.75rem'}; }
      .utility-flyout { margin-top: 0.8rem; border-top: 1px dashed #3a466f; padding-top: 0.8rem; }
      .transport-strip { border-top: 1px solid #2f3452; padding: 0.8rem 1.3rem 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
      .subhead { color: var(--muted); margin: 0.4rem 0 0; }
      h1 { margin: 0.4rem 0 0; font-size: clamp(1.1rem, 2.3vw, 1.6rem); }
      h2 { margin: 0; font-size: 0.86rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
      .project-status { margin: 0.4rem 0 0; color: ${model.statusTone === 'dirty' ? 'var(--warning)' : 'var(--success)'}; font-weight: 600; }
      .stats-grid { margin: 0.7rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.55rem; }
      .stat-card { background: #171d35; border: 1px solid #374167; border-radius: 12px; padding: 0.65rem; }
      .stat-card dt { font-size: 0.74rem; color: var(--muted); margin-bottom: 0.3rem; }
      .stat-card dd { margin: 0; font-size: 1.1rem; font-weight: 700; }
      .notification-list { list-style: none; margin: 0.7rem 0 0; padding: 0; display: grid; gap: 0.45rem; }
      .notification { border-radius: 10px; padding: 0.65rem 0.75rem; border: 1px solid transparent; }
      .notification.info { background: rgb(96 165 250 / 16%); border-color: rgb(125 211 252 / 40%); }
      .notification.success { background: rgb(52 211 153 / 16%); border-color: rgb(167 243 208 / 40%); }
      .notification.error { background: rgb(251 113 133 / 16%); border-color: rgb(251 113 133 / 35%); }
      .score-preview-grid { display: grid; gap: 0.8rem; margin-top: 0.85rem; }
      .staff-preview { width: 100%; border-radius: 12px; border: 1px solid #374167; background: #171d35; }
      .staff-lines line, .staff-note line { stroke: #9ea8d6; stroke-width: 1.6; }
      .measure-bg { fill: rgb(15 20 35 / 50%); stroke: #35406a; stroke-width: 1; }
      .measure.selected .measure-bg { stroke: var(--accent); stroke-width: 2; }
      .staff-note ellipse { fill: #f6f7ff; }
      .clef { font-size: 45px; fill: #d9def8; }
      .measure-label { fill: var(--muted); font-size: 11px; }
      .placeholder-note { fill: var(--muted); }
      .empty-state { margin: 0.9rem 0 0; color: var(--muted); font-style: italic; }
      .getting-started { margin-top: 0.9rem; padding: 0.75rem; border-radius: 12px; background: rgb(110 231 255 / 8%); border: 1px solid rgb(110 231 255 / 22%); }
      .getting-started ol { margin: 0.4rem 0 0; padding-left: 1.1rem; color: var(--muted); display: grid; gap: 0.35rem; }
      .action-feedback { min-height: 1.35rem; margin: 0.7rem 0 0; color: var(--muted); font-size: 0.85rem; }
      kbd { border: 1px solid #4b5888; border-bottom-width: 2px; border-radius: 6px; padding: 0.05rem 0.35rem; font-size: 0.72rem; color: #d9def8; background: #0f1428; }
    </style>
  </head>
  <body>
    <main>
      <header class="top-shell">
        <div class="command-region" aria-label="Top command region">
          <button type="button" id="project-new">New</button><button type="button" id="project-open">Open</button><button type="button" id="project-save">Save</button>
          <button type="button" id="project-export-midi">Export MIDI</button>
          <button type="button" id="history-undo">Undo</button><button type="button" id="history-redo">Redo</button>
          <button type="button" data-hotkey="cmd+k">Command Palette <kbd>⌘K</kbd></button>
        </div>
        <div class="project-meta">
          <div>
            <h1>${escapeHtml(model.title)}</h1>
            <p class="subhead">${escapeHtml(model.projectLabel)}</p>
            <p class="project-status">${escapeHtml(model.statusTone === 'dirty' ? 'Unsaved changes' : 'All changes saved')}</p>
          </div>
          <div class="mode-tabs" role="tablist" aria-label="Editor mode">
            <button type="button" class="mode-tab ${activeMode === 'select' ? 'active' : ''}" data-hotkey="v">Select <kbd>V</kbd></button>
            <button type="button" class="mode-tab ${activeMode === 'note-input' ? 'active' : ''}" data-hotkey="n">Note Input <kbd>N</kbd></button>
            <button type="button" class="mode-tab ${activeMode === 'text-lines' ? 'active' : ''}" data-hotkey="t">Text & Symbols <kbd>T</kbd></button>
          </div>
        </div>
        <div class="status-bar" aria-label="Status confidence strip">
          <span class="status-chip playback-${playbackTone}">${escapeHtml(model.transportLabel)}</span>
          <span class="status-chip project-${model.statusTone}">${escapeHtml(model.modeLabel)}</span>
          <span class="status-chip">Autosave ${model.statusTone === 'dirty' ? 'pending' : 'synced'}</span>
        </div>
        <p class="subhead" aria-label="Keyboard shortcuts legend">Hotkeys: <kbd>Space</kbd> Play/Stop · <kbd>V</kbd> Select · <kbd>N</kbd> Note input · <kbd>T</kbd> Text & Symbols · <kbd>⌘K</kbd> Command palette</p>
      </header>

      <div class="workspace">
        <aside class="panel left-rail">
          <h2>Parts / staves</h2>
          <ul>
            <li><span>Piano RH</span><span>M/S</span></li>
            <li><span>Piano LH</span><span>M/S</span></li>
          </ul>
          <section>
            <h2>Live score metrics</h2>
            ${renderStats(model.stats)}
          </section>
        </aside>

        <section class="panel score-stage">
          <h2>Score stage</h2>
          <p class="subhead">Always-visible intent: duration ${intent.duration}, accidental ${intent.accidental}, dot ${intent.dot ? 'on' : 'off'}, tie ${intent.tie ? 'on' : 'off'}.</p>
          <section class="getting-started" aria-label="Getting started checklist">
            <h2>Quick start</h2>
            <ol>
              <li>Choose a note step, octave, and duration.</li>
              <li>Press <strong>Insert Note</strong> or use <kbd>N</kbd> then note hotkeys.</li>
              <li>Use <strong>Add Measure</strong> to continue writing.</li>
            </ol>
          </section>
          <div class="entry-strip" aria-label="Step entry intent toolbar">
            <span class="entry-chip active">Duration: ${intent.duration}</span>
            <span class="entry-chip">Accidental: ${intent.accidental}</span>
            <span class="entry-chip ${intent.dot ? 'active' : ''}">Dot</span>
            <span class="entry-chip ${intent.tie ? 'active' : ''}">Tie</span>
            <span class="entry-chip ${intent.chordMode ? 'active' : ''}">Chord mode</span>
          </div>
          <div class="command-region" aria-label="Score controls">
            <button type="button" data-transport-action="toggle-playback">Play / Stop <kbd>Space</kbd></button>
            <button type="button" data-transport-action="seek-start">Rewind</button>
            <label>Step
              <select id="note-step" aria-label="Note step"><option>C</option><option>D</option><option>E</option><option>F</option><option>G</option><option>A</option><option>B</option></select>
            </label>
            <label>Octave <input id="note-octave" type="number" min="0" max="8" value="4" aria-label="Note octave" /></label>
            <label>Duration
              <select id="note-duration" aria-label="Note duration"><option value="whole">whole</option><option value="half">half</option><option value="quarter" selected>quarter</option><option value="eighth">eighth</option><option value="16th">16th</option><option value="32nd">32nd</option><option value="64th">64th</option></select>
            </label>
            <label>Dots
              <select id="note-dots" aria-label="Note dots"><option value="0" selected>0</option><option value="1">1</option><option value="2">2</option></select>
            </label>
            <button type="button" id="insert-note">Insert Note</button>
            <button type="button" id="add-measure">Add Measure</button>
          </div>
          <p id="action-feedback" class="action-feedback" role="status" aria-live="polite">Tip: insert a note to hear immediate playback changes.</p>
          ${renderScorePreview(model.scorePreview)}
        </section>

        <aside class="panel right-inspector">
          <h2>Selection inspector (${densityPreset})</h2>
          <div class="inspector-grid">
            <label>Tempo <input id="tempo-bpm" type="number" min="20" max="320" value="${model.engraving.tempoBpm}" aria-label="Tempo BPM" /></label>
            <label><input id="repeat-start" type="checkbox" ${model.engraving.repeatStart ? 'checked' : ''} /> Repeat start</label>
            <label><input id="repeat-end" type="checkbox" ${model.engraving.repeatEnd ? 'checked' : ''} /> Repeat end</label>
            <label>Accent / articulation
              <select id="note-articulation" aria-label="Note articulation">
                <option value="none" ${model.engraving.articulation === 'none' ? 'selected' : ''}>none</option>
                <option value="accent" ${model.engraving.articulation === 'accent' ? 'selected' : ''}>accent</option>
                <option value="staccato" ${model.engraving.articulation === 'staccato' ? 'selected' : ''}>staccato</option>
                <option value="tenuto" ${model.engraving.articulation === 'tenuto' ? 'selected' : ''}>tenuto</option>
              </select>
            </label>
            <label>Dynamics
              <select id="note-dynamics" aria-label="Note dynamics">
                <option value="pp" ${model.engraving.dynamics === 'pp' ? 'selected' : ''}>pp</option>
                <option value="p" ${model.engraving.dynamics === 'p' ? 'selected' : ''}>p</option>
                <option value="mp" ${model.engraving.dynamics === 'mp' ? 'selected' : ''}>mp</option>
                <option value="mf" ${model.engraving.dynamics === 'mf' ? 'selected' : ''}>mf</option>
                <option value="f" ${model.engraving.dynamics === 'f' ? 'selected' : ''}>f</option>
                <option value="ff" ${model.engraving.dynamics === 'ff' ? 'selected' : ''}>ff</option>
              </select>
            </label>
            <label>Chord symbol <input id="text-chord-symbol" type="text" value="${escapeHtml(model.engraving.chordSymbol)}" aria-label="Chord symbol" placeholder="Cm7" /></label>
            <label>Navigation marker
              <select id="text-navigation-marker" aria-label="Navigation marker">
                <option value="">none</option>
                <option value="DC" ${model.engraving.navigationMarker === 'DC' ? 'selected' : ''}>DC</option>
                <option value="DS" ${model.engraving.navigationMarker === 'DS' ? 'selected' : ''}>DS</option>
                <option value="Fine" ${model.engraving.navigationMarker === 'Fine' ? 'selected' : ''}>Fine</option>
                <option value="Coda" ${model.engraving.navigationMarker === 'Coda' ? 'selected' : ''}>Coda</option>
              </select>
            </label>
            <button type="button" id="apply-engraving">Apply Engraving</button>
            <button type="button" id="apply-text-symbols">Apply Text & Symbols</button>
          </div>
          <div class="utility-flyout">
            <h2>Utility flyout</h2>
            <p class="subhead">Repeat/dynamics advanced editor appears here on demand.</p>
          </div>
          <section>
            <h2>Session notifications</h2>
            ${renderNotifications(model.notifications)}
          </section>
        </aside>
      </div>

      <footer class="transport-strip" aria-label="Bottom transport strip">
        <strong>Transport:</strong>
        <span>${escapeHtml(model.transportLabel)}</span>
        <span>Metronome: On</span>
        <span>Loop: Off</span>
        <span>Playback: ${playbackTone === 'active' ? 'Expressive' : 'Strict'}</span>
      </footer>
    </main>
    <script>
      const postJson = async (path, body) => {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Unknown request error.' }));
          throw new Error(payload.error || 'Request failed');
        }
      };

      const askPath = (label, fallbackPath) => {
        const value = window.prompt(label, fallbackPath);
        return value && value.trim() ? value.trim() : undefined;
      };

      const runAction = async (path, payload = {}) => {
        await postJson(path, payload);
        location.reload();
      };

      const showFeedback = (message) => {
        const feedback = document.getElementById('action-feedback');
        if (feedback) {
          feedback.textContent = message;
        }
      };

      for (const button of document.querySelectorAll('[data-hotkey]')) {
        button.addEventListener('click', async () => {
          try {
            await runAction('/api/hotkey', { hotkey: button.dataset.hotkey });
          } catch (error) {
            alert(error instanceof Error ? error.message : String(error));
          }
        });
      }

      for (const button of document.querySelectorAll('[data-transport-action]')) {
        button.addEventListener('click', async () => {
          try {
            await runAction('/api/transport', { action: button.dataset.transportAction });
          } catch (error) {
            alert(error instanceof Error ? error.message : String(error));
          }
        });
      }

      document.getElementById('insert-note')?.addEventListener('click', async () => {
        const step = document.getElementById('note-step')?.value;
        const octave = Number(document.getElementById('note-octave')?.value);
        const duration = document.getElementById('note-duration')?.value;
        const dots = Number(document.getElementById('note-dots')?.value);
        if (!Number.isFinite(octave) || octave < 0 || octave > 8) {
          showFeedback('Octave must be a number between 0 and 8.');
          return;
        }
        if (!Number.isFinite(dots) || dots < 0 || dots > 2) {
          showFeedback('Dots must be 0, 1, or 2.');
          return;
        }
        try {
          await runAction('/api/notes', { pitch: { step, octave }, duration, dots });
        } catch (error) {
          showFeedback(error instanceof Error ? error.message : String(error));
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('add-measure')?.addEventListener('click', async () => {
        try {
          await runAction('/api/measures', {});
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('apply-engraving')?.addEventListener('click', async () => {
        const tempoBpm = Number(document.getElementById('tempo-bpm')?.value);
        const repeatStart = Boolean(document.getElementById('repeat-start')?.checked);
        const repeatEnd = Boolean(document.getElementById('repeat-end')?.checked);
        const dynamics = document.getElementById('note-dynamics')?.value;
        const articulation = document.getElementById('note-articulation')?.value;

        try {
          await runAction('/api/engraving', { tempoBpm, repeatStart, repeatEnd, dynamics, articulation });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('apply-text-symbols')?.addEventListener('click', async () => {
        const chordSymbol = document.getElementById('text-chord-symbol')?.value ?? '';
        const navigationMarker = document.getElementById('text-navigation-marker')?.value || undefined;
        try {
          await runAction('/api/text-symbols', { chordSymbol, navigationMarker });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('project-new')?.addEventListener('click', async () => {
        try {
          await runAction('/api/project/new', {});
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('project-open')?.addEventListener('click', async () => {
        const path = askPath('Open score from path:', 'session.scorecraft.json');
        if (!path) return;
        try {
          await runAction('/api/project/load', { path });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('project-save')?.addEventListener('click', async () => {
        const path = askPath('Save score to path:', 'session.scorecraft.json');
        if (!path) return;
        try {
          await runAction('/api/project/save', { path });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('project-export-midi')?.addEventListener('click', async () => {
        const path = askPath('Export MIDI to path:', 'session.mid');
        if (!path) return;
        try {
          await runAction('/api/midi/export', { path });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('history-undo')?.addEventListener('click', async () => {
        try {
          await runAction('/api/history', { action: 'undo' });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.getElementById('history-redo')?.addEventListener('click', async () => {
        try {
          await runAction('/api/history', { action: 'redo' });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });

      document.addEventListener('keydown', async (event) => {
        if (event.defaultPrevented || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
          return;
        }

        const hotkey = event.code === 'Space' ? 'space' : event.key.toLowerCase();
        if (!['space', 'v', 'n', 't'].includes(hotkey)) {
          return;
        }

        event.preventDefault();
        try {
          await runAction('/api/hotkey', { hotkey });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      });
    </script>
  </body>
</html>`;
};
