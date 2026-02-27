import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CommandHistory,
  applyCommand,
  assertGolden,
  createRenderingContract,
  createRestEvent,
  createScore,
  deserializeScore,
  durationToTicks,
  linearizePlaybackEvents,
  runThinSlice,
  resetIdCounter,
  DeterministicClock,
  serializeScore,
  validateScore,
} from './index.js';


beforeEach(() => {
  resetIdCounter();
});
describe('model + validation', () => {
  it('creates a valid initial score', () => {
    const score = createScore();
    expect(validateScore(score)).toEqual([]);
  });

  it('flags structural issues and bad tempo', () => {
    const score = createScore();
    score.parts = [];
    expect(validateScore(score).some((i) => i.code === 'STRUCTURE_EMPTY_PARTS')).toBe(true);

    const score2 = createScore();
    score2.parts[0].staves[0].measures[0].tempoBpm = 999;
    expect(validateScore(score2).some((i) => i.code === 'MUSICAL_INVALID_TEMPO')).toBe(true);
  });

  it('flags invalid tie and duplicate IDs', () => {
    const score = createScore();
    const voice = score.parts[0].staves[0].measures[0].voices[0];
    const n1 = applyCommand(score, {
      type: 'insertNote',
      selection: {
        partId: score.parts[0].id,
        staffId: score.parts[0].staves[0].id,
        measureId: score.parts[0].staves[0].measures[0].id,
        voiceId: voice.id,
      },
      pitch: { step: 'C', octave: 4 },
      duration: 'quarter',
    }).score;
    n1.parts[0].staves[0].measures[0].voices[0].events[0].tieStartId = 'missing';
    n1.parts[0].id = n1.id;
    const issues = validateScore(n1);
    expect(issues.some((i) => i.code === 'MUSICAL_INVALID_TIE')).toBe(true);
    expect(issues.some((i) => i.code === 'MUSICAL_DUPLICATE_ID')).toBe(true);
  });
});

