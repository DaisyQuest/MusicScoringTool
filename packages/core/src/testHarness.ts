import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class DeterministicClock {
  private nowMs = 0;
  tick(ms: number): number {
    this.nowMs += ms;
    return this.nowMs;
  }
  now(): number {
    return this.nowMs;
  }
}

export const assertGolden = (path: string, actual: string): string => {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual, 'utf8');
    return 'created';
  }
  const expected = readFileSync(path, 'utf8');
  if (expected !== actual) {
    writeFileSync(path, actual, 'utf8');
    return 'updated';
  }
  return 'matched';
};
