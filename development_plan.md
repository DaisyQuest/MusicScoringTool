# Scorecraft Development Plan (Parallelized for 5 Agents)

## 1) Purpose and planning assumptions

This plan translates `Spec.md` into an execution roadmap that can be split across **five parallel implementation agents** after a shared foundation is established.

Assumptions:
- We are delivering **Phase 1 (MVP editor + MIDI)** first, while designing interfaces that do not block Phase 2/3 extensions.
- The repository will become a monorepo aligned with the spec (`apps/desktop`, `packages/core`, `packages/engraving`, `packages/midi`, `packages/ui`).
- All agents share a single source of truth in `packages/core` for notation semantics.
- We optimize for:
  1. Correctness and deterministic behavior,
  2. Keyboard-first UX,
  3. High confidence through broad automated testing.

---

## 2) Pre-parallelization: Shared interfaces/core bootstrap (Gate 0)

Before parallel work starts, create and stabilize the cross-package contracts.

### 2.1 Deliverables

1. **Monorepo scaffolding + toolchain**
   - Package manager + workspace config.
   - TypeScript project references.
   - Linting/formatting rules.
   - Test runners configured for unit/integration/e2e layers.

2. **Core data model (`packages/core`)**
   - Strongly-typed entities for:
     - Score, Part, Staff, Measure,
     - Voice, Chord/Note/Rest events,
     - Clef, key/time signatures,
     - Articulations, dynamics, hairpins,
     - Slurs/ties,
     - Repeats/voltas/navigation markers,
     - Tempo map,
     - Chord symbols.
   - Stable IDs for every addressable object.
   - Serialization schema (`.scorecraft.json`) with explicit versioning.

3. **Shared command/event interfaces**
   - Editing command API (insert note, delete selection, transpose, add tie, etc.).
   - Undo/redo command metadata contract.
   - Playback event stream contract (linearized events with timing, pitch, velocity, articulation context).
   - Rendering contract (layout tokens and glyph directives independent from VexFlow implementation details).

4. **Validation + invariants framework**
   - Structural and musical validation rules with machine-readable error codes.
   - Branch-safe helpers for transforming score state without invalid intermediate states.

5. **Test harness foundation**
   - Fixtures for canonical musical examples.
   - Deterministic clock/time abstractions for playback tests.
   - Golden-file helpers for MIDI/SVG expectations.

### 2.2 Gate 0 exit criteria

Parallel work begins only when:
- All core interfaces are documented with examples and reviewed.
- Core model round-trip serialization tests pass.
- At least one end-to-end “thin slice” works:
  - Create score -> insert notes -> render simple stave -> play/export basic MIDI.
- CI is green with branch coverage thresholds enabled.

---

## 3) Parallelization model across five agents

After Gate 0, use five streams with explicit boundaries and integration touchpoints.

- **Agent 1 — Core Notation Engine & Editing Semantics**
- **Agent 2 — Engraving/Rendering Pipeline (VexFlow Adapter)**
- **Agent 3 — Playback Engine & Repeat Resolver**
- **Agent 4 — MIDI Export/Import Layer**
- **Agent 5 — Desktop UX Shell, Interaction, and Workflow Integration**

A rotating integration owner (weekly) handles conflict resolution and interface drift.

---

## 4) Agent workstreams in detail

## Agent 1: Core Notation Engine & Editing Semantics

### Scope
- Own `packages/core` evolution after Gate 0.
- Implement command handlers and transformation logic for note entry/editing.
- Own undo/redo command stack semantics.
- Implement pitch spelling behavior (with user override persistence).

### Primary milestones
1. Step-entry command set (duration, pitch, accidental, dot, tie).
2. Selection editing commands (copy/paste, transpose, duration mutation).
3. Relationships (tie/slur links) and validation.
4. Signatures and tempo changes at measure positions.
5. Repeat/navigation model support (structural representation only; playback expansion delegated to Agent 3).

### Test responsibilities (high rigor)
- Property-based tests for transformation invariants.
- Branch-complete tests for each command:
  - valid input,
  - boundary conditions,
  - invalid state rejection,
  - undo/redo reversibility.
- Snapshot tests for serialized score diffs.

### Dependencies
- Consumes Gate 0 interfaces; exposes stable APIs to all agents.

---

## Agent 2: Engraving/Rendering Pipeline (VexFlow Adapter)

