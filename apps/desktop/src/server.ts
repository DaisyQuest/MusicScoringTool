import { createServer, type Server } from 'node:http';
import { desktopShellBoot } from './index.js';

const DEFAULT_DESKTOP_PORT = 4173;

export interface DesktopServer {
  server: Server;
  port: number;
}

export const resolveDesktopPort = (rawPort: string | undefined, fallback = DEFAULT_DESKTOP_PORT): number => {
  if (rawPort === undefined || rawPort.trim() === '') {
    return fallback;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT value "${rawPort}". Expected an integer between 0 and 65535.`);
  }

  return port;
};

export const createDesktopServer = (port = resolveDesktopPort(process.env.PORT)): DesktopServer => {
  const server = createServer((_request, response) => {
    const body = desktopShellBoot();
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(body);
  });

  return { server, port };
};

export const startDesktopServer = async (port?: number): Promise<DesktopServer> => {
  const desktopServer = createDesktopServer(port);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      desktopServer.server.off('listening', onListening);
      reject(error);
    };

    const onListening = (): void => {
      desktopServer.server.off('error', onError);
      resolve();
    };

    desktopServer.server.once('error', onError);
    desktopServer.server.once('listening', onListening);
    desktopServer.server.listen(desktopServer.port);
  });
  return desktopServer;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const desktopServer = await startDesktopServer();
  process.stdout.write(`Scorecraft server listening on http://localhost:${desktopServer.port}\n`);
}
