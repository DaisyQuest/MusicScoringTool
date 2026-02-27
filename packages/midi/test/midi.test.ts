import { describe, expect, it } from 'vitest';
import { applyCommand, createScore, linearizePlaybackEvents, type PlaybackEvent } from '../../core/src/index.js';
import { exportMidi, importMidiScaffold, parseMidi } from '../src/index.js';

const channelEvents = (statusHighNibble: number, track: ReturnType<typeof parseMidi>['tracks'][number]) =>
  track.filter((event) => event.kind === 'channel' && ((event.status ?? 0) & 0xf0) === statusHighNibble);

describe('midi export', () => {
  it('exports type 1 MIDI with track-per-part and parse-back structure', () => {
    const score = createScore('Suite');
    score.parts.push({
      id: 'part_bass',
      name: 'Bass',
      staves: [
        {
          id: 'staff_bass',
          clef: 'bass',
          measures: [
            {
              id: 'm_bass_1',
              number: 1,
              voices: [{ id: 'v_bass_1', events: [] }],
              chordSymbols: [],
            },
          ],
        },
      ],
    });

    const lead = score.parts[0].staves[0].measures[0].voices[0];
    const bass = score.parts[1].staves[0].measures[0].voices[0];
    lead.events.push({
      id: 'lead_note',
      type: 'note',
      duration: 'quarter',
      dots: 0,
      pitch: { step: 'C', octave: 4 },
      articulations: [],
    });
    bass.events.push({
      id: 'bass_note',
      type: 'note',
      duration: 'half',
      dots: 0,
      pitch: { step: 'E', octave: 2 },
      articulations: [],
    });

    const result = exportMidi(score);
    const parsed = parseMidi(result.bytes);

    expect(result.format).toBe('SMF1');
    expect(parsed.format).toBe(1);
    expect(parsed.trackCount).toBe(3);
    expect(parsed.tracks).toHaveLength(3);
    expect(channelEvents(0xc0, parsed.tracks[1])).toHaveLength(1);
    expect(channelEvents(0xc0, parsed.tracks[2])).toHaveLength(1);
  });

  it('writes tempo/time/key metadata including mid-score signature changes and pickup measure offsets', () => {
    const score = createScore('Meta');
    const staff = score.parts[0].staves[0];
    staff.measures = [
      {
        id: 'm1',
        number: 1,
        voices: [
          {
            id: 'v1',
            events: [
              { id: 'n_pickup', type: 'note', duration: 'eighth', dots: 0, pitch: { step: 'G', octave: 4 }, articulations: [] },
            ],
          },
        ],
        timeSignature: { numerator: 4, denominator: 4 },
        keySignature: { fifths: 0, mode: 'major' },
        tempoBpm: 110,
        chordSymbols: [],
      },
      {
        id: 'm2',
        number: 2,
        voices: [
          {
            id: 'v2',
            events: [
              { id: 'n_full', type: 'note', duration: 'whole', dots: 0, pitch: { step: 'C', octave: 5 }, articulations: [] },
            ],
          },
        ],
        timeSignature: { numerator: 3, denominator: 4 },
        keySignature: { fifths: 2, mode: 'major' },
        tempoBpm: 90,
        chordSymbols: [],
      },
    ];

    const parsed = parseMidi(exportMidi(score).bytes);
    const meta = parsed.tracks[0].filter((event) => event.kind === 'meta');

    const tempos = meta.filter((event) => event.metaType === 0x51);
    const timeSigs = meta.filter((event) => event.metaType === 0x58);
    const keySigs = meta.filter((event) => event.metaType === 0x59);

    expect(tempos.map((event) => event.absoluteTick)).toEqual([0, 240]);
    expect(timeSigs.map((event) => event.absoluteTick)).toEqual([0, 240]);
    expect(keySigs.map((event) => event.absoluteTick)).toEqual([0, 240]);
  });

  it('merges tie chains into one long note duration and keeps chord/voice overlap ordering tick-accurate', () => {
    const score = createScore('Ties');
    const measure = score.parts[0].staves[0].measures[0];
    measure.voices.push({
      id: 'voice_b',
      events: [
        { id: 'v2_c4', type: 'note', duration: 'half', dots: 0, pitch: { step: 'C', octave: 4 }, articulations: [] },
        { id: 'v2_c5', type: 'note', duration: 'half', dots: 0, pitch: { step: 'C', octave: 5 }, articulations: [] },
      ],
    });

    const voiceA = measure.voices[0];
    voiceA.events.push(
      {
        id: 'tie_1',
        type: 'note',
        duration: 'quarter',
        dots: 0,
        pitch: { step: 'D', octave: 4 },
        tieStartId: 'tie_2',
        articulations: [],
      },
      {
        id: 'tie_2',
        type: 'note',
        duration: 'quarter',
        dots: 0,
        pitch: { step: 'D', octave: 4 },
        tieEndId: 'tie_1',
        articulations: [],
      },
    );

    const track = parseMidi(exportMidi(score).bytes).tracks[1];
    const noteOns = channelEvents(0x90, track);
    const noteOffs = channelEvents(0x80, track);

    const d4On = noteOns.find((event) => event.data[0] === 62);
    const d4Off = noteOffs.find((event) => event.data[0] === 62);
    expect(d4On?.absoluteTick).toBe(0);
    expect(d4Off?.absoluteTick).toBe(960);

    const sameTickStatuses = track
      .filter((event) => event.kind === 'channel' && event.absoluteTick === 960)
      .map((event) => event.status ?? 0);
    expect(sameTickStatuses[0] & 0xf0).toBe(0x80);
    expect(sameTickStatuses[1] & 0xf0).toBe(0x80);
    expect(sameTickStatuses[2] & 0xf0).toBe(0x90);
  });

  it('supports explicit program/channel mapping and playback-stream parity + deterministic humanization', () => {
    const score = createScore('PlaybackParity');
    const part = score.parts[0];
    const staff = part.staves[0];
    const measure = staff.measures[0];
    const voice = measure.voices[0];
    const selection = { partId: part.id, staffId: staff.id, measureId: measure.id, voiceId: voice.id };

    let current = applyCommand(score, { type: 'insertNote', selection, pitch: { step: 'C', octave: 4 }, duration: 'quarter' }).score;
    current = applyCommand(current, { type: 'insertNote', selection, pitch: { step: 'E', octave: 4 }, duration: 'quarter' }).score;

    const playback = linearizePlaybackEvents(current);
    const mapping = { [part.id]: { channel: 5, program: 40 } };

    const exported = exportMidi(current, { usePlaybackEvents: playback, partChannelMapping: mapping });
    const parsed = parseMidi(exported.bytes);
    const track = parsed.tracks[1];

    const programChange = channelEvents(0xc0, track)[0];
    expect(programChange.status).toBe(0xc5);
    expect(programChange.data[0]).toBe(40);

    const noteOnTicks = channelEvents(0x90, track).map((event) => event.absoluteTick);
    expect(noteOnTicks).toEqual(playback.map((event) => event.tick));

    const humanizedA = parseMidi(
      exportMidi(current, {
        usePlaybackEvents: playback,
        humanize: { seed: 42, maxTickOffset: 8, velocityJitter: 10 },
      }).bytes,
    );
    const humanizedB = parseMidi(
      exportMidi(current, {
        usePlaybackEvents: playback,
        humanize: { seed: 42, maxTickOffset: 8, velocityJitter: 10 },
      }).bytes,
    );

    const humanizedTicksA = channelEvents(0x90, humanizedA.tracks[1]).map((event) => event.absoluteTick);
    const humanizedTicksB = channelEvents(0x90, humanizedB.tracks[1]).map((event) => event.absoluteTick);
    expect(humanizedTicksA).toEqual(humanizedTicksB);
    expect(humanizedTicksA).not.toEqual(playback.map((event) => event.tick));
  });
});

