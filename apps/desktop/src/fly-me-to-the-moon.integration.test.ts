import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCommand, serializeScore, type Duration, type Pitch } from '@scorecraft/core';
import { exportMidi, parseMidi } from '@scorecraft/midi';
import { renderScore } from '@scorecraft/engraving';
import {
  addMeasure,
  applyArticulationEdits,
  applyInspectorEdits,
  applyTextSymbolEdits,
  createDesktopShell,
  setMode,
  stepInsertNote,
} from './index.js';
import { startDesktopServer } from './server.js';

type PhraseEvent = {
  pitch: Pitch;
  duration: Duration;
  dots?: 0 | 1 | 2;
};

const FLY_ME_TO_THE_MOON_PHRASE: PhraseEvent[] = [
  { pitch: { step: 'A', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'G', octave: 4 }, duration: 'eighth' },
  { pitch: { step: 'F', octave: 4 }, duration: 'eighth' },
  { pitch: { step: 'E', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'D', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'C', octave: 4 }, duration: 'half' },
  { pitch: { step: 'D', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'E', octave: 4 }, duration: 'eighth' },
  { pitch: { step: 'F', octave: 4 }, duration: 'eighth' },
  { pitch: { step: 'G', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'A', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'B', octave: 4 }, duration: 'half' },
  { pitch: { step: 'C', octave: 5 }, duration: 'quarter' },
  { pitch: { step: 'A', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'F', octave: 4 }, duration: 'quarter' },
  { pitch: { step: 'E', octave: 4 }, duration: 'quarter', dots: 1 },
];

const transposePitch = (pitch: Pitch, semitones: number): Pitch => {
  const chromatic: Record<Pitch['step'], number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (pitch.octave + 1) * 12 + chromatic[pitch.step] + (pitch.accidental ?? 0) + semitones;
  const octave = Math.floor(midi / 12) - 1;
  const map: Record<number, Pick<Pitch, 'step' | 'accidental'>> = {
    0: { step: 'C', accidental: 0 },
    1: { step: 'C', accidental: 1 },
    2: { step: 'D', accidental: 0 },
    3: { step: 'D', accidental: 1 },
    4: { step: 'E', accidental: 0 },
    5: { step: 'F', accidental: 0 },
    6: { step: 'F', accidental: 1 },
    7: { step: 'G', accidental: 0 },
    8: { step: 'G', accidental: 1 },
    9: { step: 'A', accidental: 0 },
    10: { step: 'A', accidental: 1 },
    11: { step: 'B', accidental: 0 },
  };
  const mapped = map[((midi % 12) + 12) % 12] ?? { step: 'C', accidental: 0 };
  return mapped.accidental === 0
    ? { step: mapped.step, octave }
    : { step: mapped.step, octave, accidental: mapped.accidental };
};

const writeAllExportFormats = async (basePath: string, scoreJson: string, midiBytes: Uint8Array, svg: string, normalizedSvg: string, hash: string): Promise<void> => {
  await writeFile(`${basePath}.scorecraft.json`, scoreJson, 'utf8');
  await writeFile(`${basePath}.mid`, midiBytes);
  await writeFile(`${basePath}.svg`, svg, 'utf8');
  await writeFile(`${basePath}.normalized.svg`, normalizedSvg, 'utf8');
  await writeFile(`${basePath}.sha256.txt`, `${hash}\n`, 'utf8');
};

