import { durationToTicks } from './model.js';
import type { PlaybackEvent, RenderingContract, Score } from './types.js';

const pitchToMidi = (step: string, octave: number, accidental = 0): number => {
  const chromatic: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (octave + 1) * 12 + (chromatic[step] ?? 0) + accidental;
};

export const linearizePlaybackEvents = (score: Score): PlaybackEvent[] => {
  const events: PlaybackEvent[] = [];
  let tick = 0;
  for (const part of score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            const durationTicks = durationToTicks(event.duration, event.dots);
            if (event.type === 'note') {
              events.push({
                sourceEventId: event.id,
                tick,
                durationTicks,
                midi: pitchToMidi(event.pitch.step, event.pitch.octave, event.pitch.accidental ?? 0),
                velocity: event.dynamics === 'ff' ? 120 : 90,
                articulationContext: [...event.articulations],
              });
            }
            tick += durationTicks;
          }
        }
      }
    }
  }
  return events;
};

export const createRenderingContract = (score: Score): RenderingContract => {
  const tokens: RenderingContract['tokens'] = [];
  const glyphs: RenderingContract['glyphs'] = [];
  let x = 10;
  for (const part of score.parts) {
    for (const staff of part.staves) {
      tokens.push({ tokenId: `${staff.id}_clef`, kind: 'clef', sourceObjectId: staff.id });
      glyphs.push({ glyph: staff.clef, x, y: 20, sourceTokenId: `${staff.id}_clef` });
      x += 20;
      for (const measure of staff.measures) {
        tokens.push({ tokenId: `${measure.id}_bar`, kind: 'barline', sourceObjectId: measure.id });
        glyphs.push({ glyph: '|', x, y: 20, sourceTokenId: `${measure.id}_bar` });
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            const tokenId = `${event.id}_token`;
            tokens.push({ tokenId, kind: event.type, sourceObjectId: event.id });
            glyphs.push({ glyph: event.type === 'note' ? '♪' : '𝄽', x: (x += 15), y: 20, sourceTokenId: tokenId });
          }
        }
        x += 10;
      }
    }
  }

  return { tokens, glyphs };
};

export interface ScorecraftJsonV1 {
  schemaVersion: '1.0.0';
  score: Score;
}

export const serializeScore = (score: Score): string => JSON.stringify({ schemaVersion: '1.0.0', score }, null, 2);

export const deserializeScore = (raw: string): Score => {
  const parsed = JSON.parse(raw) as Partial<ScorecraftJsonV1>;
  if (parsed.schemaVersion !== '1.0.0' || !parsed.score) {
    throw new Error('Unsupported schema version.');
  }
  return parsed.score;
};
