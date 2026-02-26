# Scorecraft — a simple, beautiful Node.js sheet‑music editor with MIDI export + playback
*A product + technical design spec (single-file markdown).*

> Goal: a **keyboard-first**, **low-friction**, **great-looking** score editor that covers the fundamentals of modern staff notation (staves, clefs, meter, durations, accidentals, ties/slurs, dynamics, articulations, repeats, chord symbols), with **one-click MIDI export** and **reliable playback**.

---

## 1) Product definition

### 1.1 What it is
**Scorecraft** is a local-first, cross-platform (macOS/Windows/Linux) desktop app built on **Node.js** (via Electron) that lets users:

- Create and edit **standard staff notation** (incl. grand staff, percussion staff, tablature views).
- Quickly enter notes via **step entry** + hotkeys (plus optional MIDI keyboard input).
- Add musical meaning (clefs, key signatures, time signatures, articulations, dynamics, repeats, chord symbols).
- **Play back** the score immediately.
- **Export** the score to a Standard MIDI File (SMF) and optionally to PDF/SVG for printing.

### 1.2 What “simple” means here
Scorecraft is deliberately *not* trying to be a full Finale replacement. It aims for a **tight** set of features that feel excellent. In exchange, it can be:

- easy to learn in ~15 minutes,
- fast for power users,
- stable and predictable,
- visually polished (“beautiful by default”).

### 1.3 MVP success criteria (measurable)
MVP is “done” when a user can, without reading documentation:

1. Create a new piano score in 4/4, choose a key, and set tempo.
2. Enter a melody with chords, ties, slurs, and basic articulations.
3. Add dynamics + a crescendo hairpin and hear a meaningful playback difference.
4. Add a repeated 8-bar passage with a 1st/2nd ending and have playback follow it.
5. Export a MIDI file that imports cleanly into a DAW with correct tempo/meter and separate tracks per staff/part.

---

## 2) Feature scope

### 2.1 Notation primitives (core)
These are the “Wikipedia fundamentals” the engine must represent and render correctly.

**Staff system**
- 5-line staff (standard), plus **ledger lines**.
- **Barlines**: single, double, final (bold), dotted (optional for complex meter), repeat barlines.
- **Braces** for grand staff, **brackets** for multi-instrument groups.

**Clefs**
- Treble (G), Bass (F), Alto/Tenor (C), Octave clefs (8va/8vb), Neutral percussion clef, Tablature view.

**Rhythm + meter**
- Note values from whole → 64th (support 128th as “display only” if needed later).
- Rests, dotted notes, multi-measure rests (phase 2).
- Tuplets (triplet/quintuplet/etc.).
- Time signatures: simple, compound (e.g., 6/8), and complex (e.g., 5/4, 11/8).
- Tempo & metronome marks (quarter=120, etc.).

**Pitch spelling**
- Accidentals: flat, sharp, natural, double-flat, double-sharp.
- Key signatures up to 7 sharps/flats.
- Enharmonic spelling decisions must be controllable (user override).

**Relationships**
- Ties, slurs, glissando (phase 2), arpeggiation marks (phase 2).

**Expression**
- Dynamics (ppp…fff, sfz, fp), cresc/decresc hairpins, niente (phase 2).
- Articulations: staccato, staccatissimo, tenuto, accent, marcato, fermata.

**Repeats + navigation**
- Repeat start/end.
- Volta brackets (1st/2nd endings).
- D.C. / D.S. al Fine / al Coda, segno, coda, Fine.

