import { applyCommand, cloneScore, createMeasure, createVoice, createScore, deserializeScore, serializeScore, type Duration, type Pitch, type Score, type SelectionRef, type VoiceEvent } from '@scorecraft/core';
import { exportMidi } from '@scorecraft/midi';
import { renderDesktopShellHtml, type DesktopShellUiModel } from '@scorecraft/ui';

export type DesktopMode = 'select' | 'note-input' | 'text-lines';
export type NotificationLevel = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  level: NotificationLevel;
  message: string;
}

export interface TransportState {
  isPlaying: boolean;
  tick: number;
  lastAction: 'play' | 'stop' | 'seek';
  lastUpdatedAtMs?: number;
  tickRemainder?: number;
}

export interface DesktopProject {
  path?: string;
  dirty: boolean;
  lastSavedAt?: string;
  recoverySnapshot?: string;
}

export interface StepEntryCaret {
  selection: SelectionRef;
  eventIndex: number;
  ghostPitch?: Pitch;
}

export interface DesktopShellState {
  score: Score;
  mode: DesktopMode;
  caret: StepEntryCaret;
  transport: TransportState;
  project: DesktopProject;
  notifications: Notification[];
}

export interface NewScoreWizardInput {
  title: string;
  partName?: string;
}

export interface HotkeyAction {
  id: 'toggle-playback' | 'set-select-mode' | 'set-note-mode' | 'set-text-lines-mode' | 'open-command-palette';
  description: string;
}

let notificationId = 1;
const nextNotificationId = (): string => `notification_${notificationId++}`;

const defaultSelection = (score: Score): SelectionRef => {
  const part = score.parts[0];
  const staff = part?.staves[0];
  const measure = staff?.measures[0];
  const voice = measure?.voices[0];
  if (!part || !staff || !measure || !voice) {
    throw new Error('Score is missing default voice structure.');
  }
  return { partId: part.id, staffId: staff.id, measureId: measure.id, voiceId: voice.id };
};

const pushNotification = (state: DesktopShellState, level: NotificationLevel, message: string): DesktopShellState => ({
  ...state,
  notifications: [...state.notifications, { id: nextNotificationId(), level, message }],
});

export const createDesktopShell = (wizardInput: Partial<NewScoreWizardInput> = {}): DesktopShellState => {
  const score = createScore(wizardInput.title?.trim() || 'Untitled');
  if (wizardInput.partName?.trim()) {
    score.parts[0]!.name = wizardInput.partName.trim();
  }

  return {
    score,
    mode: 'select',
    caret: { selection: defaultSelection(score), eventIndex: 0 },
    transport: { isPlaying: false, tick: 0, lastAction: 'stop', tickRemainder: 0 },
    project: { dirty: false },
    notifications: [],
  };
};

export const runNewScoreWizard = (state: DesktopShellState, input: NewScoreWizardInput): DesktopShellState => {
  const next = createDesktopShell(input);
  return pushNotification(next, 'success', `Created score "${next.score.title}".`);
};

export const setMode = (state: DesktopShellState, mode: DesktopMode): DesktopShellState => ({ ...state, mode });

export const setGhostPreview = (state: DesktopShellState, pitch?: Pitch): DesktopShellState => ({
  ...state,
  caret: pitch ? { ...state.caret, ghostPitch: pitch } : { selection: state.caret.selection, eventIndex: state.caret.eventIndex },
});

export const stepInsertNote = (
  state: DesktopShellState,
  pitch: Pitch,
  duration: Duration = 'quarter',
  dots: 0 | 1 | 2 = 0,
): DesktopShellState => {
  if (state.mode !== 'note-input') {
    throw new Error('Step entry requires note-input mode.');
  }
  const result = applyCommand(state.score, {
    type: 'insertNote',
    selection: state.caret.selection,
    pitch,
    duration,
    dots,
  });

  return {
    ...state,
    score: result.score,
    project: { ...state.project, dirty: true },
    caret: {
      ...state.caret,
      eventIndex: state.caret.eventIndex + 1,
      ghostPitch: pitch,
    },
  };
};


