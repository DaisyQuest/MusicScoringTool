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

    const fallbackDurationResponse = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pitch: { step: 'D', octave: 4 }, duration: '64th', dots: 0 }),
    });
    expect(fallbackDurationResponse.status).toBe(200);

    const html = await (await fetch(baseUrl)).text();
    expect(html).toContain('Events in focus voice');
    expect(html).toContain('>2<');
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('Staff preview');
    expect(html).toContain('aria-label="Staff preview with 2 notes"');
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