describe('FLY ME TO THE MOON complex end-to-end integration', () => {
  const scoresDir = join(process.cwd(), 'scores');

  afterEach(async () => {
    await rm(scoresDir, { recursive: true, force: true });
  });

  it('composes an intricate solo piano arrangement and exports score, MIDI, and engraving artifacts', async () => {
    const desktopServer = await startDesktopServer(0);
    try {
      const address = desktopServer.server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP server address.');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Scorecraft Desktop');

      await mkdir(scoresDir, { recursive: true });

      let state = setMode(
        createDesktopShell({
          title: 'Fly Me to the Moon (Solo Piano - Intricate Arrangement)',
          partName: 'Solo Piano',
        }),
        'note-input',
      );

      for (let measureNumber = 2; measureNumber <= 8; measureNumber += 1) {
        state = addMeasure(state);
      }

      const staff = state.score.parts[0]!.staves[0]!;
      const melodyByMeasure = [
        FLY_ME_TO_THE_MOON_PHRASE.slice(0, 2),
        FLY_ME_TO_THE_MOON_PHRASE.slice(2, 4),
        FLY_ME_TO_THE_MOON_PHRASE.slice(4, 6),
        FLY_ME_TO_THE_MOON_PHRASE.slice(6, 8),
        FLY_ME_TO_THE_MOON_PHRASE.slice(8, 10),
        FLY_ME_TO_THE_MOON_PHRASE.slice(10, 12),
        FLY_ME_TO_THE_MOON_PHRASE.slice(12, 14),
        FLY_ME_TO_THE_MOON_PHRASE.slice(14, 16),
      ];

      const harmonySymbols = ['Am7', 'Dm7', 'G7', 'Cmaj7', 'Fmaj7', 'Bø7', 'E7', 'Am6'];
      const navigationMarkers: Array<'DC' | 'DS' | 'Fine' | 'Coda' | undefined> = [undefined, undefined, undefined, 'Fine', undefined, undefined, 'Coda', 'DC'];

      for (let index = 0; index < staff.measures.length; index += 1) {
        const targetMeasure = staff.measures[index]!;
        const targetVoice = targetMeasure.voices[0]!;
        state = {
          ...state,
          caret: {
            ...state.caret,
            selection: {
              ...state.caret.selection,
              measureId: targetMeasure.id,
              voiceId: targetVoice.id,
            },
            eventIndex: 0,
          },
        };

        state = {
          ...state,
          score: applyCommand(state.score, {
            type: 'setTimeSignature',
            selection: state.caret.selection,
            numerator: 4,
            denominator: 4,
          }).score,
        };

        state = {
          ...state,
          score: applyCommand(state.score, {
            type: 'setKeySignature',
            selection: state.caret.selection,
            fifths: 0,
            mode: 'major',
          }).score,
        };

        state = {
          ...state,
          score: applyCommand(state.score, {
            type: 'setTempo',
            selection: state.caret.selection,
            bpm: 126 - index,
          }).score,
        };

        const measureEvents = melodyByMeasure[index] ?? [];
        for (const event of measureEvents) {
          state = stepInsertNote(state, transposePitch(event.pitch, index % 2 === 0 ? 0 : -12), event.duration, event.dots ?? 0);
        }

        state = applyInspectorEdits(state, {
          dynamics: index % 2 === 0 ? 'mf' : 'mp',
          repeatStart: index === 0,
          repeatEnd: index === staff.measures.length - 1,
        });

        state = applyArticulationEdits(state, index % 2 === 0 ? 'tenuto' : 'staccato');

        state = applyTextSymbolEdits(state, {
          chordSymbol: harmonySymbols[index],
          navigationMarker: navigationMarkers[index],
        });
      }

      const scoreJson = serializeScore(state.score);
      const midi = exportMidi(state.score);
      const parsedMidi = parseMidi(midi.bytes);
      const engraving = renderScore(state.score, { width: 1800, theme: 'light' });

      expect(scoreJson).toContain('Fly Me to the Moon');
      expect(scoreJson).toContain('"name": "Solo Piano"');
      expect(parsedMidi.trackCount).toBeGreaterThanOrEqual(2);
      expect(parsedMidi.tracks.flat().some((event) => event.kind === 'meta')).toBe(true);
      expect(parsedMidi.tracks.flat().some((event) => event.kind === 'channel')).toBe(true);
      expect(engraving.svg).toContain('<svg');
      expect(engraving.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(engraving.normalizedSvg.length).toBeGreaterThan(100);

      const noteCount = state.score.parts[0]!.staves[0]!.measures
        .flatMap((measure) => measure.voices[0]?.events ?? [])
        .filter((event) => event.type === 'note').length;
      expect(noteCount).toBe(16);

      const baseName = join(scoresDir, 'fly-me-to-the-moon-solo-piano');
      await writeAllExportFormats(baseName, scoreJson, midi.bytes, engraving.svg, engraving.normalizedSvg, engraving.hash);

      for (const extension of ['scorecraft.json', 'mid', 'svg', 'normalized.svg', 'sha256.txt']) {
        const filePath = `${baseName}.${extension}`;
        const file = await stat(filePath);
        expect(file.isFile()).toBe(true);
        expect(file.size).toBeGreaterThan(0);
      }

      const persistedScoreJson = await readFile(`${baseName}.scorecraft.json`, 'utf8');
      const persistedHash = await readFile(`${baseName}.sha256.txt`, 'utf8');
      expect(persistedScoreJson).toContain('Fly Me to the Moon');
      expect(persistedScoreJson).toContain('Am7');
      expect(persistedScoreJson).toContain('Coda');
      expect(persistedHash.trim()).toBe(engraving.hash);
    } finally {
      await new Promise<void>((resolve, reject) => {
        desktopServer.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