export const addMeasure = (state: DesktopShellState): DesktopShellState => {
  const next = cloneScore(state.score);
  const staff = next.parts[0]?.staves[0];
  if (!staff) {
    throw new Error('Score is missing a default staff.');
  }

  const nextMeasureNumber = (staff.measures.at(-1)?.number ?? 0) + 1;
  const voiceCount = staff.measures[0]?.voices.length ?? 1;
  const inserted = createMeasure(nextMeasureNumber);
  inserted.voices = Array.from({ length: voiceCount }, () => createVoice());
  staff.measures.push(inserted);

  const part = next.parts[0]!;
  const targetVoice = staff.measures.at(-1)!.voices[0]!;
  return {
    ...state,
    score: next,
    caret: {
      ...state.caret,
      selection: {
        partId: part.id,
        staffId: staff.id,
        measureId: staff.measures.at(-1)!.id,
        voiceId: targetVoice.id,
      },
      eventIndex: 0,
    },
    project: { ...state.project, dirty: true },
  };
};

export const applyInspectorEdits = (
  state: DesktopShellState,
  edits: Partial<{
    tempoBpm: number;
    repeatStart: boolean;
    repeatEnd: boolean;
    dynamics: 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
  }>,
): DesktopShellState => {
  let next = cloneScore(state.score);
  const selection = state.caret.selection;
  const part = next.parts.find((item) => item.id === selection.partId);
  const staff = part?.staves.find((item) => item.id === selection.staffId);
  const measure = staff?.measures.find((item) => item.id === selection.measureId);
  const voice = measure?.voices.find((item) => item.id === selection.voiceId);
  if (!measure || !voice) {
    throw new Error('Inspector selection is invalid.');
  }

  let dirty = false;
  if (typeof edits.tempoBpm === 'number') {
    measure.tempoBpm = edits.tempoBpm;
    dirty = true;
  }
  if (typeof edits.repeatStart === 'boolean') {
    measure.repeatStart = edits.repeatStart;
    dirty = true;
  }
  if (typeof edits.repeatEnd === 'boolean') {
    measure.repeatEnd = edits.repeatEnd;
    dirty = true;
  }
  if (edits.dynamics) {
    const event = voice.events[state.caret.eventIndex - 1];
    if (event?.type === 'note') {
      event.dynamics = edits.dynamics;
      dirty = true;
    }
  }

  return {
    ...state,
    score: next,
    project: { ...state.project, dirty: state.project.dirty || dirty },
  };
};

const resolveActiveTempo = (state: DesktopShellState): number => {
  const selection = state.caret.selection;
  const part = state.score.parts.find((item) => item.id === selection.partId);
  const staff = part?.staves.find((item) => item.id === selection.staffId);
  const measure = staff?.measures.find((item) => item.id === selection.measureId);
  const tempo = measure?.tempoBpm ?? staff?.measures[0]?.tempoBpm ?? 120;
  return tempo > 0 ? tempo : 120;
};

export const advancePlayback = (state: DesktopShellState, nowMs: number = Date.now()): DesktopShellState => {
  if (!state.transport.isPlaying) {
    return state;
  }

  const lastUpdatedAtMs = state.transport.lastUpdatedAtMs ?? nowMs;
  const elapsedMs = Math.max(0, nowMs - lastUpdatedAtMs);
  if (elapsedMs === 0) {
    return state.transport.lastUpdatedAtMs === undefined
      ? { ...state, transport: { ...state.transport, lastUpdatedAtMs: nowMs, tickRemainder: state.transport.tickRemainder ?? 0 } }
      : state;
  }

  const ticksPerMs = (resolveActiveTempo(state) * 480) / 60_000;
  const preciseDelta = elapsedMs * ticksPerMs + (state.transport.tickRemainder ?? 0);
  const deltaTick = Math.floor(preciseDelta);

  return {
    ...state,
    transport: {
      ...state.transport,
      tick: state.transport.tick + deltaTick,
      tickRemainder: preciseDelta - deltaTick,
      lastUpdatedAtMs: nowMs,
    },
  };
};

