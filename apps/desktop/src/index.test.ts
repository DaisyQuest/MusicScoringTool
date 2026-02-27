import { describe, expect, it, vi } from 'vitest';

import {
  applyHotkey,
  addMeasure,
  advancePlayback,
  applyInspectorEdits,
  autosaveProject,
  createDesktopShell,
  desktopShellBoot,
  exportMidiWithNotifications,
  recoverFromAutosave,
  resolveCommandPalette,
  runNewScoreWizard,
  saveProject,
  setGhostPreview,
  setMode,
  stepInsertNote,
  updateTransport,
} from './index.js';

describe('desktop shell', () => {
  it('creates defaults from wizard input and renders polished boot html', () => {
    const shell = createDesktopShell({ title: '  My Score ', partName: ' Clarinet ' });
    expect(shell.score.title).toBe('My Score');
    expect(shell.score.parts[0]?.name).toBe('Clarinet');
    expect(shell.mode).toBe('select');
    expect(shell.project.dirty).toBe(false);

    const html = desktopShellBoot(shell);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('My Score');
    expect(html).toContain('Select mode');
    expect(html).toContain('Stopped @ tick 0');
  });

  it('supports new score wizard and notification', () => {
    const state = createDesktopShell();
    const next = runNewScoreWizard(state, { title: 'New Piece', partName: 'Flute' });

    expect(next.score.title).toBe('New Piece');
    expect(next.score.parts[0]?.name).toBe('Flute');
    expect(next.notifications.at(-1)?.level).toBe('success');
  });

  it('switches modes and supports ghost preview + step entry flow', () => {
    let state = createDesktopShell({ title: 'Entry' });
    state = setMode(state, 'note-input');
    state = setGhostPreview(state, { step: 'D', octave: 5 });
    expect(state.caret.ghostPitch?.step).toBe('D');

    state = stepInsertNote(state, { step: 'C', octave: 4 }, 'half', 1);

    const voice = state.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!;
    expect(voice.events).toHaveLength(1);
    expect(voice.events[0]?.type).toBe('note');
    expect(state.caret.eventIndex).toBe(1);
    expect(state.project.dirty).toBe(true);
    expect(state.caret.ghostPitch?.step).toBe('C');

    state = setGhostPreview(state);
    expect(state.caret.ghostPitch).toBeUndefined();
  });



  it('adds measures and moves caret to the new measure for continued entry', () => {
    let state = createDesktopShell({ title: 'Measures' });
    state = addMeasure(state);

    const staff = state.score.parts[0]!.staves[0]!;
    expect(staff.measures).toHaveLength(2);
    expect(staff.measures[1]!.number).toBe(2);
    expect(state.caret.selection.measureId).toBe(staff.measures[1]!.id);
    expect(state.caret.eventIndex).toBe(0);
    expect(state.project.dirty).toBe(true);
  });

  it('guards step entry outside note-input mode', () => {
    const state = createDesktopShell();
    expect(() => stepInsertNote(state, { step: 'C', octave: 4 })).toThrow('Step entry requires note-input mode.');
  });

  it('applies inspector edits for tempo/repeats/dynamics and branch when no prior event', () => {
    let state = createDesktopShell();
    state = setMode(state, 'note-input');
    state = stepInsertNote(state, { step: 'E', octave: 4 });

    const edited = applyInspectorEdits(state, { tempoBpm: 120, repeatStart: true, repeatEnd: true, dynamics: 'ff' });
    const measure = edited.score.parts[0]!.staves[0]!.measures[0]!;
    const event = measure.voices[0]!.events[0]!;
    expect(measure.tempoBpm).toBe(120);
    expect(measure.repeatStart).toBe(true);
    expect(measure.repeatEnd).toBe(true);
    expect(event.type === 'note' ? event.dynamics : undefined).toBe('ff');
    expect(edited.project.dirty).toBe(true);

    const noPriorEvent = applyInspectorEdits(createDesktopShell(), { dynamics: 'p' });
    expect(noPriorEvent.project.dirty).toBe(false);
  });

  it('updates transport state for play/stop/seek actions', () => {
    let state = createDesktopShell();
    state = updateTransport(state, { isPlaying: true, nowMs: 10 });
    expect(state.transport.lastAction).toBe('play');
    expect(state.transport.lastUpdatedAtMs).toBe(10);

    state = updateTransport(state, { isPlaying: false, nowMs: 20 });
    expect(state.transport.lastAction).toBe('stop');
    expect(state.transport.lastUpdatedAtMs).toBeUndefined();

    state = updateTransport(state, { tick: 960, nowMs: 30 });
    expect(state.transport.lastAction).toBe('seek');
    expect(state.transport.tick).toBe(960);
    expect(state.transport.tickRemainder).toBe(0);

    state = updateTransport(state, { isPlaying: true, tick: 100, nowMs: 40 });
    expect(state.transport.lastAction).toBe('seek');
    expect(state.transport.lastUpdatedAtMs).toBe(40);
  });



  it('advances playback ticks using elapsed wall time and tempo, preserving fractional remainders', () => {
    let state = createDesktopShell({ title: 'Playback Math' });
    state = setMode(state, 'note-input');
    state = stepInsertNote(state, { step: 'C', octave: 4 }, 'quarter', 0);
    state = applyInspectorEdits(state, { tempoBpm: 120 });

    state = updateTransport(state, { isPlaying: true, nowMs: 1_000 });
    const advanced = advancePlayback(state, 1_125);

    expect(advanced.transport.tick).toBe(120);
    expect(advanced.transport.lastUpdatedAtMs).toBe(1_125);
    expect(advanced.transport.tickRemainder).toBeCloseTo(0, 6);

    const smallSlice = advancePlayback(advanced, 1_126);
    expect(smallSlice.transport.tick).toBe(120);
    expect(smallSlice.transport.tickRemainder).toBeGreaterThan(0);
  });

  it('does not advance when transport is stopped and seeds playback timestamp when undefined', () => {
    const idle = createDesktopShell();
    expect(advancePlayback(idle, 2_000)).toBe(idle);

    const playingWithoutTimestamp = {
      ...idle,
      transport: { ...idle.transport, isPlaying: true, lastAction: 'play', tickRemainder: undefined, lastUpdatedAtMs: undefined },
    };
    const initialized = advancePlayback(playingWithoutTimestamp, 2_500);
    expect(initialized.transport.tick).toBe(0);
    expect(initialized.transport.lastUpdatedAtMs).toBe(2_500);
    expect(initialized.transport.tickRemainder).toBe(0);
  });

  it('command palette filters actions by id and description', () => {
    const all = resolveCommandPalette('');
    const byId = resolveCommandPalette('set-note');
    const byDescription = resolveCommandPalette('transport');

    expect(all.length).toBeGreaterThan(byId.length);
    expect(byId.some((action) => action.id === 'set-note-mode')).toBe(true);
    expect(byDescription.some((action) => action.id === 'toggle-playback')).toBe(true);
  });

  it('hotkeys drive mode switching, transport toggling and palette notification', () => {
    let state = createDesktopShell();
    state = applyHotkey(state, 'n');
    expect(state.mode).toBe('note-input');

    state = applyHotkey(state, 'space');
    expect(state.transport.isPlaying).toBe(true);

    state = applyHotkey(state, 'v');
    expect(state.mode).toBe('select');

    state = applyHotkey(state, 't');
    expect(state.mode).toBe('text-lines');

    state = applyHotkey(state, 'cmd+k');
    expect(state.notifications.at(-1)?.message).toContain('Command palette opened');
  });

  it('saves + autosaves + recovers serialized projects', async () => {
    let state = createDesktopShell({ title: 'Persist Me' });
    state = setMode(state, 'note-input');
    state = stepInsertNote(state, { step: 'A', octave: 4 });

    const writes: Array<{ path: string; data: string }> = [];
    const saved = await saveProject(state, '/tmp/persist.scorecraft.json', async (path, data) => {
      writes.push({ path, data });
    });
    expect(saved.project.path).toBe('/tmp/persist.scorecraft.json');
    expect(saved.project.dirty).toBe(false);
    expect(saved.project.lastSavedAt).toBeTruthy();

    const autosaved = await autosaveProject(saved, async (path, data) => {
      writes.push({ path, data });
    });

    expect(autosaved.project.recoverySnapshot).toBeTruthy();
    expect(writes).toHaveLength(2);

    const recovered = recoverFromAutosave(autosaved.project.recoverySnapshot!);
    expect(recovered.score.title).toBe('Persist Me');
    expect(recovered.notifications.at(-1)?.message).toContain('Recovered project');

    await autosaveProject(createDesktopShell({ title: 'No path' }), async (path) => {
      expect(path).toContain('.autosave.scorecraft.json');
    });
  });

  it('exports MIDI and reports success/failure notifications', async () => {
    const state = createDesktopShell({ title: 'MIDI Out' });

    const success = await exportMidiWithNotifications(state, '/tmp/out.mid', async () => undefined);
    expect(success.notifications.at(-1)?.level).toBe('success');

    const failure = await exportMidiWithNotifications(state, '/tmp/out.mid', async () => {
      throw new Error('disk full');
    });
    expect(failure.notifications.at(-1)?.level).toBe('error');
    expect(failure.notifications.at(-1)?.message).toContain('disk full');

    const unknownFailure = await exportMidiWithNotifications(state, '/tmp/out.mid', async () => {
      throw 'string failure';
    });
    expect(unknownFailure.notifications.at(-1)?.message).toContain('Unknown export error');
  });

  it('throws on invalid recovery snapshot payload', () => {
    expect(() => recoverFromAutosave('{"schemaVersion":"2.0.0"}')).toThrow('Unsupported schema version.');
  });

  it('surfaces invalid inspector selection branch', () => {
    const state = createDesktopShell();
    const broken = {
      ...state,
      caret: {
        ...state.caret,
        selection: { ...state.caret.selection, voiceId: 'missing-voice' },
      },
    };
    expect(() => applyInspectorEdits(broken, { repeatEnd: true })).toThrow('Inspector selection is invalid.');
  });

  it('saveProject preserves recovery snapshot and propagates write errors', async () => {
    const state = {
      ...createDesktopShell(),
      project: { dirty: true, recoverySnapshot: 'snap' },
    };
    const saved = await saveProject(state, '/tmp/out.score', async () => undefined);
    expect(saved.project.recoverySnapshot).toBe('snap');

    const failing = vi.fn(async () => {
      throw new Error('permission denied');
    });
    await expect(saveProject(state, '/tmp/out.score', failing)).rejects.toThrow('permission denied');
  });



  it('renders all measure blocks in boot html for long scores', () => {
    let state = createDesktopShell({ title: 'Large Score' });
    for (let i = 0; i < 19; i += 1) {
      state = addMeasure(state);
    }

    const html = desktopShellBoot(state);
    expect(html.match(/data-measure="/g)?.length).toBe(20);
    expect(html).toContain('20 measures');
    expect(html).toContain('System 5 showing measures 17-20');
  });

  it('renders mode and notification slices in boot view', () => {
    let state = createDesktopShell({ title: 'Mode Matrix' });
    state = setMode(state, 'text-lines');
    state = updateTransport(state, { isPlaying: true, tick: 128 });
    const withNotifications = {
      ...state,
      notifications: Array.from({ length: 7 }, (_, i) => ({
        id: `n-${i}`,
        level: (i % 3 === 0 ? 'success' : i % 3 === 1 ? 'info' : 'error') as 'success' | 'info' | 'error',
        message: `Notice ${i}`,
      })),
      project: { ...state.project, path: '/tmp/demo.scorecraft.json', dirty: true },
    };

    const expanded = addMeasure(withNotifications);
    const html = desktopShellBoot(expanded);
    expect(html).toContain('Text lines mode');
    expect(html).toContain('Playing @ tick 128');
    expect(html).toContain('/tmp/demo.scorecraft.json');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('Notice 6');
    expect(html).toContain('id="add-measure"');
    expect(html).toContain('id="apply-engraving"');
    expect(html).not.toContain('Notice 0');
  });
});
