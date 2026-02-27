import { describe, expect, it } from 'vitest';
import { createScore, createNoteEvent } from './model.js';
import { createSchedulerAdapter, generatePlaybackEvents, resolveMeasureTraversal, type Scheduler } from './playback.js';

const measureIds = (order: { measureId: string }[]): string[] => order.map((m) => m.measureId);

describe('resolveMeasureTraversal', () => {
  it('walks linear measures without markers', () => {
    const score = createScore();
    const staff = score.parts[0].staves[0];
    staff.measures.push({ ...structuredClone(staff.measures[0]), id: 'm2', number: 2, voices: [{ id: 'v2', events: [] }], chordSymbols: [] });
    staff.measures[0].id = 'm1';
    const result = resolveMeasureTraversal(staff.measures);
    expect(measureIds(result.order)).toEqual(['m1', 'm2']);
    expect(result.terminatedBy).toBe('end_of_score');
  });

  it('resolves repeat start/end with first and second endings', () => {
    const score = createScore();
    const staff = score.parts[0].staves[0];
    staff.measures = [
      { ...staff.measures[0], id: 'm1', number: 1, repeatStart: true, voices: [{ id: 'v1', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm2', number: 2, volta: 1, voices: [{ id: 'v2', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm3', number: 3, repeatEnd: true, voices: [{ id: 'v3', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm4', number: 4, volta: 2, voices: [{ id: 'v4', events: [] }], chordSymbols: [] },
    ];

    const result = resolveMeasureTraversal(staff.measures);
    expect(measureIds(result.order)).toEqual(['m1', 'm2', 'm3', 'm1', 'm3', 'm4']);
  });

  it('supports Da Capo + Fine termination', () => {
    const score = createScore();
    const staff = score.parts[0].staves[0];
    staff.measures = [
      { ...staff.measures[0], id: 'm1', number: 1, voices: [{ id: 'v1', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm2', number: 2, navigationMarker: 'Fine', voices: [{ id: 'v2', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm3', number: 3, navigationMarker: 'DC', voices: [{ id: 'v3', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm4', number: 4, voices: [{ id: 'v4', events: [] }], chordSymbols: [] },
    ];

    const result = resolveMeasureTraversal(staff.measures);
    expect(measureIds(result.order)).toEqual(['m1', 'm2', 'm3', 'm1', 'm2']);
    expect(result.terminatedBy).toBe('fine');
  });

  it('supports Da Segno jump to earlier DS marker', () => {
    const score = createScore();
    const staff = score.parts[0].staves[0];
    staff.measures = [
      { ...staff.measures[0], id: 'm1', number: 1, navigationMarker: 'DS', voices: [{ id: 'v1', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm2', number: 2, voices: [{ id: 'v2', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm3', number: 3, navigationMarker: 'Fine', voices: [{ id: 'v3', events: [] }], chordSymbols: [] },
      { ...staff.measures[0], id: 'm4', number: 4, navigationMarker: 'DS', voices: [{ id: 'v4', events: [] }], chordSymbols: [] },
    ];

    const result = resolveMeasureTraversal(staff.measures);
    expect(measureIds(result.order)).toEqual(['m1', 'm2', 'm3', 'm4', 'm1', 'm2', 'm3']);
    expect(result.terminatedBy).toBe('fine');
  });

  it('terminates repeated self-loop measure deterministically', () => {
    const score = createScore();
    const measure = score.parts[0].staves[0].measures[0];
    const result = resolveMeasureTraversal([{ ...measure, repeatStart: true, repeatEnd: true }], 6);
    expect(result.terminatedBy).toBe('end_of_score');
    expect(result.order).toHaveLength(2);
  });
});

describe('generatePlaybackEvents', () => {
  it('creates strict tick-accurate playback events', () => {
    const score = createScore();
    const voice = score.parts[0].staves[0].measures[0].voices[0];
    voice.events = [
      createNoteEvent({ step: 'C', octave: 4 }, 'quarter'),
      createNoteEvent({ step: 'E', octave: 4 }, 'eighth'),
      createNoteEvent({ step: 'G', octave: 4 }, 'sixteenth'),
    ];

    const { events } = generatePlaybackEvents(score, { expressive: false });
    expect(events.map((e) => e.tick)).toEqual([0, 480, 720]);
    expect(events.map((e) => e.durationTicks)).toEqual([480, 240, 120]);
  });

  it('applies dynamics, articulations and hairpin shaping in expressive mode', () => {
    const score = createScore();
    const voice = score.parts[0].staves[0].measures[0].voices[0];
    const n1 = createNoteEvent({ step: 'C', octave: 4 }, 'quarter') as any;
    n1.dynamics = 'p';
    n1.articulations = ['accent'];
    const n2 = createNoteEvent({ step: 'D', octave: 4 }, 'quarter') as any;
    n2.dynamics = 'mf';
    n2.articulations = ['staccato'];
    const n3 = createNoteEvent({ step: 'E', octave: 4 }, 'quarter') as any;
    n3.dynamics = 'mf';
    n3.articulations = ['tenuto'];
    voice.events = [n1, n2, n3];

    score.hairpins.push({ id: 'h1', from: n1.id, to: n3.id, type: 'crescendo' });

    const strict = generatePlaybackEvents(score, { expressive: false }).events;
    const expressive = generatePlaybackEvents(score, { expressive: true }).events;

    expect(expressive[0].velocity).toBeGreaterThan(strict[0].velocity);
    expect(expressive[1].durationTicks).toBeLessThan(strict[1].durationTicks);
    expect(expressive[2].durationTicks).toBeGreaterThan(strict[2].durationTicks);
    expect(expressive[2].tick).toBeLessThan(strict[2].tick + 1);
    expect(expressive[2].velocity).toBeGreaterThan(expressive[1].velocity);
  });
});


  it('includes note events from every staff and part', () => {
    const score = createScore();
    score.parts[0].staves.push({
      id: 'staff-2',
      clef: 'bass',
      measures: [
        {
          id: 'm-bass-1',
          number: 1,
          voices: [
            { id: 'v-bass-1', events: [createNoteEvent({ step: 'C', octave: 3 }, 'half')] },
          ],
          chordSymbols: [],
        },
      ],
    });
    score.parts.push({
      id: 'part-2',
      name: 'Strings',
      staves: [
        {
          id: 'staff-3',
          clef: 'treble',
          measures: [
            {
              id: 'm-strings-1',
              number: 1,
              voices: [{ id: 'v-strings-1', events: [createNoteEvent({ step: 'G', octave: 4 }, 'quarter')] }],
              chordSymbols: [],
            },
          ],
        },
      ],
    });
    score.parts[0].staves[0].measures[0].voices[0].events = [createNoteEvent({ step: 'E', octave: 4 }, 'quarter')];

    const { events } = generatePlaybackEvents(score, { expressive: false });
    expect(events.map((event) => event.midi).sort((a, b) => a - b)).toEqual([48, 64, 67]);
  });

  it('uses staff-local traversal to preserve measure timing with uneven measure counts', () => {
    const score = createScore();
    const upper = score.parts[0].staves[0];
    upper.measures = [
      {
        id: 'm1',
        number: 1,
        voices: [{ id: 'v1', events: [createNoteEvent({ step: 'C', octave: 4 }, 'quarter')] }],
        chordSymbols: [],
      },
      {
        id: 'm2',
        number: 2,
        voices: [{ id: 'v2', events: [createNoteEvent({ step: 'D', octave: 4 }, 'quarter')] }],
        chordSymbols: [],
      },
    ];

    score.parts[0].staves.push({
      id: 'lower',
      clef: 'bass',
      measures: [
        {
          id: 'm1-l',
          number: 1,
          voices: [{ id: 'v1-l', events: [createNoteEvent({ step: 'C', octave: 3 }, 'half')] }],
          chordSymbols: [],
        },
      ],
    });

    const { events } = generatePlaybackEvents(score);
    expect(events.find((event) => event.midi === 62)?.tick).toBe(480);
  });

describe('scheduler transport adapter', () => {
  class VirtualScheduler implements Scheduler {
    public queue: Array<{ id: number; atTick: number; callback: () => void }> = [];
    private nextId = 1;

    schedule(atTick: number, callback: () => void): number {
      const id = this.nextId++;
      this.queue.push({ id, atTick, callback });
      this.queue.sort((a, b) => a.atTick - b.atTick);
      return id;
    }

    clear(id: number): void {
      this.queue = this.queue.filter((item) => item.id !== id);
    }

    runAll(): void {
      const snapshot = [...this.queue];
      this.queue = [];
      for (const item of snapshot) item.callback();
    }
  }

  it('supports play/pause/stop/loop/count-in/metronome deterministically', () => {
    const score = createScore();
    const voice = score.parts[0].staves[0].measures[0].voices[0];
    voice.events = [createNoteEvent({ step: 'C', octave: 4 }, 'quarter'), createNoteEvent({ step: 'D', octave: 4 }, 'quarter')];
    const events = generatePlaybackEvents(score).events;

    const scheduler = new VirtualScheduler();
    const triggered: string[] = [];
    const transport = createSchedulerAdapter(scheduler, events, {
      onEvent: (event) => triggered.push(`note:${event.sourceEventId}`),
      onMeasure: (measureId) => triggered.push(measureId),
    });

    transport.setCountInBeats(2);
    transport.setMetronomeEnabled(true);
    transport.setLoop({ startTick: 0, endTick: 481 });
    transport.play();

    expect(transport.getState()).toBe('playing');
    expect(scheduler.queue.map((q) => q.atTick)).toEqual([0, 480, 960, 1440]);

    scheduler.runAll();
    expect(triggered.filter((t) => t.startsWith('metronome')).length).toBe(2);
    expect(triggered.filter((t) => t.startsWith('note:')).length).toBe(2);

    transport.pause();
    expect(transport.getState()).toBe('paused');
    expect(scheduler.queue).toHaveLength(0);

    transport.play();
    expect(scheduler.queue.length).toBeGreaterThan(0);
    transport.stop();
    expect(transport.getState()).toBe('stopped');
    expect(scheduler.queue).toHaveLength(0);
  });
});