export const updateTransport = (
  state: DesktopShellState,
  update: Partial<Pick<TransportState, 'isPlaying' | 'tick'>> & { nowMs?: number },
): DesktopShellState => {
  const nowMs = update.nowMs ?? Date.now();
  const isPlaying = update.isPlaying ?? state.transport.isPlaying;
  const tick = update.tick ?? state.transport.tick;

  if (update.tick !== undefined) {
    return {
      ...state,
      transport: {
        ...state.transport,
        isPlaying,
        tick,
        tickRemainder: 0,
        lastUpdatedAtMs: isPlaying ? nowMs : undefined,
        lastAction: 'seek',
      },
    };
  }

  if (update.isPlaying !== undefined && update.isPlaying !== state.transport.isPlaying) {
    return {
      ...state,
      transport: {
        ...state.transport,
        isPlaying,
        tick,
        tickRemainder: isPlaying ? state.transport.tickRemainder ?? 0 : 0,
        lastUpdatedAtMs: isPlaying ? nowMs : undefined,
        lastAction: isPlaying ? 'play' : 'stop',
      },
    };
  }

  const fallbackAction: TransportState['lastAction'] = isPlaying ? 'play' : 'stop';
  return {
    ...state,
    transport: {
      ...state.transport,
      isPlaying,
      tick,
      lastAction: fallbackAction,
      lastUpdatedAtMs: isPlaying ? state.transport.lastUpdatedAtMs ?? nowMs : undefined,
      tickRemainder: isPlaying ? state.transport.tickRemainder ?? 0 : 0,
    },
  };
};

export const resolveCommandPalette = (query: string): HotkeyAction[] => {
  const actions: HotkeyAction[] = [
    { id: 'toggle-playback', description: 'Play or stop transport' },
    { id: 'set-select-mode', description: 'Switch to select mode' },
    { id: 'set-note-mode', description: 'Switch to note input mode' },
    { id: 'set-text-lines-mode', description: 'Switch to text-lines mode' },
    { id: 'open-command-palette', description: 'Open command palette' },
  ];

  const normalized = query.trim().toLowerCase();
  if (!normalized) return actions;
  return actions.filter((action) => action.id.includes(normalized) || action.description.toLowerCase().includes(normalized));
};

export const applyHotkey = (state: DesktopShellState, hotkey: 'space' | 'v' | 'n' | 't' | 'cmd+k'): DesktopShellState => {
  switch (hotkey) {
    case 'space':
      return updateTransport(state, { isPlaying: !state.transport.isPlaying });
    case 'v':
      return setMode(state, 'select');
    case 'n':
      return setMode(state, 'note-input');
    case 't':
      return setMode(state, 'text-lines');
    case 'cmd+k':
      return pushNotification(state, 'info', 'Command palette opened.');
    default:
      return state;
  }
};

export const saveProject = async (
  state: DesktopShellState,
  path: string,
  writeFile: (path: string, data: string) => Promise<void>,
): Promise<DesktopShellState> => {
  await writeFile(path, serializeScore(state.score));
  const project: DesktopProject = {
    path,
    dirty: false,
    lastSavedAt: new Date().toISOString(),
    ...(state.project.recoverySnapshot ? { recoverySnapshot: state.project.recoverySnapshot } : {}),
  };

  return {
    ...state,
    project,
  };
};

export const autosaveProject = async (
  state: DesktopShellState,
  writeFile: (path: string, data: string) => Promise<void>,
): Promise<DesktopShellState> => {
  const path = state.project.path ?? `${state.score.id}.autosave.scorecraft.json`;
  const snapshot = serializeScore(state.score);
  await writeFile(path, snapshot);
  return {
    ...state,
    project: { ...state.project, recoverySnapshot: snapshot },
  };
};

