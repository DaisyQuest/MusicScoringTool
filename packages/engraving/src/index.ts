import { createHash } from 'node:crypto';

export type ThemeName = 'light' | 'dark';

export interface EngravingTheme {
  background: string;
  staffLine: string;
  glyph: string;
  subtleGlyph: string;
  selection: string;
  caret: string;
  dynamics: string;
}

export interface CanonicalPitch {
  step: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  octave: number;
}

export type CanonicalEvent =
  | {
      id: string;
      type: 'note';
      pitch: CanonicalPitch;
      duration: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
      dots: 0 | 1 | 2;
      articulations: Array<'staccato' | 'accent' | 'tenuto'>;
      dynamics?: 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
      tieStartId?: string;
      tieEndId?: string;
    }
  | {
      id: string;
      type: 'rest';
      duration: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
      dots: 0 | 1 | 2;
    };

export interface CanonicalVoice {
  id: string;
  events: CanonicalEvent[];
}

export interface CanonicalMeasure {
  id: string;
  number: number;
  voices: CanonicalVoice[];
  timeSignature?: { numerator: number; denominator: 2 | 4 | 8 | 16 };
  keySignature?: { fifths: number; mode: 'major' | 'minor' };
  repeatStart?: boolean;
  repeatEnd?: boolean;
  volta?: 1 | 2;
}

export interface CanonicalStaff {
  id: string;
  clef: 'treble' | 'bass' | 'alto' | 'tenor';
  measures: CanonicalMeasure[];
}

export interface CanonicalPart {
  id: string;
  staves: CanonicalStaff[];
}

export interface CanonicalScore {
  id: string;
  parts: CanonicalPart[];
  slurs: Array<{ id: string; from: string; to: string }>;
  hairpins: Array<{ id: string; from: string; to: string; type: 'crescendo' | 'diminuendo' }>;
}

export interface RenderOptions {
  width?: number;
  theme?: ThemeName;
  selectedIds?: string[];
  caret?: { measureId: string; x: number };
}