### Scope
- Own `packages/engraving`.
- Convert canonical core model to renderable score layout and VexFlow primitives.
- Build hit-testing map from rendered glyphs back to model IDs.
- Support dark/light rendering themes and crisp SVG output.

### Primary milestones
1. Staff system, clefs, key/time signature rendering.
2. Note/rest rendering with ledger lines, stems, beams (MVP automatic).
3. Articulations/dynamics/hairpins/slurs/ties visual mapping.
4. Repeat symbols and volta bracket rendering.
5. Selection overlays + caret visuals for keyboard-first editing.

### Test responsibilities
- Golden SVG structure tests for canonical fixtures.
- Layout determinism tests (same input -> same normalized SVG structure/hash).
- Hit-test mapping tests (pixel/cell region -> expected model ID).
- Visual regression subset for critical engraving scenarios.

### Dependencies
- Uses core model from Agent 1.
- Provides render hooks and interaction geometry to Agent 5.

---

## Agent 3: Playback Engine & Repeat Resolver

### Scope
- Own playback logic (likely in `packages/core` playback submodule or dedicated playback package).
- Build deterministic measure traversal resolver supporting:
  - repeat start/end,
  - 1st/2nd endings,
  - D.C./D.S./Fine/Coda flow.
- Map dynamics/articulations/hairpins to expressive playback parameters.
- Integrate scheduling adapter for Tone.js in renderer environment.

### Primary milestones
1. Strict (literal) playback event generation.
2. Repeat/navigation resolver implementation.
3. Expressive playback layer (velocity/duration/timing shaping).
4. Transport controls: play/pause/stop/loop/count-in/metronome behavior.
5. Runtime sync hooks for caret-follow and measure highlighting.

### Test responsibilities
- Exhaustive scenario matrix for playback order and loop termination (avoid infinite traversal).
- Tick-level assertions for event timing and durations.
- Dynamics/articulation interpretation tests with tolerance envelopes.
- Deterministic scheduler tests using virtual clock.

### Dependencies
- Consumes event model from Agent 1.
- Shares output contracts with Agent 4 (MIDI) for consistency.
- Integrates UI transport with Agent 5.

---

## Agent 4: MIDI Export/Import Layer

### Scope
- Own `packages/midi`.
- Convert canonical score + resolved playback data into Type 1 SMF.
- Ensure metadata fidelity: tempo map, time/key signatures, program changes, track-per-part.
- Merge tie chains into correct MIDI note durations.
- Optional: controlled humanization toggle.

### Primary milestones
1. Baseline MIDI Type 1 export by part.
2. Tempo/time/key meta event support.
3. Tie-aware note duration merge.
4. Program/channel mapping configuration.
5. Import-readiness scaffolding (Phase 3 prework; non-blocking).

### Test responsibilities
- Binary-level parse-back tests (export then re-read and verify structure).
- Tick-accurate event ordering tests.
- Edge-case tests: pickup measures, signature changes mid-score, overlapping voices/chords.
- Cross-check parity tests against Agent 3 playback event stream.

### Dependencies
- Consumes canonical model + playback expansion contracts.
- Exposes export API to Agent 5 desktop shell.

---

## Agent 5: Desktop UX Shell, Interaction, and Workflow Integration

### Scope
- Own `apps/desktop` (Electron main + renderer UI integration).
- Implement app shell, panels, transport controls, command palette, hotkeys.
- Integrate renderer canvas, inspector, and mode switching (Select/Note Input/Text-Lines).
- Wire file IO, autosave, recovery flows.

### Primary milestones
1. New score wizard + project persistence.
2. Keyboard-first step entry loop with caret and ghost preview.
3. Inspector-driven property editing.
4. Transport UX with playback status feedback.
5. One-click MIDI export flow and user success/failure notifications.

### Test responsibilities
- Component tests for core interaction widgets.
- End-to-end flows (Playwright):
  - create score,
  - enter notes,
  - add dynamics/repeats,
  - playback,
  - export MIDI.
- Accessibility and keyboard-navigation tests.
- Main/renderer IPC contract tests.

### Dependencies
- Integrates outputs from Agents 1–4.

---

## 5) Cross-agent integration contracts

To keep parallel work safe, lock these contracts early:

1. **Core schema version + migration protocol**
   - Any model change requires migration notes and fixture updates.

2. **Command API stability window**
   - Batch incompatible changes weekly, not ad hoc.