describe('midi parse/import scaffolding', () => {
  it('parses running status channel events and scaffold warnings', () => {
    // Header + one track: note-on with running status reuse.
    const raw = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x80, 0x20, // format 0, one track, SMPTE-like division
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 0x0b,
      0x00, 0x90, 60, 100,
      0x0a, 64, 120,
      0x00, 0xff, 0x2f, 0x00,
    ]);

    const parsed = parseMidi(raw);
    expect(parsed.format).toBe(0);
    const channel = parsed.tracks[0].filter((event) => event.kind === 'channel');
    expect(channel).toHaveLength(2);
    expect(channel[1].status).toBe(0x90);

    const scaffold = importMidiScaffold(raw);
    expect(scaffold.warnings).toContain('Only format 1 is fully supported.');
    expect(scaffold.warnings).toContain('SMPTE time division detected; PPQ expected.');
  });

  it('fails on invalid midi chunks', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3]))).toThrow();

    const badHeaderLength = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 7, 0, 1, 0, 0, 1, 0xe0,
    ]);
    expect(() => parseMidi(badHeaderLength)).toThrow('Unsupported MIDI header length.');

    const badTrackChunk = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(() => parseMidi(badTrackChunk)).toThrow('Invalid MIDI track chunk.');
  });

  it('handles sysex parsing branch', () => {
    const midi = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 0x09,
      0x00, 0xf0, 0x02, 0x7d, 0x01,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const parsed = parseMidi(midi);
    expect(parsed.tracks[0][0].kind).toBe('sysex');
    expect(parsed.tracks[0][0].data).toEqual(new Uint8Array([0x7d, 0x01]));
  });

  it('humanization clamps negative ticks and velocity range', () => {
    const score = createScore();
    const noteId = 'n_humanize';
    score.parts[0].staves[0].measures[0].voices[0].events.push({
      id: noteId,
      type: 'note',
      duration: 'quarter',
      dots: 0,
      pitch: { step: 'E', octave: 4 },
      articulations: [],
    });
    const playback: PlaybackEvent[] = [
      { sourceEventId: noteId, tick: 0, durationTicks: 120, midi: 64, velocity: 127, articulationContext: [] },
    ];

    const track = parseMidi(
      exportMidi(score, { usePlaybackEvents: playback, humanize: { seed: 1, maxTickOffset: 999, velocityJitter: 999 } }).bytes,
    ).tracks[1];
    const noteOn = channelEvents(0x90, track)[0];
    expect(noteOn.absoluteTick).toBeGreaterThanOrEqual(0);
    expect(noteOn.data[1]).toBeGreaterThanOrEqual(1);
    expect(noteOn.data[1]).toBeLessThanOrEqual(127);
  });
});
