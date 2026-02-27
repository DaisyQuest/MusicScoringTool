export interface EngravingAdapter {
  engine: 'vexflow';
  version: string;
}

export const createEngravingAdapter = (): EngravingAdapter => ({ engine: 'vexflow', version: 'mvp-contract' });
