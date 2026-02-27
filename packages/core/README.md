# @scorecraft/core

Core notation semantics and editing contracts for Scorecraft.

## Command API example

```ts
const result = applyCommand(score, {
  type: 'insertNote',
  selection,
  pitch: { step: 'C', octave: 4 },
  duration: 'quarter',
});
```

## Serialization

Use `serializeScore` / `deserializeScore` for `.scorecraft.json` (`schemaVersion: 1.0.0`).

## Shared contracts

- Playback contract: `linearizePlaybackEvents(score)` returns deterministic timed note events.
- Rendering contract: `createRenderingContract(score)` returns layout tokens and glyph directives independent from rendering engine internals.
