import { createServer, type Server } from 'node:http';
import { desktopShellBoot } from './index.js';

export interface DesktopServer {
  server: Server;
  port: number;
}

export const createDesktopServer = (port = Number(process.env.PORT ?? 4173)): DesktopServer => {
  const server = createServer((_request, response) => {
    const body = desktopShellBoot();
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
  });

  return { server, port };
};

export const startDesktopServer = async (port?: number): Promise<DesktopServer> => {
  const desktopServer = createDesktopServer(port);
  await new Promise<void>((resolve) => {
    desktopServer.server.listen(desktopServer.port, resolve);
  });
  return desktopServer;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const desktopServer = await startDesktopServer();
  process.stdout.write(`Scorecraft server listening on http://localhost:${desktopServer.port}\n`);
}
