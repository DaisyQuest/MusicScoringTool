import { describe, expect, it } from 'vitest';

import { defaultBindings, renderDesktopShellHtml } from './index.js';

describe('@scorecraft/ui', () => {
  it('exposes default keyboard bindings', () => {
    expect(defaultBindings).toEqual([
      { commandId: 'insertNote', key: 'N' },
      { commandId: 'transpose', key: 'T' },
    ]);
  });

  it('renders polished html with escaped values and full score preview controls', () => {
    const html = renderDesktopShellHtml({
      title: 'Suite <One>',
      modeLabel: 'note-input',
      transportLabel: 'Playing @ tick 960',
      projectLabel: 'project.scorecraft.json',
      statusTone: 'dirty',
      stats: [
        { label: 'Total Notes', value: '24' },
        { label: 'Last Pitch', value: 'C#5 & friends' },
      ],
      notifications: [
        { level: 'success', message: 'Autosave complete' },
        { level: 'error', message: 'Disk "A" unavailable' },
        { level: 'info', message: 'Press Cmd+K for commands' },
      ],
      scorePreview: {
        clef: 'treble',
        measures: [
          { number: 1, notes: ['C4', 'E4'], isSelected: true },
          { number: 2, notes: [], isSelected: false },
        ],
      },
      engraving: { tempoBpm: 120, repeatStart: false, repeatEnd: false, dynamics: 'mf' },
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Suite &lt;One&gt;');
    expect(html).toContain('C#5 &amp; friends');
    expect(html).toContain('class="notification success"');
    expect(html).toContain('class="notification error"');
    expect(html).toContain('class="notification info"');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('data-transport-action="toggle-playback"');
    expect(html).toContain('id="insert-note"');
    expect(html).toContain('id="add-measure"');
    expect(html).toContain('id="apply-engraving"');
    expect(html).toContain('/api/transport');
    expect(html).toContain('/api/measures');
    expect(html).toContain('/api/engraving');
    expect(html).toContain('/api/notes');
    expect(html).toContain('Sheet music preview');
    expect(html).toContain('data-measure="1"');
    expect(html).toContain('data-measure="2"');
    expect(html).toContain('measure selected');
  });

  it('renders empty states and no-measure score-preview fallback', () => {
    const html = renderDesktopShellHtml({
      title: 'Empty',
      modeLabel: 'select',
      transportLabel: 'Stopped @ tick 0',
      projectLabel: 'unsaved project',
      statusTone: 'stable',
      stats: [],
      notifications: [],
      scorePreview: { clef: 'bass', measures: [] },
      engraving: { tempoBpm: 112, repeatStart: true, repeatEnd: false, dynamics: 'p' },
    });

    expect(html).toContain('No score metrics yet. Start entering notes to populate analytics.');
    expect(html).toContain('No notifications.');
    expect(html).toContain('All changes saved');
    expect(html).toContain('No measures available.');
    expect(html).toContain('value="112"');
    expect(html).toContain('id="repeat-start" type="checkbox" checked');
  });

  it('renders all measures across multiple systems for large scores', () => {
    const measures = Array.from({ length: 20 }, (_, index) => ({
      number: index + 1,
      notes: index % 2 === 0 ? ['C4'] : ['D4'],
      isSelected: index === 19,
    }));

    const html = renderDesktopShellHtml({
      title: 'Long Form',
      modeLabel: 'select',
      transportLabel: 'Stopped @ tick 0',
      projectLabel: 'long.scorecraft.json',
      statusTone: 'stable',
      stats: [],
      notifications: [],
      scorePreview: { clef: 'treble', measures },
      engraving: { tempoBpm: 120, repeatStart: false, repeatEnd: false, dynamics: 'mf' },
    });

    expect(html.match(/data-measure="/g)?.length).toBe(20);
    expect(html).toContain('20 measures');
    expect(html).toContain('System 5 showing measures 17-20');
  });
});