export interface Primitive {
  id: string;
  kind:
    | 'staffLine'
    | 'barline'
    | 'clef'
    | 'keySignature'
    | 'timeSignature'
    | 'notehead'
    | 'rest'
    | 'stem'
    | 'beam'
    | 'ledgerLine'
    | 'articulation'
    | 'dynamic'
    | 'tie'
    | 'slur'
    | 'hairpin'
    | 'repeat'
    | 'volta'
    | 'selection'
    | 'caret';
  modelId?: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface EngravingRender {
  svg: string;
  normalizedSvg: string;
  hash: string;
  primitives: Primitive[];
  hitRegions: Array<{ modelId: string; bbox: Primitive['bbox'] }>;
  theme: EngravingTheme;
}

export interface EngravingAdapter {
  engine: 'vexflow';
  version: string;
  render: (score: CanonicalScore, options?: RenderOptions) => EngravingRender;
  hitTest: (render: EngravingRender, x: number, y: number) => string | undefined;
}

const THEMES: Record<ThemeName, EngravingTheme> = {
  light: {
    background: '#ffffff',
    staffLine: '#1b1b1b',
    glyph: '#111111',
    subtleGlyph: '#555555',
    selection: '#2d7ff9',
    caret: '#d92020',
    dynamics: '#1f4d2d',
  },
  dark: {
    background: '#0f1720',
    staffLine: '#d3dde8',
    glyph: '#f8fafc',
    subtleGlyph: '#9fb1c5',
    selection: '#60a5fa',
    caret: '#fb7185',
    dynamics: '#86efac',
  },
};

const STEP_INDEX: Record<CanonicalPitch['step'], number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

const normalizeForHash = (svg: string): string =>
  svg
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .replace(/\s*\/?>/g, (m) => m.trim())
    .trim();

const hashString = (value: string): string => createHash('sha256').update(value).digest('hex');

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const restGlyphByDuration: Record<Extract<CanonicalEvent, { type: 'rest' }>['duration'], string> = {
  whole: '𝄻',
  half: '𝄼',
  quarter: '𝄽',
  eighth: '𝄾',
  sixteenth: '𝄿',
};

const clefGlyphByClef: Record<CanonicalStaff['clef'], string> = {
  treble: '𝄞',
  bass: '𝄢',
  alto: '𝄡',
  tenor: '𝄡',
};

const noteSpacingByDuration: Record<Extract<CanonicalEvent, { type: 'note' }>['duration'], number> = {
  whole: 52,
  half: 42,
  quarter: 34,
  eighth: 30,
  sixteenth: 26,
};

const pitchToY = (pitch: CanonicalPitch, staffTop: number): number => {
  const relative = pitch.octave * 7 + STEP_INDEX[pitch.step] - (4 * 7 + STEP_INDEX.E);
  return staffTop + 40 - relative * 5;
};

const ledgerLineYs = (noteY: number, staffTop: number): number[] => {
  const topLine = staffTop;
  const bottomLine = staffTop + 40;
  const ledger: number[] = [];

  if (noteY < topLine) {
    for (let y = topLine - 10; y >= noteY - 2; y -= 10) ledger.push(y);
  }

  if (noteY > bottomLine) {
    for (let y = bottomLine + 10; y <= noteY + 2; y += 10) ledger.push(y);
  }

  return ledger;
};

const registerPrimitive = (
  primitives: Primitive[],
  kind: Primitive['kind'],
  bbox: Primitive['bbox'],
  modelId?: string,
  id?: string,
): Primitive => {
  const primitive: Primitive = {
    id: id ?? `${kind}-${primitives.length + 1}`,
    kind,
    bbox,
    ...(modelId ? { modelId } : {}),
  };
  primitives.push(primitive);
  return primitive;
};

export const renderScore = (score: CanonicalScore, options: RenderOptions = {}): EngravingRender => {
  const width = Math.max(360, options.width ?? 1024);
  const theme = THEMES[options.theme ?? 'light'];
  const selected = new Set(options.selectedIds ?? []);
  const staffTop = 60;
  const staffBottom = staffTop + 40;
  const part = score.parts[0];
  const staff = part?.staves[0];
  const measures = staff?.measures ?? [];
  const leftMargin = 40;
  const rightMargin = 40;
  const clefWidth = 42;
  const leadingPadding = 14;
  const fallbackMeasureWidth = 220;
  const minMeasureWidth = 140;
  const availableWidth = Math.max(
    minMeasureWidth,
    width - leftMargin - rightMargin - clefWidth - leadingPadding - measures.length * 8,
  );
  const measureWidth = measures.length > 0 ? Math.max(minMeasureWidth, availableWidth / measures.length) : fallbackMeasureWidth;
  const measureStart = leftMargin + clefWidth + leadingPadding;

  const primitives: Primitive[] = [];
  const pieces: string[] = [];
  const noteCenters = new Map<string, { x: number; y: number }>();

  pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="360" viewBox="0 0 ${width} 360">`);
  pieces.push(`<rect x="0" y="0" width="${width}" height="360" fill="${theme.background}" />`);

  for (let i = 0; i < 5; i += 1) {
    const y = staffTop + i * 10;
    registerPrimitive(primitives, 'staffLine', { x: leftMargin, y: y - 1, width: width - leftMargin - rightMargin, height: 2 }, staff?.id);
    pieces.push(`<line x1="${leftMargin}" y1="${y}" x2="${width - rightMargin}" y2="${y}" stroke="${theme.staffLine}" stroke-width="1" />`);
  }

  if (staff) {
    const clefGlyph = clefGlyphByClef[staff.clef] ?? clefGlyphByClef.treble;
    registerPrimitive(primitives, 'clef', { x: leftMargin + 8, y: staffTop - 10, width: clefWidth, height: 46 }, staff.id);
    pieces.push(`<text x="${leftMargin + 10}" y="${staffTop + 28}" fill="${theme.glyph}" font-size="34">${clefGlyph}</text>`);
  }

  measures.forEach((measure, measureIndex) => {
    const measureX = measureStart + measureIndex * (measureWidth + 8);
    registerPrimitive(primitives, 'barline', { x: measureX - 4, y: staffTop, width: 2, height: 40 }, measure.id, `bar-${measure.id}-start`);
    pieces.push(`<line x1="${measureX - 4}" y1="${staffTop}" x2="${measureX - 4}" y2="${staffBottom}" stroke="${theme.staffLine}" stroke-width="1" />`);

    let notationOffset = 0;

    if (measure.timeSignature) {
      registerPrimitive(primitives, 'timeSignature', { x: measureX + notationOffset, y: staffTop - 4, width: 24, height: 42 }, measure.id);
      pieces.push(`<text x="${measureX + notationOffset}" y="${staffTop + 12}" fill="${theme.glyph}" font-size="16">${measure.timeSignature.numerator}</text>`);
      pieces.push(`<text x="${measureX + notationOffset}" y="${staffTop + 28}" fill="${theme.glyph}" font-size="16">${measure.timeSignature.denominator}</text>`);
      notationOffset += 26;
    }

    if (measure.keySignature) {
      const accidental = measure.keySignature.fifths >= 0 ? '#' : 'b';
      const keyGlyph = `${accidental}${Math.abs(measure.keySignature.fifths)}`;
      registerPrimitive(primitives, 'keySignature', { x: measureX + notationOffset, y: staffTop + 6, width: 24, height: 14 }, measure.id);
      pieces.push(`<text x="${measureX + notationOffset}" y="${staffTop + 18}" fill="${theme.subtleGlyph}" font-size="14">${keyGlyph}</text>`);
      notationOffset += 26;
    }

    if (measure.repeatStart || measure.repeatEnd) {
      registerPrimitive(primitives, 'repeat', { x: measureX - 2, y: staffTop, width: 10, height: 40 }, measure.id);
      if (measure.repeatStart) {
        pieces.push(`<line x1="${measureX + 1}" y1="${staffTop}" x2="${measureX + 1}" y2="${staffBottom}" stroke="${theme.glyph}" stroke-width="2"/>`);
        pieces.push(`<circle cx="${measureX + 4}" cy="${staffTop + 14}" r="1.7" fill="${theme.glyph}" />`);
        pieces.push(`<circle cx="${measureX + 4}" cy="${staffTop + 26}" r="1.7" fill="${theme.glyph}" />`);
      }
      if (measure.repeatEnd) {
        const endX = measureX + measureWidth - 6;
        pieces.push(`<line x1="${endX}" y1="${staffTop}" x2="${endX}" y2="${staffBottom}" stroke="${theme.glyph}" stroke-width="2"/>`);
        pieces.push(`<circle cx="${endX - 3}" cy="${staffTop + 14}" r="1.7" fill="${theme.glyph}" />`);
        pieces.push(`<circle cx="${endX - 3}" cy="${staffTop + 26}" r="1.7" fill="${theme.glyph}" />`);
      }
    }

    if (measure.volta) {
      registerPrimitive(primitives, 'volta', { x: measureX + 6, y: staffTop - 28, width: measureWidth - 12, height: 18 }, measure.id);
      pieces.push(`<path d="M ${measureX + 6} ${staffTop - 12} H ${measureX + measureWidth - 6} V ${staffTop - 5}" stroke="${theme.glyph}" fill="none"/>`);
      pieces.push(`<text x="${measureX + 10}" y="${staffTop - 14}" fill="${theme.glyph}" font-size="12">${measure.volta}.</text>`);
    }

    const voice = measure.voices[0];
    const events = voice?.events ?? [];
    const durationUnits = events.reduce((sum, event) => {
      if (event.type === 'rest') return sum + noteSpacingByDuration[event.duration];
      return sum + noteSpacingByDuration[event.duration];
    }, 0);
    const drawableWidth = Math.max(40, measureWidth - notationOffset - 24);
    const scale = durationUnits > 0 ? drawableWidth / durationUnits : 1;
    const firstEventX = measureX + notationOffset + 12;

    const noteXs: number[] = [];
    let cursorX = firstEventX;

    events.forEach((event) => {
      const spacing = (event.type === 'rest' ? noteSpacingByDuration[event.duration] : noteSpacingByDuration[event.duration]) * scale;
      const x = clamp(cursorX + spacing / 2, measureX + notationOffset + 10, measureX + measureWidth - 18);
      cursorX += spacing;
      if (event.type === 'rest') {
        registerPrimitive(primitives, 'rest', { x: x - 7, y: staffTop + 10, width: 14, height: 14 }, event.id);
        pieces.push(`<text x="${x - 7}" y="${staffTop + 23}" fill="${theme.glyph}" font-size="16">${restGlyphByDuration[event.duration]}</text>`);
        if (selected.has(event.id)) {
          registerPrimitive(primitives, 'selection', { x: x - 11, y: staffTop + 4, width: 22, height: 22 }, event.id);
          pieces.push(`<rect x="${x - 11}" y="${staffTop + 4}" width="22" height="22" stroke="${theme.selection}" fill="none" stroke-width="1.2" />`);
        }
        return;
      }

      const y = pitchToY(event.pitch, staffTop);
      noteCenters.set(event.id, { x, y });
      noteXs.push(x);
      registerPrimitive(primitives, 'notehead', { x: x - 6, y: y - 4, width: 12, height: 8 }, event.id);
      const noteFill = event.duration === 'whole' || event.duration === 'half' ? 'none' : theme.glyph;
      pieces.push(`<ellipse cx="${x}" cy="${y}" rx="6" ry="4" fill="${noteFill}" stroke="${theme.glyph}" stroke-width="1" />`);

      if (event.duration !== 'whole') {
        const stemUp = y >= staffTop + 20;
        registerPrimitive(primitives, 'stem', { x: stemUp ? x + 5 : x - 6, y: stemUp ? y - 30 : y, width: 1.5, height: 30 }, event.id);
        pieces.push(`<line x1="${stemUp ? x + 5 : x - 6}" y1="${y}" x2="${stemUp ? x + 5 : x - 6}" y2="${stemUp ? y - 30 : y + 30}" stroke="${theme.glyph}" stroke-width="1.3" />`);

        if (event.duration === 'eighth' || event.duration === 'sixteenth') {
          registerPrimitive(primitives, 'beam', { x: x + (stemUp ? 4 : -16), y: stemUp ? y - 30 : y + 27, width: 12, height: 3 }, event.id);
          pieces.push(`<rect x="${x + (stemUp ? 4 : -16)}" y="${stemUp ? y - 30 : y + 27}" width="12" height="3" fill="${theme.glyph}" />`);
          if (event.duration === 'sixteenth') {
            registerPrimitive(primitives, 'beam', { x: x + (stemUp ? 4 : -16), y: stemUp ? y - 25 : y + 22, width: 12, height: 3 }, event.id);
            pieces.push(`<rect x="${x + (stemUp ? 4 : -16)}" y="${stemUp ? y - 25 : y + 22}" width="12" height="3" fill="${theme.glyph}" />`);
          }
        }
      }

      for (const ledgerY of ledgerLineYs(y, staffTop)) {
        registerPrimitive(primitives, 'ledgerLine', { x: x - 9, y: ledgerY, width: 18, height: 1 }, event.id);
        pieces.push(`<line x1="${x - 9}" y1="${ledgerY}" x2="${x + 9}" y2="${ledgerY}" stroke="${theme.staffLine}" stroke-width="1" />`);
      }

      if (event.dots > 0) {
        for (let dot = 0; dot < event.dots; dot += 1) {
          const dotX = x + 9 + dot * 4;
          registerPrimitive(primitives, 'articulation', { x: dotX - 1.5, y: y - 1.5, width: 3, height: 3 }, event.id, `dot-${event.id}-${dot + 1}`);
          pieces.push(`<circle cx="${dotX}" cy="${y}" r="1.5" fill="${theme.glyph}" />`);
        }
      }

      event.articulations.forEach((art, artIndex) => {
        const yOffset = art === 'tenuto' ? -11 : -9;
        registerPrimitive(primitives, 'articulation', { x: x - 4 + artIndex * 2, y: y + yOffset, width: 8, height: 3 }, event.id);
        const shape = art === 'accent'
          ? `<path d="M ${x - 4} ${y - 8} L ${x + 5} ${y - 9} L ${x - 4} ${y - 10} Z" fill="${theme.glyph}" />`
          : art === 'tenuto'
            ? `<line x1="${x - 4}" y1="${y - 9}" x2="${x + 4}" y2="${y - 9}" stroke="${theme.glyph}" />`
            : `<circle cx="${x}" cy="${y - 9}" r="1.7" fill="${theme.glyph}" />`;
        pieces.push(shape);
      });

      if (event.dynamics) {
        registerPrimitive(primitives, 'dynamic', { x: x - 8, y: staffTop + 58, width: 18, height: 12 }, event.id);
        pieces.push(`<text x="${x - 8}" y="${staffTop + 68}" fill="${theme.dynamics}" font-size="12">${escapeXml(event.dynamics)}</text>`);
      }

      if (selected.has(event.id)) {
        registerPrimitive(primitives, 'selection', { x: x - 11, y: y - 11, width: 22, height: 22 }, event.id);
        pieces.push(`<rect x="${x - 11}" y="${y - 11}" width="22" height="22" stroke="${theme.selection}" fill="none" stroke-width="1.2" />`);
      }
    });

    const beamCandidates = events.filter((event): event is Extract<CanonicalEvent, { type: 'note' }> => event.type === 'note' && (event.duration === 'eighth' || event.duration === 'sixteenth'));
    if (beamCandidates.length > 1) {
      const beamPoints = beamCandidates
        .map((event) => noteCenters.get(event.id))
        .filter((center): center is { x: number; y: number } => Boolean(center));
      if (beamPoints.length > 1) {
        const left = Math.min(...beamPoints.map((point) => point.x));
        const right = Math.max(...beamPoints.map((point) => point.x));
        registerPrimitive(primitives, 'beam', { x: left + 5, y: staffTop - 22, width: right - left, height: 2 }, measure.id);
        pieces.push(`<line x1="${left + 5}" y1="${staffTop - 22}" x2="${right + 5}" y2="${staffTop - 22}" stroke="${theme.glyph}" stroke-width="2" />`);
      }
    }

    registerPrimitive(primitives, 'barline', { x: measureX + measureWidth - 4, y: staffTop, width: 2, height: 40 }, measure.id, `bar-${measure.id}-end`);
    pieces.push(`<line x1="${measureX + measureWidth - 4}" y1="${staffTop}" x2="${measureX + measureWidth - 4}" y2="${staffBottom}" stroke="${theme.staffLine}" stroke-width="1" />`);
  });

  for (const slur of score.slurs) {
    const from = noteCenters.get(slur.from);
    const to = noteCenters.get(slur.to);
    if (!from || !to) continue;
    const xMid = (from.x + to.x) / 2;
    registerPrimitive(primitives, 'slur', { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) - 24, width: Math.abs(to.x - from.x), height: 24 }, slur.id);
    pieces.push(`<path d="M ${from.x} ${from.y - 8} Q ${xMid} ${Math.min(from.y, to.y) - 28} ${to.x} ${to.y - 8}" stroke="${theme.subtleGlyph}" fill="none" stroke-width="1.2" />`);
  }

  measures.forEach((measure) => {
    const voice = measure.voices[0];
    for (const event of voice?.events ?? []) {
      if (event.type !== 'note' || !event.tieStartId) continue;
      const from = noteCenters.get(event.id);
      const to = noteCenters.get(event.tieStartId);
      if (!from || !to) continue;
      registerPrimitive(primitives, 'tie', { x: Math.min(from.x, to.x), y: Math.max(from.y, to.y) + 3, width: Math.abs(to.x - from.x), height: 10 }, event.id);
      pieces.push(`<path d="M ${from.x} ${from.y + 4} Q ${(from.x + to.x) / 2} ${Math.max(from.y, to.y) + 13} ${to.x} ${to.y + 4}" stroke="${theme.subtleGlyph}" fill="none" stroke-width="1" />`);
    }
  });

  for (const hairpin of score.hairpins) {
    const from = noteCenters.get(hairpin.from);
    const to = noteCenters.get(hairpin.to);
    if (!from || !to) continue;
    registerPrimitive(primitives, 'hairpin', { x: Math.min(from.x, to.x), y: staffTop + 72, width: Math.abs(to.x - from.x), height: 10 }, hairpin.id);
    const midY = staffTop + 76;
    const spread = hairpin.type === 'crescendo' ? { start: 1, end: 7 } : { start: 7, end: 1 };
    pieces.push(`<path d="M ${from.x} ${midY - spread.start} L ${to.x} ${midY - spread.end} M ${from.x} ${midY + spread.start} L ${to.x} ${midY + spread.end}" stroke="${theme.subtleGlyph}" fill="none" stroke-width="1" />`);
  }

  if (options.caret) {
    const index = measures.findIndex((m) => m.id === options.caret?.measureId);
    const safeIndex = Math.max(0, index);
    const measureX = measureStart + safeIndex * (measureWidth + 8);
    const caretBaseX = clamp(measureX + options.caret.x, measureX + 6, measureX + measureWidth - 6);
    registerPrimitive(primitives, 'caret', { x: caretBaseX, y: staffTop - 6, width: 1.5, height: 52 }, options.caret.measureId);
    pieces.push(`<line x1="${caretBaseX}" y1="${staffTop - 6}" x2="${caretBaseX}" y2="${staffTop + 46}" stroke="${theme.caret}" stroke-width="1.6" />`);
  }

  pieces.push('</svg>');
  const svg = pieces.map((segment) => segment.trim()).join('');
  const normalizedSvg = normalizeForHash(svg);

  return {
    svg,
    normalizedSvg,
    hash: hashString(normalizedSvg),
    primitives,
    hitRegions: primitives.filter((p) => p.modelId).map((p) => ({ modelId: p.modelId!, bbox: p.bbox })),
    theme,
  };
};

export const hitTest = (render: EngravingRender, x: number, y: number): string | undefined => {
  const match = [...render.hitRegions]
    .reverse()
    .find((region) => x >= region.bbox.x && x <= region.bbox.x + region.bbox.width && y >= region.bbox.y && y <= region.bbox.y + region.bbox.height);
  return match?.modelId;
};

export const createEngravingAdapter = (): EngravingAdapter => ({
  engine: 'vexflow',
  version: 'mvp-vexflow-adapter-v1',
  render: renderScore,
  hitTest,
});
