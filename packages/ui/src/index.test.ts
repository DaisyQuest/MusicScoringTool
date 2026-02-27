import { describe, expect, it } from 'vitest';

import { defaultBindings, renderDesktopShellHtml } from './index.js';

describe('@scorecraft/ui', () => {
  it('exposes default keyboard bindings', () => {
    expect(defaultBindings).toEqual([
      { commandId: 'insertNote', key: 'N' },
      { commandId: 'transpose', key: 'T' },
    ]);
  });

  it('renders a polished html shell with escaped values and populated collections', () => {
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
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Suite &lt;One&gt;');
    expect(html).toContain('C#5 &amp; friends');
    expect(html).toContain('class="notification success"');
    expect(html).toContain('class="notification error"');
    expect(html).toContain('class="notification info"');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('data-hotkey="space"');
    expect(html).toContain('id="insert-note"');
    expect(html).toContain('/api/notes');
  });

  it('renders empty states and saved styling when no stats or notifications exist', () => {
    const html = renderDesktopShellHtml({
      title: 'Empty',
      modeLabel: 'select',
      transportLabel: 'Stopped @ tick 0',
      projectLabel: 'unsaved project',
      statusTone: 'stable',
      stats: [],
      notifications: [],
    });

    expect(html).toContain('No score metrics yet. Start entering notes to populate analytics.');
    expect(html).toContain('No notifications.');
    expect(html).toContain('All changes saved');
  });
});
