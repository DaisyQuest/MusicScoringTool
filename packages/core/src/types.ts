export type Id = string;

export type Duration = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export interface Pitch {
  step: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  octave: number;
  accidental?: -2 | -1 | 0 | 1 | 2;
  spellingLocked?: boolean;
}

export interface NoteEvent {
  id: Id;
  type: 'note';
  duration: Duration;
  dots: 0 | 1 | 2;
  pitch: Pitch;
  tieStartId?: Id;
  tieEndId?: Id;
  articulations: Array<'staccato' | 'accent' | 'tenuto'>;
  dynamics?: 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
}

export interface RestEvent {
  id: Id;
  type: 'rest';
  duration: Duration;
  dots: 0 | 1 | 2;
}

export type VoiceEvent = NoteEvent | RestEvent;

export interface Voice {
  id: Id;
  events: VoiceEvent[];
}

export interface TimeSignature {
  numerator: number;
  denominator: 2 | 4 | 8 | 16;
}

export interface KeySignature {
  fifths: number;
  mode: 'major' | 'minor';
}

export interface Measure {
  id: Id;
  number: number;
  voices: Voice[];
  timeSignature?: TimeSignature;
  keySignature?: KeySignature;
  tempoBpm?: number;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  volta?: 1 | 2;
  navigationMarker?: 'DC' | 'DS' | 'Fine' | 'Coda';
  chordSymbols: string[];
}

export interface Staff {
  id: Id;
  clef: 'treble' | 'bass' | 'alto' | 'tenor';
  measures: Measure[];
}

export interface Part {
  id: Id;
  name: string;
  staves: Staff[];
}

export interface Score {
  id: Id;
  title: string;
  parts: Part[];
  slurs: Array<{ id: Id; from: Id; to: Id }>;
  hairpins: Array<{ id: Id; from: Id; to: Id; type: 'crescendo' | 'diminuendo' }>;
  schemaVersion: '1.0.0';
}

export interface SelectionRef {
  partId: Id;
  staffId: Id;
  measureId: Id;
  voiceId: Id;
  eventId?: Id;
}

export interface ValidationIssue {
  code:
    | 'STRUCTURE_EMPTY_PARTS'
    | 'STRUCTURE_MISSING_STAFF'
    | 'STRUCTURE_MISSING_MEASURE'
    | 'MUSICAL_INVALID_TEMPO'
    | 'MUSICAL_INVALID_TIE'
    | 'MUSICAL_DUPLICATE_ID';
  message: string;
  objectId?: Id;
}

export interface PlaybackEvent {
  sourceEventId: Id;
  tick: number;
  durationTicks: number;
  midi: number;
  velocity: number;
  articulationContext: string[];
}

export interface LayoutToken {
  tokenId: Id;
  kind: 'clef' | 'timeSignature' | 'keySignature' | 'note' | 'rest' | 'barline';
  sourceObjectId: Id;
}

export interface GlyphDirective {
  glyph: string;
  x: number;
  y: number;
  sourceTokenId: Id;
}

export interface RenderingContract {
  tokens: LayoutToken[];
  glyphs: GlyphDirective[];
}

export interface EditingResult {
  score: Score;
  changedObjectIds: Id[];
  metadata: { commandId: string; description: string };
}