3. **Playback event schema**
   - Single shared shape consumed by both Agent 3 and Agent 4.

4. **Rendering geometry map format**
   - Stable hit-test payload consumed by Agent 5.

5. **Error taxonomy**
   - Shared error codes across validation, playback, export, and UI messaging.

---

## 6) Test strategy (explicitly optimized for full branch coverage)

Given the requirement to avoid technical debt, testing is treated as first-class scope.

### 6.1 Test pyramid targets
- **Unit tests (majority):** command handlers, validators, converters.
- **Integration tests:** cross-package contracts (core->engraving, core->playback, core->MIDI).
- **E2E tests:** key user journeys from the MVP success criteria.

### 6.2 Coverage policy
- Enforce strict minimums in CI (initial target suggestion):
  - 95% line,
  - 95% branch,
  - 100% for critical safety modules:
    - repeat resolver,
    - MIDI timing conversion,
    - command undo/redo core.
- Any uncovered branch requires a documented justification + issue link.

### 6.3 Required scenario suites
1. **Notation semantics matrix**
   - All note durations, dots, tuplets (where implemented), accidentals, ties/slurs.
2. **Time/key/tempo changes**
   - Start/mid/end placement and interaction with playback/export.
3. **Repeat/navigation graphs**
   - Valid and invalid graph topologies; termination guarantees.
4. **Dynamics/articulation interpretation**
   - Velocity/time shaping consistency in playback and exported MIDI.
5. **Persistence/compatibility**
   - Save/load round-trip across schema versions.
6. **UX keyboard workflows**
   - Full note-entry loop without mouse dependency.

### 6.4 Test data management
- Curate reusable fixture library:
  - “minimal”, “polyphonic”, “repeat-heavy”, “expression-heavy”, “mixed-meter”.
- Store expected MIDI/SVG artifacts with normalization utilities.
- Use deterministic seeds for any random/humanization behavior.

### 6.5 CI quality gates
- Lint/type/test must pass for every PR.
- Changed-files coverage diff gate (no dropping branch coverage in touched modules).
- Nightly extended suite with visual + long-form playback checks.

---

## 7) Delivery sequencing (high-level timeline)

### Sprint 0: Foundations
- Complete Gate 0 shared interfaces and thin slice.

### Sprint 1: Parallel streams begin
- Agent 1: editing core v1.
- Agent 2: engraving v1 basics.
- Agent 3: strict playback v1.
- Agent 4: MIDI export baseline.
- Agent 5: shell + new score + basic note entry UI.

### Sprint 2: Semantics expansion
- Ties/slurs/dynamics/articulations integrated end-to-end.
- First cross-agent integration milestone demo.

### Sprint 3: Repeats + expressivity
- Repeat resolver + volta playback + UI markers + MIDI parity.

### Sprint 4: Hardening
- Performance optimization, bug burn-down, test coverage closure, release candidate.

---

## 8) Risk register and mitigation

1. **Risk:** Interface churn blocks parallelization.
   - **Mitigation:** Weekly contract freeze windows + design review board.

2. **Risk:** Repeat resolver complexity causes correctness bugs.
   - **Mitigation:** Graph-based traversal model + exhaustive branch tests + guardrails on max traversal.

3. **Risk:** Engraving determinism instability causes flaky tests.
   - **Mitigation:** SVG normalization and tolerant comparison utilities.

4. **Risk:** Playback vs MIDI divergence.
   - **Mitigation:** Shared canonical playback event schema and parity tests.

5. **Risk:** Keyboard-first UX regressions.
   - **Mitigation:** Mandatory e2e keyboard workflow suite in CI.

---

## 9) Definition of done (MVP phase)

MVP is accepted when:
- User success criteria from spec section 1.3 are fully satisfied.
- All five agent streams are integrated behind stable contracts.
- Coverage thresholds are met (including strict branch goals).
- No open P0/P1 defects in note entry, playback order, or MIDI export correctness.
- Release checklist complete for macOS/Windows/Linux desktop builds.

---

## 10) Suggested ownership map (example)

- Agent 1 lead: Core model + command semantics owner.
- Agent 2 lead: Rendering/layout owner.
- Agent 3 lead: Playback correctness owner.
- Agent 4 lead: MIDI fidelity owner.
- Agent 5 lead: UX workflow owner.
- Rotating integrator: Build health + merge orchestration owner.

This ownership model should be revisited at each sprint boundary based on bottlenecks and defect trends.
