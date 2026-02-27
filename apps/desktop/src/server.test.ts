import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopServer, resolveDesktopPort, startDesktopServer } from './server.js';

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

  it('serves boot readiness string over HTTP', async () => {
    const desktopServer = await startDesktopServer(0);
    startedServers.push(desktopServer);

    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toBe('scorecraft-desktop-shell-ready');
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
});