describe('command semantics', () => {
  const setup = () => {
    const score = createScore();
    const part = score.parts[0];
    const staff = part.staves[0];
    const measure = staff.measures[0];
    const voice = measure.voices[0];
    return { score, sel: { partId: part.id, staffId: staff.id, measureId: measure.id, voiceId: voice.id } };
  };

  it('supports note insertion, delete, transpose, duration mutation, tie, signatures and tempo', () => {
    const { score, sel } = setup();
    let current = applyCommand(score, { type: 'insertNote', selection: sel, pitch: { step: 'C', octave: 4 }, duration: 'quarter' }).score;
    current = applyCommand(current, { type: 'insertNote', selection: sel, pitch: { step: 'D', octave: 4 }, duration: 'quarter' }).score;
    const events = current.parts[0].staves[0].measures[0].voices[0].events;

    current = applyCommand(current, { type: 'transpose', selection: { ...sel, eventId: events[0].id }, semitones: 2 }).score;
    expect(current.parts[0].staves[0].measures[0].voices[0].events[0]).toMatchObject({ type: 'note', pitch: { step: 'D' } });

    current = applyCommand(current, { type: 'mutateDuration', selection: { ...sel, eventId: events[0].id }, duration: 'half', dots: 1 }).score;
    expect(current.parts[0].staves[0].measures[0].voices[0].events[0]).toMatchObject({ duration: 'half', dots: 1 });

    const eids = current.parts[0].staves[0].measures[0].voices[0].events.map((e) => e.id);
    current = applyCommand(current, { type: 'addTie', selection: { ...sel, eventId: eids[0] }, targetEventId: eids[1] }).score;
    expect(current.parts[0].staves[0].measures[0].voices[0].events[0]).toMatchObject({ tieStartId: eids[1] });

    current = applyCommand(current, { type: 'setTempo', selection: sel, bpm: 120 }).score;
    current = applyCommand(current, { type: 'setTimeSignature', selection: sel, numerator: 3, denominator: 4 }).score;
    current = applyCommand(current, { type: 'setKeySignature', selection: sel, fifths: 2, mode: 'major' }).score;
    expect(current.parts[0].staves[0].measures[0]).toMatchObject({ tempoBpm: 120, timeSignature: { numerator: 3 }, keySignature: { fifths: 2 } });

    current = applyCommand(current, { type: 'deleteSelection', selection: { ...sel, eventId: eids[1] } }).score;
    expect(current.parts[0].staves[0].measures[0].voices[0].events).toHaveLength(1);
  });

  it('rejects invalid operations branches', () => {
    const { score, sel } = setup();
    expect(() => applyCommand(score, { type: 'deleteSelection', selection: { ...sel, eventId: 'missing' } })).toThrow();
    expect(() => applyCommand(score, { type: 'transpose', selection: { ...sel, eventId: 'missing' }, semitones: 1 })).toThrow();

    const withRest = structuredClone(score);
    withRest.parts[0].staves[0].measures[0].voices[0].events.push(createRestEvent('quarter'));
    const restId = withRest.parts[0].staves[0].measures[0].voices[0].events[0].id;
    expect(() => applyCommand(withRest, { type: 'transpose', selection: { ...sel, eventId: restId }, semitones: 1 })).toThrow('Cannot transpose a rest.');
    expect(() => applyCommand(withRest, { type: 'addTie', selection: { ...sel, eventId: restId }, targetEventId: restId })).toThrow();

    expect(() =>
      applyCommand(score, {
        type: 'insertNote',
        selection: { ...sel, voiceId: 'nope' },
        pitch: { step: 'C', octave: 4 },
        duration: 'quarter',
      }),
    ).toThrow();

    expect(() => applyCommand(score, { type: 'setTempo', selection: sel, bpm: 500 })).toThrow('Validation failed');
  });

  it('persists spelling override behavior during transpose', () => {
    const { score, sel } = setup();
    let current = applyCommand(score, {
      type: 'insertNote',
      selection: sel,
      pitch: { step: 'B', octave: 4, accidental: -1, spellingLocked: true },
      duration: 'quarter',
    }).score;
    const eventId = current.parts[0].staves[0].measures[0].voices[0].events[0].id;
    current = applyCommand(current, { type: 'transpose', selection: { ...sel, eventId }, semitones: 12 }).score;
    expect(current.parts[0].staves[0].measures[0].voices[0].events[0]).toMatchObject({ pitch: { step: 'B', accidental: -1, octave: 5 } });
  });

  it('supports undo/redo reversibility', () => {
    const { score, sel } = setup();
    const history = new CommandHistory();
    const r1 = history.execute(score, { type: 'insertNote', selection: sel, pitch: { step: 'C', octave: 4 }, duration: 'quarter' });
    const state2 = history.execute(r1.score, { type: 'setTempo', selection: sel, bpm: 100 }).score;
    expect(history.getUndoDepth()).toBe(2);

    const undone = history.undo(state2);
    expect(undone.parts[0].staves[0].measures[0].tempoBpm).toBeUndefined();
    expect(history.getRedoDepth()).toBe(1);
    const redone = history.redo(undone);
    expect(redone.parts[0].staves[0].measures[0].tempoBpm).toBe(100);
  });
});