**Lead-sheet essentials**
- Chord symbols (Cm7, F#7(b9), etc.).
- Optional: slash notation (phase 2).

### 2.2 MIDI export + playback (core)
- Playback from the score with a transport (play/pause/stop/loop).
- Adjustable tempo + count-in + metronome.
- MIDI export with:
  - tempo map,
  - time signature changes,
  - key signature meta events,
  - program changes per part,
  - per-part tracks (Type 1 MIDI),
  - correct durations (ties merged),
  - basic humanization (optional toggle).

### 2.3 “Finale-inspired” productivity tools (simple versions)
Finale’s hallmark was *many specialized tools* (Simple Entry, Speedy Entry, HyperScribe, Chord, Repeat, Smart Shapes, Articulation, Expression, Tuplet, etc.). Scorecraft will mimic the spirit, but collapse complexity into **3 modes** + **inspector** + **command palette**.

**Modes**
1. **Select** — pick, move, copy, transpose, change durations.
2. **Note Input** — fast entry (step input) with rhythm keys.
3. **Text/Lines** — dynamics, chord symbols, lyrics, hairpins, slurs, voltas.

**Tools (commands)**
- Insert chord (stack notes, chord builder, chord symbol entry).
- Repeat patterns (copy/paste + generate repeat structures).
- Smart shapes (slur, tie, hairpin, glissando phase 2).
- Tuplet tool (apply tuplet ratio to selection).
- Staff/measure tools (time/key/clef changes, pickup measure, insert/delete measures).

---

## 3) UX design: “simple + beautiful”

### 3.1 Layout
A modern notation UI that feels like Figma + a DAW transport:

- **Top bar**: File / Edit / Insert / View / Playback + project title.
- **Left panel**: Instruments/parts, staff groups, mute/solo.
- **Center**: score canvas (scroll view; page view toggle).
- **Right inspector**: properties for selection (pitch spelling, duration, articulations, dynamics, beaming).
- **Bottom transport**: play/pause/stop, loop, tempo, metronome, count-in, playback instrument set.

### 3.2 Visual design rules (beauty by default)
- Crisp vector engraving via **SVG** (zoom without blur).
- Generous whitespace, subtle grid, minimal tool chrome.
- Typography: one readable UI font + a high-quality music font (e.g., SMuFL-based).
- Dark mode + light mode, both tuned for contrast.
- Microinteractions:
  - hover highlights,
  - smooth cursor movement,
  - “ghost note” preview before placement,
  - gentle animations for selection changes.

### 3.3 Interaction model (keyboard-first)
- The **caret** is always visible (like a text editor).
- There is always a **current duration** and **current accidental**.
- The user can do 80% of editing without touching the mouse.

**Direct manipulation**
- Drag notes up/down to change pitch (diatonic by default; chromatic with Alt).
- Drag measure boundaries (phase 2) to tweak spacing.
- Click and type chord symbols.

### 3.4 Accessibility
- Full keyboard support.
- High-contrast mode.
- Screen-reader-friendly UI (panels, buttons, menus).

---

## 4) Default hotkeys (bindable)

### 4.1 Philosophy
- Defaults should be “sane” for both notation users and general software users.
- Everything is **rebindable** via Settings → Hotkeys and stored as JSON.

### 4.2 Navigation
- **Arrow keys**: move caret by step (left/right = next/prev note/rest slot; up/down = staff position).
- **Ctrl/Cmd + Arrow**: jump by measure.
- **Home/End**: start/end of system.
- **PageUp/PageDown**: previous/next system (or page in Page View).

### 4.3 Durations (rhythm layer)
(Think: “press a number, then type pitches”)

- **1** = whole  
- **2** = half  
- **3** = quarter  
- **4** = eighth  
- **5** = 16th  
- **6** = 32nd  
- **7** = 64th  
- **0** = last used duration

Modifiers:
- **.** = dot (toggle; cycles 0 → 1 → 2 dots)
- **T** = tie toggle (tie to next note of same pitch)
- **Shift+T** = tie from previous (quick repair)
- **R** = rest (insert rest of current duration)
- **U** = tuplet… (opens small popover: 3:2, 5:4, 7:8, custom)

### 4.4 Pitch entry
- **A B C D E F G** = insert pitch at caret (diatonic spelling)
- **#** = sharp, **b** = flat, **n** = natural
- **Shift + #** = double sharp, **Shift + b** = double flat
- **Z / X** = octave down/up
- **Enter** = commit note and advance caret
- **Shift+Enter** = commit note without advance

### 4.5 Chords
- **Ctrl/Cmd + K** = chord mode toggle (stack at caret)
- **Alt + A–G** = add pitch to current chord without moving caret
- **Ctrl/Cmd + Shift + K** = “Chord Builder…” (triads/7ths/extensions; voice-leading helpers)

### 4.6 Articulations & dynamics
- **S** = slur (start/end; selection-based)
- **-** = tenuto
- **;** = staccato
- **'** = accent
- **Shift+'** = marcato
- **F** then (P/MP/MF/FF) quick dynamics palette (e.g., F + P = “p”)
- **<** / **>** = crescendo/decrescendo hairpin over selection

### 4.7 Editing
- **Backspace/Delete** = delete selection
- **Ctrl/Cmd + Z / Shift+Z** = undo/redo
- **Ctrl/Cmd + C/V/X** = copy/paste/cut
- **Ctrl/Cmd + D** = duplicate
- **Ctrl/Cmd + L** = lock/unlock beaming (selection)

### 4.8 Playback
- **Space** = play/pause
- **Shift+Space** = play from start
- **L** = loop selection
- **M** = metronome toggle
- **+ / -** = tempo ±5 BPM
- **Ctrl/Cmd + + / -** = zoom

### 4.9 Command palette
- **Ctrl/Cmd + P** opens palette; search “Insert time signature”, “Add crescendo”, “Export MIDI”, etc.

---

## 5) Data model (internal score representation)

### 5.1 Principles
- Store musical meaning first; rendering is derived.
- Preserve **pitch spelling** (C# vs Db) separately from MIDI pitch number.
- Support multiple voices per staff (even if UI exposes only 1–2 in MVP).

### 5.2 Core types (TypeScript-ish)

```ts
type Step = "A"|"B"|"C"|"D"|"E"|"F"|"G";
type Alter = -2|-1|0|1|2; // bb, b, natural, #, x
type Pitch = { step: Step; alter: Alter; octave: number; midi: number };

type Duration = {
  base: "whole"|"half"|"quarter"|"eighth"|"16th"|"32nd"|"64th"|"128th";
  dots: 0|1|2;
  tuplet?: { actual: number; normal: number }; // e.g. 3:2
};

type Articulation =
  | "staccato" | "staccatissimo" | "tenuto"
  | "accent" | "marcato" | "fermata";

type Dynamic =
  | "ppp"|"pp"|"p"|"mp"|"mf"|"f"|"ff"|"fff"
  | "sfz"|"fp";

type NoteEvent = {
  kind: "note";
  pitch: Pitch;
  dur: Duration;
  tieStart?: boolean;
  tieEnd?: boolean;
  articulations?: Articulation[];
  ornaments?: string[]; // phase 2
  lyric?: string; // phase 2
};

type RestEvent = { kind: "rest"; dur: Duration };

type ChordEvent = {
  kind: "chord";
  notes: NoteEvent[];     // same duration for all notes
  dur: Duration;          // duplicated for convenience
  tieStart?: boolean;
  tieEnd?: boolean;
};

type DirectionEvent =
  | { kind: "dynamic"; value: Dynamic }
  | { kind: "hairpin"; value: "cresc"|"decresc"; span: { from: Cursor; to: Cursor } }
  | { kind: "tempo"; bpm: number; beatUnit: "quarter"|"eighth"|"half" }
  | { kind: "chordSymbol"; text: string }
  | { kind: "repeat"; value: "start"|"end"|"dc"|"ds"|"coda"|"segno"|"fine" }
  | { kind: "volta"; numbers: number[]; span: { fromMeasure: number; toMeasure: number } };

type Event = NoteEvent | RestEvent | ChordEvent | DirectionEvent;

type Voice = { id: string; events: Event[] };

type Measure = {
  number: number;
  timeSig?: { beats: number; beatUnit: 1|2|4|8|16 };
  keySig?: { fifths: -7..7; mode?: "major"|"minor" };
  clef?: "treble"|"bass"|"alto"|"tenor"|"percussion"|"tab";
  voices: Voice[];
};

type Staff = { id: string; name: string; measures: Measure[] };
type Part = { id: string; name: string; instrument: string; staves: Staff[] };

type Score = {
  id: string;
  title: string;
  composer?: string;
  parts: Part[];
  defaults: { bpm: number; timeSig: { beats: number; beatUnit: 1|2|4|8|16 }; keySig: { fifths: -7..7 } };
};
```

### 5.3 Duration → ticks (playback + MIDI)
Use PPQ (pulses per quarter note) = **480** (common, compatible).

- quarter = 480  
- eighth = 240  
- 16th = 120  
- half = 960  
- whole = 1920  

Dots:
- 1 dot = *x 1.5*  
- 2 dots = *x 1.75* (1 + 1/2 + 1/4)

Tuplets:
- Multiply by `normal/actual` (e.g. 3:2 triplet → `2/3` of normal duration).

### 5.4 Clef mapping (rendering + entry)
Clef defines which pitch corresponds to a particular staff line. Rendering uses staff position; playback uses MIDI pitch.

- Store both:
  - **staffPos** (line/space index relative to staff centerline) for UI movement,
  - **Pitch spelling + MIDI** for sound/export.

---

## 6) Engraving + rendering

### 6.1 Rendering library
Use **VexFlow** for engraving in the renderer process:
- Great SVG/Canvas output.
- Works in browser contexts and Node-based tooling.

(Alternative for display-only: OpenSheetMusicDisplay via MusicXML; less suitable for interactive editing.)

### 6.2 Rendering approach
**Two-layer system**:

1. **Engraved SVG layer** (VexFlow output): beautiful notation.
2. **Interaction overlay layer** (transparent): hit-testing, selection boxes, caret, drag handles.

This avoids fighting VexFlow’s internal layout for interactions.

### 6.3 Layout algorithm (simple but strong)
MVP line-breaking strategy:
- Fixed page width (responsive to window).
- Each measure has a minimum width based on rhythm density.
- Greedy fill: place measures left-to-right until no space; then new system.
- “Justify” spacing per system by distributing leftover width (basic proportional spacing).

Phase 2: better spacing knobs + manual line breaks.

---

## 7) Playback engine

### 7.1 Playback goals
- Accurate rhythm and repeats.
- Musically intelligible dynamics/articulations.
- Low latency and stable scheduling.

### 7.2 Scheduling
Use **Tone.js Transport** to schedule note on/off events in musical time, with conversion from ticks to seconds via tempo map.

### 7.3 Interpreting notation into performance (“mini human playback”)
Inspired by Finale’s Human Playback concept (interpret articulations, expressions, hairpins):

- **Dynamics → velocity scale**:
  - ppp ~ 20, pp ~ 30, p ~ 45, mp ~ 60, mf ~ 75, f ~ 90, ff ~ 105, fff ~ 120 (tunable curve).
- **Hairpins**: ramp velocities over span.
- **Staccato**: shorten to ~50% of nominal duration (clamped).
- **Tenuto**: ~95–105% duration (don’t overlap next onset; clamp).
- **Accent/Marcato**: boost velocity + shorten slightly.
- **Fermata**: hold longer (MVP: x1.5; later: user-controlled).

Provide a toggle:
- **Playback Style**: “Strict” (no humanization) / “Expressive” (apply rules).

### 7.4 Repeats playback
Playback must expand score structure into a linear sequence:
- Repeat start/end.
- Voltas.
- D.C./D.S. jumps with Fine/Coda logic.

Implementation tip:
- Build a **playback timeline** as an ordered list of measure references:
  - e.g. `[1,2,3,4,5,6,7,8, 1,2,3,4,5,6,7,9,10...]` depending on repeats/voltas.

---

## 8) MIDI export

### 8.1 MIDI library
Use `@tonejs/midi` for writing Standard MIDI Files.

### 8.2 Export rules
- MIDI Type 1 (multi-track).
- One track per **part** (or per staff if piano staves should be separate — user setting).
- Assign channels predictably; reserve channel 10 for percussion by default.
- Emit meta events:
  - tempo (setTempo),
  - time signature changes,
  - key signature changes,
  - track name.
- Emit program changes based on instrument choice.
- Merge ties into single sustained note events.

### 8.3 Minimal export pseudocode

```ts
import { Midi } from "@tonejs/midi";

function exportMidi(score: Score, ppq = 480): Uint8Array {
  const midi = new Midi();
  midi.header.ppq = ppq;

  // Global meta (tempo/meter changes could be per-measure)
  // midi.header.setTempo(bpm);
  // midi.header.timeSignatures.push({ ticks, timeSignature: [beats, beatUnit] });

  for (const part of score.parts) {
    const track = midi.addTrack();
    track.name = part.name;

    // program change based on instrument mapping
    // track.instrument.number = program;

    const events = buildLinearPlaybackEvents(score, part, ppq);
    for (const e of events) {
      track.addNote({
        midi: e.midi,
        ticks: e.startTicks,
        durationTicks: e.durationTicks,
        velocity: e.velocity, // 0..1 in tonejs/midi
      });
    }
  }

  return midi.toArray();
}
```

---

## 9) Tech architecture (Node.js app)

### 9.1 Stack
- **Electron** (Node.js desktop shell)
- **TypeScript** everywhere
- **React** for UI
- **VexFlow** for engraving
- **Tone.js** for playback synth + scheduling
- **@tonejs/midi** for MIDI read/write (export, and optional import later)
- State: **Zustand** (or Redux Toolkit if you prefer more ceremony)
- Persistence: local project file (`.scorecraft.json`) + autosave snapshots

### 9.2 Process boundaries
- **Main process**:
  - file open/save dialogs,
  - project file IO,
  - app updates,
  - crash recovery.

- **Renderer process**:
  - score editor UI,
  - engraving,
  - playback (Tone.js),
  - hotkeys.

(Playback can also be moved to a dedicated worker if needed.)

### 9.3 Folder structure (suggested)
```
scorecraft/
  package.json
  apps/
    desktop/
      electron-main/
      renderer/
  packages/
    core/        # score model, validation, transformations, playback expansion
    engraving/   # model -> vexflow rendering
    midi/        # model <-> midi conversion
    ui/          # shared UI components
```

---

## 10) Core editing workflows

### 10.1 Creating a score
New Score wizard:
- Title, composer
- Template: Piano / Lead Sheet / SATB / String Quartet / Custom
- Key signature, time signature, tempo
- Instruments (GM preview mapping)

### 10.2 Step entry (MVP)
- Select duration (numbers 1–7)
- Type pitch letters A–G
- Accidentals (#/b/n)
- Enter to commit + advance

Optional:
- MIDI keyboard input: pressing a key inserts that pitch at caret.

### 10.3 Insert chord (two approaches)
1. **Stacking** (Chord mode): toggle chord mode → type additional pitches at same time position.
2. **Chord Builder**: choose chord type + inversion; app inserts notes (or chord symbol only if lead-sheet mode).

### 10.4 Repeat patterns
- Select measures → “Create Repeat…”
  - Option A: literal copy (duplicate measures N times)
  - Option B: structural repeat (repeat barlines + volta endings)
- “Repeat last measure” marks (phase 2)

### 10.5 Tuplets
- Select notes/rests of same span → apply tuplet ratio.
- Auto-numbering and bracket rules (basic; advanced engraving later).

---

## 11) Finale feature “peek” and what to emulate (selectively)

Finale used a palette of specialized tools (Chord Tool, Repeat Tool, Smart Shape Tool, Articulation Tool, Expression Tool, Simple Entry, Speedy Entry, HyperScribe, Tuplet Tool, Time Signature Tool, etc.) and a playback system (“Human Playback”) that interprets markings for more realistic performance.

**Scorecraft emulation strategy**
- Keep the mental model: “I’m in note entry vs editing vs expressions.”
- Replace dozens of palettes with:
  - 3 modes + inspector,
  - command palette,
  - contextual mini toolbars.

**Borrow these behaviors**
- Fast note entry workflow (“choose duration, type pitch”)
- Chord symbol entry tool
- Repeat/ending constructs
- Smart shapes: slurs/hairpins
- Playback that respects articulations/dynamics

---

## 12) MVP roadmap (phased delivery)

### Phase 1 — MVP editor + MIDI
- New/open/save projects
- Piano + single-staff instruments
- Note/rest entry (whole → 64th), dots
- Accidentals + key/time signatures
- Ties + slurs (simple)
- Basic articulations + dynamics + hairpins
- Chord symbols (text)
- Playback (strict + expressive)
- MIDI export (Type 1)
- Undo/redo, copy/paste, transpose selection

### Phase 2 — Engraving + print + more notation
- Page view with pagination
- PDF/SVG export
- Multi-measure rests
- Better beaming control
- Lyrics
- More ornaments (trills, turns)
- Glissando/portamento markings
- Percussion staff mapping + drumset editor
- Guitar tablature view

### Phase 3 — Interchange + power features
- MusicXML import/export
- Part extraction (linked parts)
- Layout overrides (line breaks, staff spacing)
- Playback to external MIDI devices (WebMIDI / OS MIDI routing)
- Plugin hooks / scripting (optional)

---

## 13) Implementation notes / pitfalls

### 13.1 Hard parts (be honest early)
- **Interactive editing** on top of a rendering library is the core challenge.
  - Solve via overlay hit-testing + stable IDs for model events.
- **Repeats playback expansion** is subtle (voltas + D.C./D.S. + codas).
  - Build a dedicated “playback resolver” and test thoroughly.
- **Pitch spelling** (C# vs Db) must be explicit in the model.
  - Don’t derive spelling from MIDI alone.
- **Tuplets + beaming** get complex fast.
  - MVP: support common tuplets; let beaming be automatic first.

### 13.2 Testing strategy
- Golden tests for engraving:
  - given model JSON → render SVG → compare structure/hash (tolerant).
- Playback tests:
  - given model JSON → exported MIDI → verify event ticks/ordering.
- Repeat logic tests with known expected measure sequences.

---

## 14) Appendix: reference links (for developers)
(These are helpful when you start implementation.)

- VexFlow (engraving): https://github.com/vexflow/vexflow  
- Tone.js (playback): https://tonejs.github.io/  
- @tonejs/midi (MIDI read/write): https://github.com/Tonejs/Midi  
- Finale tools palette (for feature inspiration): https://usermanuals.finalemusic.com/Finale2014Win/Content/Finale/Tools.htm  
- Finale Human Playback concept: https://usermanuals.finalemusic.com/FinaleMac/Content/Finale/Human_Playback.htm  
- Finale sunset notice (context): https://www.finalemusic.com/  

---

## 15) “If you build only one thing right…”
Make the **note entry loop** feel incredible:
- choose duration,
- type pitch,
- add accidental/dot/tie,
- hear it immediately,
- undo instantly.

That’s the experience that keeps people composing.
