import type { Score, ValidationIssue, VoiceEvent } from './types.js';

const collectIds = (score: Score): string[] => {
  const ids = [score.id];
  for (const part of score.parts) {
    ids.push(part.id);
    for (const staff of part.staves) {
      ids.push(staff.id);
      for (const measure of staff.measures) {
        ids.push(measure.id);
        for (const voice of measure.voices) {
          ids.push(voice.id);
          for (const event of voice.events) ids.push(event.id);
        }
      }
    }
  }
  for (const slur of score.slurs) ids.push(slur.id);
  for (const hairpin of score.hairpins) ids.push(hairpin.id);
  return ids;
};

export const validateScore = (score: Score): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (score.parts.length === 0) {
    issues.push({ code: 'STRUCTURE_EMPTY_PARTS', message: 'Score must include at least one part.' });
  }

  for (const part of score.parts) {
    if (part.staves.length === 0) {
      issues.push({ code: 'STRUCTURE_MISSING_STAFF', message: 'Part has no staves.', objectId: part.id });
    }
    for (const staff of part.staves) {
      if (staff.measures.length === 0) {
        issues.push({ code: 'STRUCTURE_MISSING_MEASURE', message: 'Staff has no measures.', objectId: staff.id });
      }
      for (const measure of staff.measures) {
        if (measure.tempoBpm !== undefined && (measure.tempoBpm < 20 || measure.tempoBpm > 300)) {
          issues.push({ code: 'MUSICAL_INVALID_TEMPO', message: 'Tempo out of range.', objectId: measure.id });
        }
      }
    }
  }

  const ids = collectIds(score);
  const dedup = new Set(ids);
  if (dedup.size !== ids.length) {
    issues.push({ code: 'MUSICAL_DUPLICATE_ID', message: 'Duplicate IDs detected.' });
  }

  const eventsById = new Map<string, VoiceEvent>();
  for (const part of score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) eventsById.set(event.id, event);
        }
      }
    }
  }

  for (const event of eventsById.values()) {
    if (event.type === 'note' && event.tieStartId) {
      const target = eventsById.get(event.tieStartId);
      if (!target || target.type !== 'note') {
        issues.push({ code: 'MUSICAL_INVALID_TIE', message: 'Tie points to invalid note.', objectId: event.id });
      }
    }
  }

  return issues;
};
