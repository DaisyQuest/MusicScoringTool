import type { Duration, Id, Measure, Part, Pitch, Score, Staff, Voice, VoiceEvent } from './types.js';

let nextId = 1;
export const resetIdCounter = (value = 1): void => {
  nextId = value;
};
export const createId = (prefix = 'id'): Id => `${prefix}_${nextId++}`;

export const durationToTicks = (duration: Duration, dots: 0 | 1 | 2): number => {
  const base = {
    whole: 1920,
    half: 960,
    quarter: 480,
    eighth: 240,
    sixteenth: 120,
    thirtySecond: 60,
    sixtyFourth: 30,
  }[duration];
  if (dots === 0) return base;
  if (dots === 1) return base + base / 2;
  return base + base / 2 + base / 4;
};

export const createVoice = (): Voice => ({ id: createId('voice'), events: [] });

export const createMeasure = (number: number): Measure => ({
  id: createId('measure'),
  number,
  voices: [createVoice()],
  chordSymbols: [],
});

export const createStaff = (): Staff => ({
  id: createId('staff'),
  clef: 'treble',
  measures: [createMeasure(1)],
});

export const createPart = (name = 'Piano'): Part => ({
  id: createId('part'),
  name,
  staves: [createStaff()],
});

export const createScore = (title = 'Untitled'): Score => ({
  id: createId('score'),
  title,
  parts: [createPart()],
  slurs: [],
  hairpins: [],
  schemaVersion: '1.0.0',
});

export const createNoteEvent = (pitch: Pitch, duration: Duration, dots: 0 | 1 | 2 = 0): VoiceEvent => ({
  id: createId('note'),
  type: 'note',
  pitch,
  duration,
  dots,
  articulations: [],
});

export const createRestEvent = (duration: Duration, dots: 0 | 1 | 2 = 0): VoiceEvent => ({
  id: createId('rest'),
  type: 'rest',
  duration,
  dots,
});

export const cloneScore = (score: Score): Score => structuredClone(score);
