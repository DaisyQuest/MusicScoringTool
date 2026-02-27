import { cloneScore, createNoteEvent } from './model.js';
import type { Duration, EditingResult, Id, Pitch, Score, SelectionRef, VoiceEvent } from './types.js';
import { validateScore } from './validation.js';

export type Command =
  | { type: 'insertNote'; selection: SelectionRef; pitch: Pitch; duration: Duration; dots?: 0 | 1 | 2 }
  | { type: 'deleteSelection'; selection: SelectionRef }
  | { type: 'transpose'; selection: SelectionRef; semitones: number }
  | { type: 'mutateDuration'; selection: SelectionRef; duration: Duration; dots: 0 | 1 | 2 }
  | { type: 'addTie'; selection: SelectionRef; targetEventId: Id }
  | { type: 'setTempo'; selection: SelectionRef; bpm: number }
  | { type: 'setTimeSignature'; selection: SelectionRef; numerator: number; denominator: 2 | 4 | 8 | 16 }
  | { type: 'setKeySignature'; selection: SelectionRef; fifths: number; mode: 'major' | 'minor' };

const withVoice = (score: Score, selection: SelectionRef) => {
  const part = score.parts.find((p) => p.id === selection.partId);
  const staff = part?.staves.find((s) => s.id === selection.staffId);
  const measure = staff?.measures.find((m) => m.id === selection.measureId);
  const voice = measure?.voices.find((v) => v.id === selection.voiceId);
  if (!part || !staff || !measure || !voice) {
    throw new Error('Selection does not resolve to an editable voice.');
  }
  return { measure, voice };
};

const toMidi = (pitch: Pitch): number => {
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[pitch.step] + (pitch.accidental ?? 0);
  return (pitch.octave + 1) * 12 + semitone;
};

const fromMidi = (midi: number): Pitch => {
  const octave = Math.floor(midi / 12) - 1;
  const map: Record<number, { step: Pitch['step']; accidental: -1 | 0 | 1 }> = {
    0: { step: 'C', accidental: 0 },
    1: { step: 'C', accidental: 1 },
    2: { step: 'D', accidental: 0 },
    3: { step: 'E', accidental: -1 },
    4: { step: 'E', accidental: 0 },
    5: { step: 'F', accidental: 0 },
    6: { step: 'F', accidental: 1 },
    7: { step: 'G', accidental: 0 },
    8: { step: 'A', accidental: -1 },
    9: { step: 'A', accidental: 0 },
    10: { step: 'B', accidental: -1 },
    11: { step: 'B', accidental: 0 },
  };
  const mapped = map[((midi % 12) + 12) % 12] ?? { step: 'C' as const, accidental: 0 as const };
  return { step: mapped.step, octave, accidental: mapped.accidental };
};

const getEvent = (voice: { events: VoiceEvent[] }, eventId?: Id): VoiceEvent => {
  if (!eventId) throw new Error('Command requires eventId selection.');
  const event = voice.events.find((e) => e.id === eventId);
  if (!event) throw new Error('Selected event not found.');
  return event;
};

export const applyCommand = (score: Score, command: Command): EditingResult => {
  const next = cloneScore(score);
  const { measure, voice } = withVoice(next, command.selection);
  const changedObjectIds: string[] = [];

  switch (command.type) {
    case 'insertNote': {
      const event = createNoteEvent(command.pitch, command.duration, command.dots ?? 0);
      voice.events.push(event);
      changedObjectIds.push(event.id, voice.id);
      break;
    }
    case 'deleteSelection': {
      const targetId = command.selection.eventId;
      const before = voice.events.length;
      voice.events = voice.events.filter((event) => event.id !== targetId);
      if (voice.events.length === before) throw new Error('Delete operation did not match an event.');
      for (const event of voice.events) {
        if (event.type === 'note' && event.tieStartId === targetId) {
          delete event.tieStartId;
        }
        if (event.type === 'note' && event.tieEndId === targetId) {
          delete event.tieEndId;
        }
      }
      changedObjectIds.push(voice.id);
      break;
    }
    case 'transpose': {
      const event = getEvent(voice, command.selection.eventId);
      if (event.type === 'rest') throw new Error('Cannot transpose a rest.');
      if (!event.pitch.spellingLocked) {
        event.pitch = fromMidi(toMidi(event.pitch) + command.semitones);
      } else {
        event.pitch.octave += Math.floor(command.semitones / 12);
      }
      changedObjectIds.push(event.id);
      break;
    }
    case 'mutateDuration': {
      const event = getEvent(voice, command.selection.eventId);
      event.duration = command.duration;
      event.dots = command.dots;
      changedObjectIds.push(event.id);
      break;
    }
    case 'addTie': {
      const src = getEvent(voice, command.selection.eventId);
      const dst = getEvent(voice, command.targetEventId);
      if (src.type !== 'note' || dst.type !== 'note') throw new Error('Ties require note events.');
      src.tieStartId = dst.id;
      dst.tieEndId = src.id;
      changedObjectIds.push(src.id, dst.id);
      break;
    }
    case 'setTempo': {
      measure.tempoBpm = command.bpm;
      changedObjectIds.push(measure.id);
      break;
    }
    case 'setTimeSignature': {
      measure.timeSignature = { numerator: command.numerator, denominator: command.denominator };
      changedObjectIds.push(measure.id);
      break;
    }
    case 'setKeySignature': {
      measure.keySignature = { fifths: command.fifths, mode: command.mode };
      changedObjectIds.push(measure.id);
      break;
    }
    default:
      throw new Error('Unsupported command.');
  }

  const issues = validateScore(next);
  if (issues.length > 0) {
    throw new Error(`Validation failed: ${issues[0]?.code}`);
  }

  return {
    score: next,
    changedObjectIds,
    metadata: {
      commandId: command.type,
      description: `Executed ${command.type}`,
    },
  };
};

export class CommandHistory {
  private undoStack: Array<{ before: Score; after: Score; command: Command }> = [];
  private redoStack: Array<{ before: Score; after: Score; command: Command }> = [];

  execute(score: Score, command: Command): EditingResult {
    const before = cloneScore(score);
    const result = applyCommand(score, command);
    this.undoStack.push({ before, after: cloneScore(result.score), command });
    this.redoStack = [];
    return result;
  }

  undo(current: Score): Score {
    const entry = this.undoStack.pop();
    if (!entry) return current;
    this.redoStack.push({ before: cloneScore(entry.before), after: cloneScore(entry.after), command: entry.command });
    return cloneScore(entry.before);
  }

  redo(current: Score): Score {
    const entry = this.redoStack.pop();
    if (!entry) return current;
    this.undoStack.push({ before: cloneScore(entry.before), after: cloneScore(entry.after), command: entry.command });
    return cloneScore(entry.after);
  }

  getUndoDepth(): number {
    return this.undoStack.length;
  }

  getRedoDepth(): number {
    return this.redoStack.length;
  }
}
