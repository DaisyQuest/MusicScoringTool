import { afterEach, describe, expect, it } from 'vitest';
import {
  createDesktopServer,
  isServerEntrypointInvocation,
  resolveDesktopPort,
  startDesktopServer,
} from './server.js';

const closeServer = async (desktopServer: { server: { close: (cb: (error?: Error) => void) => void } }): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    desktopServer.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

describe('desktop server', () => {
  const startedServers: Array<Awaited<ReturnType<typeof startDesktopServer>>> = [];

  afterEach(async () => {
    await Promise.all(startedServers.splice(0).map((server) => closeServer(server)));
  });

  it('serves boot readiness HTML over HTTP', async () => {
    const desktopServer = await startDesktopServer(0);
    startedServers.push(desktopServer);

    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('<!doctype html>');
    expect(body).toContain('Scorecraft Desktop');
  });

  it('accepts hotkey + note entry API calls and updates shell metrics', async () => {
    const desktopServer = await startDesktopServer(0);
    startedServers.push(desktopServer);

    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const transportPlayResponse = await fetch(`${baseUrl}/api/transport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'toggle-playback' }),
    });
    expect(transportPlayResponse.status).toBe(200);

    const transportSeekResponse = await fetch(`${baseUrl}/api/transport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'seek-start' }),
    });
    expect(transportSeekResponse.status).toBe(200);

    const hotkeyResponse = await fetch(`${baseUrl}/api/hotkey`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hotkey: 'n' }),
    });
    expect(hotkeyResponse.status).toBe(200);

    const noteResponse = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pitch: { step: 'C', octave: 4 }, duration: '16th', dots: 0 }),
    });
    expect(noteResponse.status).toBe(200);

    const engravingResponse = await fetch(`${baseUrl}/api/engraving`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tempoBpm: 136, repeatStart: true, repeatEnd: true, dynamics: 'ff' }),
    });
    expect(engravingResponse.status).toBe(200);

    const engravedHtml = await (await fetch(baseUrl)).text();
    expect(engravedHtml).toContain('136 bpm');

    const addMeasureResponse = await fetch(`${baseUrl}/api/measures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(addMeasureResponse.status).toBe(200);

    const fallbackDurationResponse = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pitch: { step: 'D', octave: 4 }, duration: '64th', dots: 0 }),
    });
    expect(fallbackDurationResponse.status).toBe(200);

    const html = await (await fetch(baseUrl)).text();
    expect(html).toContain('Events in focus voice');
    expect(html).toContain('>2<');
    expect(html).toContain('data-measure="2"');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('Sheet music preview');
    expect(html).toContain('data-measure="1"');
    expect(html).toContain('data-measure="2"');
  });





  it('advances playback ticks over time while transport is playing', async () => {
    const desktopServer = await startDesktopServer(0);
    startedServers.push(desktopServer);

    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const playResponse = await fetch(`${baseUrl}/api/transport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'toggle-playback' }),
    });
    expect(playResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 140));
    const firstHtml = await (await fetch(baseUrl)).text();
    const firstTick = Number(/Playing @ tick (\d+)/.exec(firstHtml)?.[1] ?? '0');

    await new Promise((resolve) => setTimeout(resolve, 140));
    const secondHtml = await (await fetch(baseUrl)).text();
    const secondTick = Number(/Playing @ tick (\d+)/.exec(secondHtml)?.[1] ?? '0');

    expect(firstTick).toBeGreaterThan(0);
    expect(secondTick).toBeGreaterThan(firstTick);

    const stopResponse = await fetch(`${baseUrl}/api/transport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'toggle-playback' }),
    });
    expect(stopResponse.status).toBe(200);

    const stoppedHtml = await (await fetch(baseUrl)).text();
    expect(stoppedHtml).toContain('Stopped @ tick');
  });

  it('renders visible hotkeys and supports full control flow with seven note names across at least 20 measures', async () => {
    const desktopServer = await startDesktopServer(0);
    startedServers.push(desktopServer);

    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const postJson = async (path: string, payload: unknown): Promise<Response> =>
      await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

    expect((await postJson('/api/hotkey', { hotkey: 'v' })).status).toBe(200);
    expect((await postJson('/api/hotkey', { hotkey: 'n' })).status).toBe(200);
    expect((await postJson('/api/hotkey', { hotkey: 't' })).status).toBe(200);
    expect((await postJson('/api/hotkey', { hotkey: 'cmd+k' })).status).toBe(200);
    expect((await postJson('/api/hotkey', { hotkey: 'n' })).status).toBe(200);

    expect((await postJson('/api/transport', { action: 'toggle-playback' })).status).toBe(200);
    expect((await postJson('/api/transport', { action: 'seek-start' })).status).toBe(200);

    const noteSteps: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'> = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expect((await postJson('/api/notes', { pitch: { step: noteSteps[0], octave: 4 }, duration: 'quarter', dots: 0 })).status).toBe(200);

    for (let measure = 2; measure <= 20; measure += 1) {
      expect((await postJson('/api/measures', {})).status).toBe(200);
      const step = noteSteps[(measure - 1) % noteSteps.length] ?? 'C';
      expect((await postJson('/api/notes', { pitch: { step, octave: 4 }, duration: 'quarter', dots: 0 })).status).toBe(200);
    }

    expect((await postJson('/api/engraving', { tempoBpm: 152, repeatStart: true, repeatEnd: true, dynamics: 'ff' })).status).toBe(200);

    const html = await (await fetch(baseUrl)).text();

    expect(html).toContain('aria-label="Top command region"');
    expect(html).toContain('aria-label="Bottom transport strip"');
    expect(html).toContain('aria-label="Keyboard shortcuts legend"');
    expect(html).toContain('<kbd>Space</kbd>');
    expect(html).toContain('<kbd>V</kbd>');
    expect(html).toContain('<kbd>N</kbd>');
    expect(html).toContain('<kbd>T</kbd>');
    expect(html).toContain('<kbd>⌘K</kbd>');
    expect(html).toContain('id="insert-note"');
    expect(html).toContain('id="add-measure"');
    expect(html).toContain('id="apply-engraving"');
    expect(html).toContain('Selection inspector (default)');
    expect(html).toContain('Repeat start');
    expect(html).toContain('Repeat end');
    expect(html).toContain('20 measures');
    expect(html).toContain('System 5 showing measures 17-20');
    expect(html).toContain('data-measure="20"');
    expect(html).toContain('aria-label="A4"');
    expect(html).toContain('aria-label="B4"');
    expect(html).toContain('aria-label="C4"');
    expect(html).toContain('aria-label="D4"');
    expect(html).toContain('aria-label="E4"');
    expect(html).toContain('aria-label="F4"');
    expect(html).toContain('aria-label="G4"');
    expect(html).toContain('Command palette opened.');
    expect(html).toContain('152 bpm');
  });

  it('rejects malformed API payloads', async () => {
    const desktopServer = await startDesktopServer(0);
    startedServers.push(desktopServer);

    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const missingHotkey = await fetch(`${baseUrl}/api/hotkey`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingHotkey.status).toBe(400);
    expect(await missingHotkey.json()).toMatchObject({ error: expect.stringContaining('Missing hotkey') });

    const invalidJson = await fetch(`${baseUrl}/api/hotkey`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(invalidJson.status).toBe(400);

    const missingTransportAction = await fetch(`${baseUrl}/api/transport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingTransportAction.status).toBe(400);

    const invalidEngravingTempo = await fetch(`${baseUrl}/api/engraving`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tempoBpm: 'fast', dynamics: 'mf' }),
    });
    expect(invalidEngravingTempo.status).toBe(400);

    const invalidEngravingDynamics = await fetch(`${baseUrl}/api/engraving`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tempoBpm: 120, dynamics: 'sfffz' }),
    });
    expect(invalidEngravingDynamics.status).toBe(400);

    const invalidNote = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pitch: { octave: 4 } }),
    });
    expect(invalidNote.status).toBe(400);
    expect(await invalidNote.json()).toMatchObject({ error: expect.stringContaining('Invalid pitch') });
  });

  it('rejects startup when trying to bind an in-use port', async () => {
    const firstServer = await startDesktopServer(0);
    startedServers.push(firstServer);

    const address = firstServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    await expect(startDesktopServer(address.port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('defaults to the configured port when no argument is provided', () => {
    const existingPort = process.env.PORT;
    process.env.PORT = '4999';

    try {
      const desktopServer = createDesktopServer();
      expect(desktopServer.port).toBe(4999);
      desktopServer.server.close();
    } finally {
      if (existingPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = existingPort;
      }
    }
  });

  it('uses the fallback port when PORT is missing or empty', () => {
    expect(resolveDesktopPort(undefined)).toBe(4173);
    expect(resolveDesktopPort('')).toBe(4173);
    expect(resolveDesktopPort('   ')).toBe(4173);
    expect(resolveDesktopPort(undefined, 7777)).toBe(7777);
  });

  it('throws when PORT is not a valid integer between 0 and 65535', () => {
    expect(() => resolveDesktopPort('abc')).toThrow(/Invalid PORT value/);
    expect(() => resolveDesktopPort('1.2')).toThrow(/Invalid PORT value/);
    expect(() => resolveDesktopPort('-1')).toThrow(/Invalid PORT value/);
    expect(() => resolveDesktopPort('65536')).toThrow(/Invalid PORT value/);
  });

  it('identifies when the server module is launched as the process entrypoint', () => {
    expect(isServerEntrypointInvocation('file:///workspace/MusicScoringTool/apps/desktop/src/server.ts', '/workspace/MusicScoringTool/apps/desktop/src/server.ts')).toBe(true);
  });

  it('returns false for non-entrypoint invocation and missing argv path', () => {
    expect(isServerEntrypointInvocation('file:///workspace/MusicScoringTool/apps/desktop/src/server.ts', '/workspace/MusicScoringTool/apps/desktop/src/other.ts')).toBe(false);
    expect(isServerEntrypointInvocation('file:///workspace/MusicScoringTool/apps/desktop/src/server.ts', undefined)).toBe(false);
  });

  it('supports Windows-style argv paths when determining entrypoint invocation', () => {
    expect(isServerEntrypointInvocation('file:///C:/MusicScoringTool/apps/desktop/dist/server.js', 'C:\\MusicScoringTool\\apps\\desktop\\dist\\server.js')).toBe(true);
    expect(isServerEntrypointInvocation('file:///C:/MusicScoringTool/apps/desktop/dist/server.js', 'C:\\MusicScoringTool\\apps\\desktop\\dist\\index.js')).toBe(false);
  });
});
