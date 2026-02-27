import { durationToTicks } from './model.js';
import type { Measure, NoteEvent, PlaybackEvent, Score, VoiceEvent } from './types.js';

const DYNAMIC_VELOCITY: Record<NonNullable<NoteEvent['dynamics']>, number> = {
  pp: 36,
  p: 52,
  mp: 68,
  mf: 84,
  f: 102,
  ff: 118,
};

const pitchToMidi = (step: string, octave: number, accidental = 0): number => {
  const chromatic: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (octave + 1) * 12 + (chromatic[step] ?? 0) + accidental;
};

export interface MeasureVisit {
  measureId: string;
  pass: number;
}

export interface ResolverResult {
  order: MeasureVisit[];
  terminatedBy: 'end_of_score' | 'fine' | 'safety_limit';
}

interface TraversalState {
  idx: number;
  repeatStartIdx: number;
  repeatedRanges: Set<string>;
  secondPassRange: { start: number; end: number } | undefined;
  jumpedDaCapo: boolean;
  jumpedDaSegno: boolean;
  inJumpSection: boolean;
}

const resolveDaSegnoTarget = (measures: Measure[], instructionIdx: number): number => {
  const earlierSegno = measures.findIndex((m, idx) => idx < instructionIdx && m.navigationMarker === 'DS');
  return earlierSegno >= 0 ? earlierSegno : 0;
};