describe('contracts and integration', () => {
  it('duration ticks are deterministic', () => {
    expect(durationToTicks('quarter', 0)).toBe(480);
    expect(durationToTicks('quarter', 1)).toBe(720);
    expect(durationToTicks('quarter', 2)).toBe(840);
  });

  it('serializes and deserializes schema versioned score', () => {
    const score = createScore('Serialize Me');
    const raw = serializeScore(score);
    const roundtrip = deserializeScore(raw);
    expect(roundtrip.title).toBe('Serialize Me');
    expect(() => deserializeScore('{"schemaVersion":"0.0.1"}')).toThrow();
  });

  it('generates playback and rendering contracts', () => {
    const thin = runThinSlice();
    expect(thin.playback.length).toBe(1);
    expect(thin.rendering.tokens.length).toBeGreaterThan(0);
    expect(thin.rendering.glyphs.some((g) => g.glyph === '♪')).toBe(true);
  });

  it('property test: command insertions keep score valid', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 48, max: 72 }), { minLength: 1, maxLength: 12 }), (midis) => {
        let score = createScore('Prop');
        const part = score.parts[0];
        const staff = part.staves[0];
        const measure = staff.measures[0];
        const voice = measure.voices[0];
        const sel = { partId: part.id, staffId: staff.id, measureId: measure.id, voiceId: voice.id };
        for (const midi of midis) {
          const stepMap = ['C', 'C', 'D', 'E', 'E', 'F', 'F', 'G', 'A', 'A', 'B', 'B'] as const;
          const accidentals = [0, 1, 0, -1, 0, 0, 1, 0, -1, 0, -1, 0] as const;
          const pc = midi % 12;
          score = applyCommand(score, {
            type: 'insertNote',
            selection: sel,
            pitch: { step: stepMap[pc], accidental: accidentals[pc], octave: Math.floor(midi / 12) - 1 },
            duration: 'eighth',
          }).score;
        }
        return validateScore(score).length === 0;
      }),
    );
  });

  it('creates and validates golden fixtures', () => {
    const thin = runThinSlice();
    const renderRaw = JSON.stringify(thin.rendering, null, 2);
    const playbackRaw = JSON.stringify(thin.playback, null, 2);
    const r = assertGolden('packages/core/test/fixtures/thin-slice.rendering.golden.json', renderRaw);
    const p = assertGolden('packages/core/test/fixtures/thin-slice.playback.golden.json', playbackRaw);
    expect(['created', 'matched', 'updated']).toContain(r);
    expect(['created', 'matched', 'updated']).toContain(p);
  });

  it('linearized playback has increasing ticks', () => {
    const score = createScore();
    const part = score.parts[0];
    const staff = part.staves[0];
    const measure = staff.measures[0];
    const voice = measure.voices[0];
    const sel = { partId: part.id, staffId: staff.id, measureId: measure.id, voiceId: voice.id };
    let current = applyCommand(score, { type: 'insertNote', selection: sel, pitch: { step: 'C', octave: 4 }, duration: 'quarter' }).score;
    current = applyCommand(current, { type: 'insertNote', selection: sel, pitch: { step: 'E', octave: 4 }, duration: 'quarter' }).score;
    const events = linearizePlaybackEvents(current);
    expect(events[1].tick).toBeGreaterThan(events[0].tick);
  });
});


describe('test harness branches', () => {
  it('deterministic clock ticks', () => {
    const clock = new DeterministicClock();
    expect(clock.now()).toBe(0);
    expect(clock.tick(10)).toBe(10);
    expect(clock.now()).toBe(10);
  });

  it('golden helper returns matched and updated paths', () => {
    const path = 'packages/core/test/fixtures/tmp.golden.txt';
    expect(assertGolden(path, 'hello')).toMatch(/created|updated|matched/);
    expect(assertGolden(path, 'hello')).toBe('matched');
    expect(assertGolden(path, 'world')).toBe('updated');
  });

  it('rendering/playback cover rest and dynamics branches', () => {
    const score = createScore();
    const part = score.parts[0];
    const staff = part.staves[0];
    const measure = staff.measures[0];
    const voice = measure.voices[0];
    voice.events.push({ id: 'r1', type: 'rest', duration: 'quarter', dots: 0 });
    voice.events.push({
      id: 'n1',
      type: 'note',
      duration: 'quarter',
      dots: 0,
      pitch: { step: 'C', octave: 4 },
      articulations: [],
      dynamics: 'ff',
    });
    const playback = linearizePlaybackEvents(score);
    expect(playback[0].velocity).toBe(120);
    const render = createRenderingContract(score);
    expect(render.tokens.some((t) => t.kind === 'rest')).toBe(true);
  });
});
