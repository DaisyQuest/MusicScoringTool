import { applyCommand } from './commands.js';
import { createRenderingContract, linearizePlaybackEvents } from './contracts.js';
import { createScore, resetIdCounter } from './model.js';

export const runThinSlice = () => {
  resetIdCounter();
  let score = createScore('Thin Slice');
  const part = score.parts[0]!;
  const staff = part!.staves[0];
  const measure = staff!.measures[0];
  const voice = measure!.voices[0];

  const insert = applyCommand(score, {
    type: 'insertNote',
    selection: { partId: part.id, staffId: staff!.id, measureId: measure!.id, voiceId: voice!.id },
    pitch: { step: 'C', octave: 4 },
    duration: 'quarter',
  });
  score = insert.score;

  return {
    score,
    rendering: createRenderingContract(score),
    playback: linearizePlaybackEvents(score),
  };
};