export const resolveMeasureTraversal = (measures: Measure[], maxVisits = 2048): ResolverResult => {
  if (measures.length === 0) {
    return { order: [], terminatedBy: 'end_of_score' };
  }

  const state: TraversalState = {
    idx: 0,
    repeatStartIdx: 0,
    repeatedRanges: new Set<string>(),
    secondPassRange: undefined,
    jumpedDaCapo: false,
    jumpedDaSegno: false,
    inJumpSection: false,
  };

  const order: MeasureVisit[] = [];
  let pass = 1;
  let visits = 0;

  while (state.idx < measures.length) {
    visits += 1;
    if (visits > maxVisits) {
      return { order, terminatedBy: 'safety_limit' };
    }

    const measure = measures[state.idx];
    if (!measure) break;

    if (measure.volta === 1 && state.secondPassRange && state.idx >= state.secondPassRange.start && state.idx <= state.secondPassRange.end) {
      state.idx += 1;
      continue;
    }

    order.push({ measureId: measure.id, pass });

    if (state.inJumpSection && measure.navigationMarker === 'Fine') {
      return { order, terminatedBy: 'fine' };
    }

    if (measure.repeatStart) {
      state.repeatStartIdx = state.idx;
    }

    if (measure.repeatEnd) {
      const rangeKey = `${state.repeatStartIdx}:${state.idx}`;
      if (!state.repeatedRanges.has(rangeKey)) {
        state.repeatedRanges.add(rangeKey);
        state.secondPassRange = { start: state.repeatStartIdx, end: state.idx };
        pass += 1;
        state.idx = state.repeatStartIdx;
        continue;
      }
      state.secondPassRange = undefined;
    }

    if (measure.navigationMarker === 'DC' && !state.jumpedDaCapo) {
      state.jumpedDaCapo = true;
      state.inJumpSection = true;
      pass += 1;
      state.idx = 0;
      continue;
    }

    if (measure.navigationMarker === 'DS' && state.idx > 0 && !state.jumpedDaSegno) {
      state.jumpedDaSegno = true;
      state.inJumpSection = true;
      pass += 1;
      state.idx = resolveDaSegnoTarget(measures, state.idx);
      continue;
    }

    state.idx += 1;
  }

  return { order, terminatedBy: 'end_of_score' };
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const articulationShape = (event: NoteEvent): { durationScale: number; velocityDelta: number; timingOffsetTicks: number } => {
  let durationScale = 1;
  let velocityDelta = 0;
  let timingOffsetTicks = 0;

  if (event.articulations.includes('staccato')) {
    durationScale *= 0.55;
  }
  if (event.articulations.includes('tenuto')) {
    durationScale *= 1.08;
    timingOffsetTicks -= 2;
  }
  if (event.articulations.includes('accent')) {
    velocityDelta += 10;
  }

  return { durationScale, velocityDelta, timingOffsetTicks };
};

const buildHairpinVelocityOffsets = (score: Score): Map<string, number> => {
  const offsets = new Map<string, number>();
  for (const hairpin of score.hairpins) {
    const events: string[] = [];
    for (const part of score.parts) {
      for (const staff of part.staves) {
        for (const measure of staff.measures) {
          for (const voice of measure.voices) {
            for (const event of voice.events) {
              events.push(event.id);
            }
          }
        }
      }
    }
    const from = events.indexOf(hairpin.from);
    const to = events.indexOf(hairpin.to);
    if (from < 0 || to < 0 || to <= from) continue;

    const span = to - from;
    for (let i = from; i <= to; i += 1) {
      const progress = (i - from) / span;
      const amount = Math.round(progress * 16);
      const eventId = events[i];
      if (!eventId) continue;
      offsets.set(eventId, hairpin.type === 'crescendo' ? amount : -amount);
    }
  }
  return offsets;
};

export const generatePlaybackEvents = (
  score: Score,
  options: { expressive?: boolean; maxVisits?: number } = {},
): { events: PlaybackEvent[]; traversal: ResolverResult } => {
  const expressive = options.expressive ?? false;
  const events: PlaybackEvent[] = [];
  const hairpinOffsets = expressive ? buildHairpinVelocityOffsets(score) : new Map<string, number>();
  const globalTraversal: ResolverResult = { order: [], terminatedBy: 'end_of_score' };

  for (const part of score.parts) {
    for (const staff of part.staves) {
      const traversal = resolveMeasureTraversal(staff.measures, options.maxVisits);
      if (globalTraversal.order.length === 0 || traversal.order.length > globalTraversal.order.length) {
        globalTraversal.order = traversal.order;
        globalTraversal.terminatedBy = traversal.terminatedBy;
      }

      for (let visitIndex = 0; visitIndex < traversal.order.length; visitIndex += 1) {
        const visit = traversal.order[visitIndex];
        const measure = staff.measures.find((m) => m.id === visit.measureId);
        if (!measure) continue;

        for (const voice of measure.voices) {
          let localTick = 0;
          const measureStartTick = traversal.order
            .slice(0, visitIndex)
            .reduce((acc, priorVisit) => {
              const priorMeasure = staff.measures.find((m) => m.id === priorVisit.measureId);
              if (!priorMeasure) return acc;
              const maxVoiceTicks = priorMeasure.voices.reduce((voiceMax, priorVoice) => {
                const voiceTicks = priorVoice.events.reduce((voiceAcc, event) => voiceAcc + durationToTicks(event.duration, event.dots), 0);
                return Math.max(voiceMax, voiceTicks);
              }, 0);
              return acc + maxVoiceTicks;
            }, 0);

          for (const event of voice.events) {
            const durationTicks = durationToTicks(event.duration, event.dots);
            if (event.type === 'note') {
              const articulation = expressive ? articulationShape(event) : { durationScale: 1, velocityDelta: 0, timingOffsetTicks: 0 };
              const baseVelocity = event.dynamics ? DYNAMIC_VELOCITY[event.dynamics] : 84;
              const hairpinBoost = expressive ? hairpinOffsets.get(event.id) ?? 0 : 0;
              events.push({
                sourceEventId: event.id,
                tick: measureStartTick + localTick + articulation.timingOffsetTicks,
                durationTicks: Math.max(1, Math.round(durationTicks * articulation.durationScale)),
                midi: pitchToMidi(event.pitch.step, event.pitch.octave, event.pitch.accidental ?? 0),
                velocity: clamp(baseVelocity + articulation.velocityDelta + hairpinBoost, 1, 127),
                articulationContext: [...event.articulations],
              });
            }
            localTick += durationTicks;
          }
        }
      }
    }
  }

  events.sort((a, b) => a.tick - b.tick || a.sourceEventId.localeCompare(b.sourceEventId));
  return { events, traversal: globalTraversal };
};

export interface Scheduler {
  schedule(atTick: number, callback: () => void): number;
  clear(id: number): void;
}

export interface TransportControls {
  play(): void;
  pause(): void;
  stop(): void;
  setLoop(range?: { startTick: number; endTick: number }): void;
  setCountInBeats(beats: number): void;
  setMetronomeEnabled(enabled: boolean): void;
  getState(): 'stopped' | 'playing' | 'paused';
}

export const createSchedulerAdapter = (
  scheduler: Scheduler,
  events: PlaybackEvent[],
  hooks: { onEvent?: (event: PlaybackEvent) => void; onMeasure?: (measureId: string) => void } = {},
): TransportControls => {
  let state: 'stopped' | 'playing' | 'paused' = 'stopped';
  let pending: number[] = [];
  let loopRange: { startTick: number; endTick: number } | undefined;
  let countInBeats = 0;
  let metronome = false;

  const clearPending = () => {
    for (const id of pending) scheduler.clear(id);
    pending = [];
  };

  const scheduleAll = () => {
    const beatTicks = 480;
    for (let beat = 0; beat < countInBeats; beat += 1) {
      if (metronome) {
        pending.push(scheduler.schedule(beat * beatTicks, () => hooks.onMeasure?.(`metronome:${beat + 1}`)));
      }
    }

    const offset = countInBeats * beatTicks;
    for (const event of events) {
      if (loopRange && (event.tick < loopRange.startTick || event.tick >= loopRange.endTick)) continue;
      pending.push(scheduler.schedule(offset + event.tick, () => hooks.onEvent?.(event)));
    }
  };

  return {
    play() {
      if (state === 'playing') return;
      state = 'playing';
      clearPending();
      scheduleAll();
    },
    pause() {
      if (state !== 'playing') return;
      state = 'paused';
      clearPending();
    },
    stop() {
      state = 'stopped';
      clearPending();
    },
    setLoop(range) {
      loopRange = range;
    },
    setCountInBeats(beats) {
      countInBeats = Math.max(0, beats);
    },
    setMetronomeEnabled(enabled) {
      metronome = enabled;
    },
    getState() {
      return state;
    },
  };
};
