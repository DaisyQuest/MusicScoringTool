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


const pitchToY = (pitch: CanonicalPitch, staffTop: number): number => {
  const relative = pitch.octave * 7 + STEP_INDEX[pitch.step] - (4 * 7 + STEP_INDEX.E);
  return staffTop + 40 - relative * 5;
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
  const width = options.width ?? 1024;
  const theme = THEMES[options.theme ?? 'light'];
  const selected = new Set(options.selectedIds ?? []);
  const staffTop = 60;
  const measureWidth = 220;
  const part = score.parts[0];
  const staff = part?.staves[0];
  const measures = staff?.measures ?? [];

  const primitives: Primitive[] = [];
  const pieces: string[] = [];
  const noteCenters = new Map<string, { x: number; y: number }>();

  pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="360" viewBox="0 0 ${width} 360">`);
  pieces.push(`<rect x="0" y="0" width="${width}" height="360" fill="${theme.background}" />`);

  for (let i = 0; i < 5; i += 1) {
    const y = staffTop + i * 10;
    registerPrimitive(primitives, 'staffLine', { x: 40, y: y - 1, width: width - 80, height: 2 }, staff?.id);
    pieces.push(`<line x1="40" y1="${y}" x2="${width - 40}" y2="${y}" stroke="${theme.staffLine}" stroke-width="1" />`);
  }

  if (staff) {
    registerPrimitive(primitives, 'clef', { x: 50, y: staffTop - 8, width: 20, height: 44 }, staff.id);
    pieces.push(`<text x="52" y="${staffTop + 28}" fill="${theme.glyph}" font-size="34">${staff.clef === 'bass' ? '𝄢' : '𝄞'}</text>`);
  }

  measures.forEach((measure, measureIndex) => {
    const measureX = 80 + measureIndex * measureWidth;
    registerPrimitive(primitives, 'barline', { x: measureX - 8, y: staffTop, width: 2, height: 40 }, measure.id, `bar-${measure.id}-start`);
    pieces.push(`<line x1="${measureX - 8}" y1="${staffTop}" x2="${measureX - 8}" y2="${staffTop + 40}" stroke="${theme.staffLine}" stroke-width="1" />`);

    if (measure.timeSignature) {
      registerPrimitive(primitives, 'timeSignature', { x: measureX + 24, y: staffTop - 4, width: 24, height: 42 }, measure.id);
      pieces.push(
        `<text x="${measureX + 24}" y="${staffTop + 12}" fill="${theme.glyph}" font-size="16">${measure.timeSignature.numerator}</text>`,
      );
      pieces.push(
        `<text x="${measureX + 24}" y="${staffTop + 28}" fill="${theme.glyph}" font-size="16">${measure.timeSignature.denominator}</text>`,
      );
    }

    if (measure.keySignature) {
      const keyGlyph = `${measure.keySignature.fifths >= 0 ? '#' : 'b'}${Math.abs(measure.keySignature.fifths)}`;
      registerPrimitive(primitives, 'keySignature', { x: measureX + 52, y: staffTop + 6, width: 22, height: 14 }, measure.id);
      pieces.push(`<text x="${measureX + 52}" y="${staffTop + 18}" fill="${theme.subtleGlyph}" font-size="14">${keyGlyph}</text>`);
    }

    if (measure.repeatStart || measure.repeatEnd) {
      registerPrimitive(primitives, 'repeat', { x: measureX - 4, y: staffTop, width: 8, height: 40 }, measure.id);
      if (measure.repeatStart) {
        pieces.push(`<circle cx="${measureX - 2}" cy="${staffTop + 14}" r="1.7" fill="${theme.glyph}" />`);
        pieces.push(`<circle cx="${measureX - 2}" cy="${staffTop + 26}" r="1.7" fill="${theme.glyph}" />`);
      }
      if (measure.repeatEnd) {
        pieces.push(`<circle cx="${measureX + measureWidth - 12}" cy="${staffTop + 14}" r="1.7" fill="${theme.glyph}" />`);
        pieces.push(`<circle cx="${measureX + measureWidth - 12}" cy="${staffTop + 26}" r="1.7" fill="${theme.glyph}" />`);
      }
    }

    if (measure.volta) {
      registerPrimitive(primitives, 'volta', { x: measureX + 8, y: staffTop - 28, width: measureWidth - 20, height: 18 }, measure.id);
      pieces.push(`<path d="M ${measureX + 8} ${staffTop - 12} H ${measureX + measureWidth - 12} V ${staffTop - 5}" stroke="${theme.glyph}" fill="none"/>`);
      pieces.push(`<text x="${measureX + 12}" y="${staffTop - 14}" fill="${theme.glyph}" font-size="12">${measure.volta}.</text>`);
    }

    const voice = measure.voices[0];
    const events = voice?.events ?? [];
    const noteXs: number[] = [];
    events.forEach((event, eventIndex) => {
      const x = measureX + 90 + eventIndex * 28;
      if (event.type === 'rest') {
        registerPrimitive(primitives, 'rest', { x: x - 5, y: staffTop + 12, width: 10, height: 12 }, event.id);
        pieces.push(`<text x="${x - 4}" y="${staffTop + 22}" fill="${theme.glyph}" font-size="16">𝄽</text>`);
        return;
      }

      const y = pitchToY(event.pitch, staffTop);
      noteCenters.set(event.id, { x, y });
      noteXs.push(x);
      registerPrimitive(primitives, 'notehead', { x: x - 6, y: y - 4, width: 12, height: 8 }, event.id);
      pieces.push(`<ellipse cx="${x}" cy="${y}" rx="6" ry="4" fill="${theme.glyph}" />`);

      const stemUp = y >= staffTop + 20;
      registerPrimitive(primitives, 'stem', { x: stemUp ? x + 5 : x - 6, y: stemUp ? y - 30 : y, width: 1.5, height: 30 }, event.id);
      pieces.push(
        `<line x1="${stemUp ? x + 5 : x - 6}" y1="${stemUp ? y : y}" x2="${stemUp ? x + 5 : x - 6}" y2="${stemUp ? y - 30 : y + 30}" stroke="${theme.glyph}" stroke-width="1.3" />`,
      );

      if (event.duration === 'eighth' || event.duration === 'sixteenth') {
        registerPrimitive(primitives, 'beam', { x: x + 4, y: stemUp ? y - 30 : y + 30, width: 12, height: 3 }, event.id);
        pieces.push(`<rect x="${x + 4}" y="${stemUp ? y - 30 : y + 27}" width="12" height="3" fill="${theme.glyph}" />`);
      }

      if (y < staffTop - 2 || y > staffTop + 42) {
        const ledgerY = y < staffTop ? staffTop - 5 : staffTop + 45;
        registerPrimitive(primitives, 'ledgerLine', { x: x - 9, y: ledgerY, width: 18, height: 1 }, event.id);
        pieces.push(`<line x1="${x - 9}" y1="${ledgerY}" x2="${x + 9}" y2="${ledgerY}" stroke="${theme.staffLine}" stroke-width="1" />`);
      }

      event.articulations.forEach((art, artIndex) => {
        const yOffset = art === 'tenuto' ? -11 : -9;
        registerPrimitive(primitives, 'articulation', { x: x - 4 + artIndex * 2, y: y + yOffset, width: 8, height: 3 }, event.id);
        const shape = art === 'accent' ? `<path d="M ${x - 4} ${y - 8} L ${x + 5} ${y - 9} L ${x - 4} ${y - 10} Z" fill="${theme.glyph}" />` : art === 'tenuto' ? `<line x1="${x - 4}" y1="${y - 9}" x2="${x + 4}" y2="${y - 9}" stroke="${theme.glyph}" />` : `<circle cx="${x}" cy="${y - 9}" r="1.7" fill="${theme.glyph}" />`;
        pieces.push(shape);
      });

      if (event.dynamics) {
        registerPrimitive(primitives, 'dynamic', { x: x - 8, y: staffTop + 58, width: 18, height: 12 }, event.id);
        pieces.push(`<text x="${x - 8}" y="${staffTop + 68}" fill="${theme.dynamics}" font-size="12">${event.dynamics}</text>`);
      }

      if (selected.has(event.id)) {
        registerPrimitive(primitives, 'selection', { x: x - 11, y: y - 11, width: 22, height: 22 }, event.id);
        pieces.push(`<rect x="${x - 11}" y="${y - 11}" width="22" height="22" stroke="${theme.selection}" fill="none" stroke-width="1.2" />`);
      }
    });

    if (noteXs.length > 1) {
      const left = Math.min(...noteXs);
      const right = Math.max(...noteXs);
      registerPrimitive(primitives, 'beam', { x: left + 5, y: staffTop - 22, width: right - left, height: 2 }, measure.id);
      pieces.push(`<line x1="${left + 5}" y1="${staffTop - 22}" x2="${right + 5}" y2="${staffTop - 22}" stroke="${theme.glyph}" stroke-width="2" />`);
    }

    registerPrimitive(primitives, 'barline', { x: measureX + measureWidth - 8, y: staffTop, width: 2, height: 40 }, measure.id, `bar-${measure.id}-end`);
    pieces.push(`<line x1="${measureX + measureWidth - 8}" y1="${staffTop}" x2="${measureX + measureWidth - 8}" y2="${staffTop + 40}" stroke="${theme.staffLine}" stroke-width="1" />`);
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
    const caretBaseX = 80 + (Math.max(0, index) * measureWidth) + options.caret.x;
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
