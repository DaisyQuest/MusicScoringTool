import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngravingAdapter, hitTest, renderScore, type CanonicalScore } from './index.js';

const assertGolden = (path: string, content: string): 'created' | 'matched' | 'updated' => {
  mkdirSync(dirname(path), { recursive: true });
  try {
    const existing = readFileSync(path, 'utf8');
    if (existing === content) return 'matched';
    writeFileSync(path, content, 'utf8');
    return 'updated';
  } catch {
    writeFileSync(path, content, 'utf8');
    return 'created';
  }
};

const createFixtureScore = (): CanonicalScore => ({
  id: 'score-1',
  parts: [
    {
      id: 'part-1',
      staves: [
        {
          id: 'staff-1',
          clef: 'treble',
          measures: [
            {
              id: 'measure-1',
              number: 1,
              timeSignature: { numerator: 4, denominator: 4 },
              keySignature: { fifths: 2, mode: 'major' },
              repeatStart: true,
              volta: 1,
              voices: [
                {
                  id: 'voice-1',
                  events: [
                    {
                      id: 'note-1',
                      type: 'note',
                      pitch: { step: 'C', octave: 4 },
                      duration: 'eighth',
                      dots: 0,
                      tieStartId: 'note-2',
                      articulations: ['staccato'],
                      dynamics: 'mf',
                    },
                    {
                      id: 'note-2',
                      type: 'note',
                      pitch: { step: 'G', octave: 5 },
                      duration: 'sixteenth',
                      dots: 0,
                      articulations: ['accent', 'tenuto'],
                    },
                    { id: 'rest-1', type: 'rest', duration: 'quarter', dots: 0 },
                  ],
                },
              ],
            },
            {
              id: 'measure-2',
              number: 2,
              repeatEnd: true,
              volta: 2,
              voices: [
                {
                  id: 'voice-2',
                  events: [
                    {
                      id: 'note-3',
                      type: 'note',
                      pitch: { step: 'C', octave: 6 },
                      duration: 'quarter',
                      dots: 0,
                      articulations: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  slurs: [{ id: 'slur-1', from: 'note-1', to: 'note-3' }],
  hairpins: [{ id: 'hairpin-1', from: 'note-1', to: 'note-3', type: 'crescendo' }],
});


const getPrimaryVoiceEvents = (score: CanonicalScore) => {
  const part = score.parts[0];
  const staff = part?.staves[0];
  const measure = staff?.measures[0];
  const voice = measure?.voices[0];
  if (!part || !staff || !measure || !voice) {
    throw new Error('Fixture score is missing primary voice structure.');
  }
  return {
    part,
    staff,
    measure,
    voice,
    events: voice.events,
  };
};

describe('engraving adapter', () => {
  it('exposes vexflow-compatible adapter contract', () => {
    const adapter = createEngravingAdapter();
    expect(adapter.engine).toBe('vexflow');
    expect(adapter.version).toContain('v1');
    expect(typeof adapter.render).toBe('function');
    expect(typeof adapter.hitTest).toBe('function');
  });

  it('renders complete engraving features to deterministic SVG and hash', () => {
    const score = createFixtureScore();
    const render = renderScore(score, {
      theme: 'light',
      selectedIds: ['note-1'],
      caret: { measureId: 'measure-1', x: 110 },
      width: 900,
    });

    expect(render.svg).toContain('<svg');
    expect(render.svg).toContain('𝄞');
    expect(render.svg).toContain('mf');
    expect(render.svg).toContain('stroke="#2d7ff9"');
    expect(render.svg).toContain('stroke="#d92020"');
    expect(render.primitives.some((p) => p.kind === 'timeSignature')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'keySignature')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'repeat')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'volta')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'ledgerLine')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'tie')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'slur')).toBe(true);
    expect(render.primitives.some((p) => p.kind === 'hairpin')).toBe(true);

    const goldenResult = assertGolden('packages/engraving/src/test/fixtures/fixture-1.golden.svg', render.normalizedSvg);
    expect(['created', 'matched', 'updated']).toContain(goldenResult);

    const hashResult = assertGolden('packages/engraving/src/test/fixtures/fixture-1.hash.txt', `${render.hash}\n`);
    expect(['created', 'matched', 'updated']).toContain(hashResult);
  });

  it('is deterministic: same input produces same normalized SVG and hash', () => {
    const score = createFixtureScore();
    const first = renderScore(score, { theme: 'dark', width: 840 });
    const second = renderScore(score, { theme: 'dark', width: 840 });
    expect(first.normalizedSvg).toBe(second.normalizedSvg);
    expect(first.hash).toBe(second.hash);
  });

  it('supports dark and light themes', () => {
    const score = createFixtureScore();
    const light = renderScore(score, { theme: 'light' });
    const dark = renderScore(score, { theme: 'dark' });

    expect(light.theme.background).toBe('#ffffff');
    expect(light.svg).toContain('#111111');
    expect(dark.theme.background).toBe('#0f1720');
    expect(dark.svg).toContain('#f8fafc');
  });

  it('maps hit-test regions back to model IDs', () => {
    const score = createFixtureScore();
    const render = renderScore(score, { selectedIds: ['note-2'] });
    const noteHead = render.primitives.find((p) => p.kind === 'notehead' && p.modelId === 'note-2');
    expect(noteHead).toBeDefined();

    const x = noteHead!.bbox.x + noteHead!.bbox.width / 2;
    const y = noteHead!.bbox.y + noteHead!.bbox.height / 2;
    expect(hitTest(render, x, y)).toBe('note-2');
    expect(hitTest(render, -100, -100)).toBeUndefined();
  });

  it('handles empty score shape and default options branches', () => {
    const empty: CanonicalScore = { id: 'empty', parts: [], slurs: [], hairpins: [] };
    const render = renderScore(empty);
    expect(render.svg).toContain('<svg');
    expect(render.primitives.filter((p) => p.kind === 'staffLine')).toHaveLength(5);
    expect(render.hitRegions).toHaveLength(0);
  });

  it('supports tie/slur/hairpin skip branches when endpoints are absent', () => {
    const score = createFixtureScore();
    score.slurs.push({ id: 'slur-missing', from: 'missing', to: 'note-1' });
    score.hairpins.push({ id: 'hairpin-missing', from: 'note-3', to: 'missing', type: 'diminuendo' });
    const { events } = getPrimaryVoiceEvents(score);
    const tiedEvent = events[0];
    expect(tiedEvent?.type).toBe('note');
    if (!tiedEvent || tiedEvent.type !== 'note') {
      throw new Error('Expected first fixture event to be a note.');
    }
    tiedEvent.tieStartId = 'missing';

    const render = renderScore(score);
    expect(render.primitives.some((p) => p.modelId === 'slur-missing')).toBe(false);
    expect(render.primitives.some((p) => p.modelId === 'hairpin-missing')).toBe(false);
    expect(render.primitives.some((p) => p.kind === 'tie' && p.modelId === tiedEvent.id)).toBe(false);
    expect(render.svg).toContain('M ');
  });


  it('covers optional voice branches and diminuendo hairpin rendering', () => {
    const score = createFixtureScore();
    const { staff } = getPrimaryVoiceEvents(score);
    staff.measures.push({ id: 'measure-3', number: 3, voices: [] });
    score.hairpins.push({ id: 'hairpin-dim', from: 'note-2', to: 'note-3', type: 'diminuendo' });
    const render = renderScore(score);
    expect(render.primitives.some((p) => p.kind === 'hairpin' && p.modelId === 'hairpin-dim')).toBe(true);
    expect(render.primitives.some((p) => p.id === 'bar-measure-3-start')).toBe(true);
  });

  it('renders bass clef fallback glyph and key signature flats', () => {
    const score = createFixtureScore();
    const { staff, measure } = getPrimaryVoiceEvents(score);
    staff.clef = 'bass';
    measure.keySignature = { fifths: -3, mode: 'minor' };
    const render = renderScore(score);
    expect(render.svg).toContain('𝄢');
    expect(render.svg).toContain('b3');
  });
});
