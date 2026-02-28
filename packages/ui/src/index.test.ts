import { describe, expect, it } from 'vitest';

import { defaultBindings, renderDesktopShellHtml } from './index.js';

describe('@scorecraft/ui', () => {
  it('exposes default keyboard bindings', () => {
    expect(defaultBindings).toEqual([
      { commandId: 'insertNote', key: 'N' },
      { commandId: 'transpose', key: 'T' },
    ]);
  });

  it('renders escaped values and full shell regions for active playback', () => {
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
      engraving: { tempoBpm: 120, repeatStart: false, repeatEnd: false, articulation: 'accent', dynamics: 'mf', chordSymbol: 'G7', navigationMarker: 'DC' },
      entryIntent: { duration: 'eighth', accidental: 'sharp', dot: true, tie: true, chordMode: true },
      densityPreset: 'compact',
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Suite &lt;One&gt;');
    expect(html).toContain('C#5 &amp; friends');
    expect(html).toContain('Top command region');
    expect(html).toContain('Bottom transport strip');
    expect(html).toContain('Selection inspector (compact)');
    expect(html).toContain('Always-visible intent: duration eighth, accidental sharp, dot on, tie on.');
    expect(html).toContain('class="status-chip playback-active"');
    expect(html).toContain('class="mode-tab active" data-hotkey="n"');
    expect(html).toContain('Command Palette');
    expect(html).toContain('<kbd>⌘K</kbd>');
    expect(html).toContain('<kbd>Space</kbd>');
    expect(html).toContain('class="notification success"');
    expect(html).toContain('class="notification error"');
    expect(html).toContain('class="notification info"');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('data-transport-action="toggle-playback"');
    expect(html).toContain('id="insert-note"');
    expect(html).toContain('Insert Note');
    expect(html).toContain('id="note-duration"');
    expect(html).toContain('id="note-dots"');
    expect(html).toContain('Getting started checklist');
    expect(html).toContain('Quick start');
    expect(html).toContain('id="action-feedback"');
    expect(html).toContain('id="add-measure"');
    expect(html).toContain('id="apply-engraving"');
    expect(html).toContain('id="apply-text-symbols"');
    expect(html).toContain('id="note-articulation"');
    expect(html).toContain('id="text-chord-symbol"');
    expect(html).toContain('id="text-navigation-marker"');
    expect(html).toContain('id="project-new"');
    expect(html).toContain('id="project-open"');
    expect(html).toContain('id="project-save"');
    expect(html).toContain('id="project-export-midi"');
    expect(html).toContain('id="history-undo"');
    expect(html).toContain('id="history-redo"');
    expect(html).toContain('/api/transport');
    expect(html).toContain('/api/measures');
    expect(html).toContain('/api/engraving');
    expect(html).toContain('/api/notes');
    expect(html).toContain('/api/project/new');
    expect(html).toContain('/api/project/load');
    expect(html).toContain('/api/project/save');
    expect(html).toContain('/api/midi/export');
    expect(html).toContain('/api/history');
    expect(html).toContain('/api/text-symbols');
    expect(html).toContain('document.addEventListener(\'keydown\'');
    expect(html).toContain('event.code === \'Space\' ? \'space\'');
    expect(html).toContain('Sheet music preview');
    expect(html).toContain('data-measure="1"');
    expect(html).toContain('data-measure="2"');
    expect(html).toContain('measure selected');
    expect(html).toContain('Playback: Expressive');
  });

  it('renders empty states and falls back to default intent and default density', () => {
    const html = renderDesktopShellHtml({
      title: 'Empty',
      modeLabel: 'select',
      transportLabel: 'Stopped @ tick 0',
      projectLabel: 'unsaved project',
      statusTone: 'stable',
      stats: [],
      notifications: [],
      scorePreview: { clef: 'bass', measures: [] },
      engraving: { tempoBpm: 112, repeatStart: true, repeatEnd: false, articulation: 'none', dynamics: 'p', chordSymbol: '' },
    });

    expect(html).toContain('No score metrics yet. Start entering notes to populate analytics.');
    expect(html).toContain('No notifications.');
    expect(html).toContain('All changes saved');
    expect(html).toContain('No measures available.');
    expect(html).toContain('Selection inspector (default)');
    expect(html).toContain('duration quarter, accidental natural, dot off, tie off');
    expect(html).toContain('Tip: insert a note to hear immediate playback changes.');
    expect(html).toContain('value="112"');
    expect(html).toContain('id="repeat-start" type="checkbox" checked');
    expect(html).toContain('class="status-chip playback-idle"');
    expect(html).toContain('class="mode-tab active" data-hotkey="v"');
    expect(html).toContain('Hotkeys: <kbd>Space</kbd> Play/Stop');
    expect(html).toContain('Playback: Strict');
  });

  it('renders all measures across multiple systems for large scores', () => {
    const measures = Array.from({ length: 20 }, (_, index) => ({
      number: index + 1,
      notes: index % 2 === 0 ? ['C4'] : ['D4'],
      isSelected: index === 19,
    }));

    const html = renderDesktopShellHtml({
      title: 'Long Form',
      modeLabel: 'text-lines',
      transportLabel: 'Stopped @ tick 0',
      projectLabel: 'long.scorecraft.json',
      statusTone: 'stable',
      stats: [],
      notifications: [],
      scorePreview: { clef: 'treble', measures },
      engraving: { tempoBpm: 120, repeatStart: false, repeatEnd: false, articulation: 'tenuto', dynamics: 'mf', chordSymbol: 'Dm7', navigationMarker: 'Coda' },
      densityPreset: 'default',
      entryIntent: { duration: 'half', accidental: 'flat', dot: false, tie: false, chordMode: false },
    });

    expect(html.match(/data-measure="/g)?.length).toBe(20);
    expect(html).toContain('20 measures');
    expect(html).toContain('System 5 showing measures 17-20');
    expect(html).toContain('class="mode-tab active" data-hotkey="t"');
  });
});
