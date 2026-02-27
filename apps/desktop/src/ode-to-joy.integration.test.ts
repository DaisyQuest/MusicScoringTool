import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCommand, serializeScore, type Pitch } from '@scorecraft/core';
import { exportMidi, parseMidi } from '@scorecraft/midi';
import { renderScore } from '../../../packages/engraving/src/index.js';
import { createDesktopShell, setMode, stepInsertNote } from './index.js';
import { startDesktopServer } from './server.js';

const ODE_TO_JOY_IN_C: Pitch[] = [
  { step: 'E', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'G', octave: 4 },
  { step: 'G', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'G', octave: 4 },
  { step: 'G', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'G', octave: 3 },
  { step: 'E', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'G', octave: 4 },
  { step: 'G', octave: 4 },
  { step: 'F', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'E', octave: 4 },
  { step: 'D', octave: 4 },
  { step: 'C', octave: 4 },
  { step: 'C', octave: 4 },
];

const scoreToKey = (fifths: number) => (fifths === 0 ? 'C major' : 'E major');

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
  return { step: mapped.step, octave, accidental: mapped.accidental };
};

const writeAllExportFormats = async (basePath: string, scoreJson: string, midiBytes: Uint8Array, svg: string, normalizedSvg: string, hash: string): Promise<void> => {
  await writeFile(`${basePath}.scorecraft.json`, scoreJson, 'utf8');
  await writeFile(`${basePath}.mid`, midiBytes);
  await writeFile(`${basePath}.svg`, svg, 'utf8');
  await writeFile(`${basePath}.normalized.svg`, normalizedSvg, 'utf8');
  await writeFile(`${basePath}.sha256.txt`, `${hash}\n`, 'utf8');
};

describe('ODE TO JOY end-to-end scoring integration', () => {
  const scoresDir = join(process.cwd(), 'scores');

  afterEach(async () => {
    await rm(scoresDir, { recursive: true, force: true });
  });

  it('starts the application, scores Ode to Joy in C then E major, and exports all available formats', async () => {
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

      const variants = [
        { semitones: 0, fifths: 0 },
        { semitones: 4, fifths: 4 },
      ] as const;

      for (const variant of variants) {
        let state = setMode(
          createDesktopShell({
            title: `ODE TO JOY (${scoreToKey(variant.fifths)})`,
            partName: 'Piano',
          }),
          'note-input',
        );

        for (const pitch of ODE_TO_JOY_IN_C.map((note) => transposePitch(note, variant.semitones))) {
          state = stepInsertNote(state, pitch, 'quarter', 0);
        }

        state = {
          ...state,
          score: applyCommand(state.score, {
            type: 'setKeySignature',
            selection: state.caret.selection,
            fifths: variant.fifths,
            mode: 'major',
          }).score,
        };

        const exportedMidi = exportMidi(state.score);
        const parsedMidi = parseMidi(exportedMidi.bytes);
        expect(parsedMidi.trackCount).toBeGreaterThanOrEqual(2);
        expect(parsedMidi.tracks.some((track) => track.some((event) => event.kind === 'channel'))).toBe(true);

        const engraving = renderScore(state.score, { width: 1440, theme: 'light' });
        expect(engraving.svg).toContain('<svg');
        expect(engraving.hash).toMatch(/^[a-f0-9]{64}$/);

        const baseName = join(scoresDir, `ode-to-joy-${variant.fifths === 0 ? 'c-major' : 'e-major'}`);
        await writeAllExportFormats(
          baseName,
          serializeScore(state.score),
          exportedMidi.bytes,
          engraving.svg,
          engraving.normalizedSvg,
          engraving.hash,
        );

        for (const extension of ['scorecraft.json', 'mid', 'svg', 'normalized.svg', 'sha256.txt']) {
          const filePath = `${baseName}.${extension}`;
          const file = await stat(filePath);
          expect(file.isFile()).toBe(true);
          expect(file.size).toBeGreaterThan(0);
        }
      }

      const cMajorJson = await readFile(join(scoresDir, 'ode-to-joy-c-major.scorecraft.json'), 'utf8');
      const eMajorJson = await readFile(join(scoresDir, 'ode-to-joy-e-major.scorecraft.json'), 'utf8');
      expect(cMajorJson).toContain('"title": "ODE TO JOY (C major)"');
      expect(eMajorJson).toContain('"title": "ODE TO JOY (E major)"');
      expect(cMajorJson).not.toBe(eMajorJson);
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
