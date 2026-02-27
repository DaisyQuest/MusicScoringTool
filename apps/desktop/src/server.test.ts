import { describe, expect, it } from 'vitest';
import { createDesktopServer, startDesktopServer } from './server.js';

describe('desktop server', () => {
  it('serves boot readiness string over HTTP', async () => {
    const desktopServer = await startDesktopServer(0);
    const address = desktopServer.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toBe('scorecraft-desktop-shell-ready');

    await new Promise<void>((resolve, reject) => {
      desktopServer.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
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
});