export const recoverFromAutosave = (snapshot: string): DesktopShellState => {
  const score = deserializeScore(snapshot);
  const shell = createDesktopShell({ title: score.title });
  shell.score = score;
  shell.caret = { ...shell.caret, selection: defaultSelection(score) };
  shell.project.recoverySnapshot = snapshot;
  return pushNotification(shell, 'info', 'Recovered project from autosave snapshot.');
};

export const exportMidiWithNotifications = async (
  state: DesktopShellState,
  targetPath: string,
  writeFile: (path: string, data: Uint8Array) => Promise<void>,
): Promise<DesktopShellState> => {
  try {
    const rendered = exportMidi(state.score);
    await writeFile(targetPath, rendered.bytes);
    return pushNotification(state, 'success', `Exported MIDI (${rendered.bytes.byteLength} bytes) to ${targetPath}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown export error.';
    return pushNotification(state, 'error', `MIDI export failed: ${message}`);
  }
};

const modeLabel = (mode: DesktopMode): string => {
  switch (mode) {
    case 'note-input':
      return 'Note input mode';
    case 'text-lines':
      return 'Text lines mode';
    default:
      return 'Select mode';
  }
};

const notificationPreview = (state: DesktopShellState): DesktopShellUiModel['notifications'] =>
  state.notifications.slice(-5).map((notification) => ({ level: notification.level, message: notification.message }));

const eventToStaffNote = (event: VoiceEvent): string | undefined => {
  if (event.type !== 'note') {
    return undefined;
  }
  return `${event.pitch.step}${event.pitch.octave}`;
};

export const desktopShellBoot = (state: DesktopShellState = createDesktopShell()): string => {
  const staff = state.score.parts[0]?.staves[0];
  const measure = staff?.measures.find((item) => item.id === state.caret.selection.measureId) ?? staff?.measures[0];
  const voice = measure?.voices.find((item) => item.id === state.caret.selection.voiceId) ?? measure?.voices[0];

  const model: DesktopShellUiModel = {
    title: state.score.title,
    modeLabel: modeLabel(state.mode),
    transportLabel: `${state.transport.isPlaying ? 'Playing' : 'Stopped'} @ tick ${state.transport.tick}`,
    projectLabel: state.project.path ?? 'Unsaved project',
    statusTone: state.project.dirty ? 'dirty' : 'stable',
    stats: [
      { label: 'Measures', value: String(staff?.measures.length ?? 0) },
      { label: 'Events in focus voice', value: String(voice?.events.length ?? 0) },
      { label: 'Tempo', value: `${measure?.tempoBpm ?? 120} bpm` },
      { label: 'Last action', value: state.transport.lastAction },
    ],
    notifications: notificationPreview(state),
    scorePreview: {
      clef: staff?.clef ?? 'treble',
      measures:
        staff?.measures.map((item) => {
          const previewVoice = item.voices.find((candidate) => candidate.id === state.caret.selection.voiceId) ?? item.voices[0];
          const notes = (previewVoice?.events.map(eventToStaffNote).filter((note): note is string => note !== undefined) ?? []).slice(0, 8);
          return {
            number: item.number,
            notes,
            isSelected: item.id === state.caret.selection.measureId,
          };
        }) ?? [],
    },
    engraving: {
      tempoBpm: measure?.tempoBpm ?? 120,
      repeatStart: measure?.repeatStart ?? false,
      repeatEnd: measure?.repeatEnd ?? false,
      dynamics: (() => {
        const latest = [...(voice?.events ?? [])].reverse().find((event) => event.type === 'note');
        return latest && latest.type === 'note' && latest.dynamics ? latest.dynamics : 'mf';
      })(),
    },
    entryIntent: {
      duration: 'quarter',
      accidental: 'natural',
      dot: false,
      tie: false,
      chordMode: false,
    },
    densityPreset: 'default',
  };

  return renderDesktopShellHtml(model);
};
