import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addMeasure, applyHotkey, applyInspectorEdits, createDesktopShell, desktopShellBoot, setMode, stepInsertNote, updateTransport, type DesktopShellState } from './index.js';

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

const readRequestBody = async (request: IncomingMessage): Promise<string> =>
  await new Promise<string>((resolveBody, rejectBody) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => resolveBody(body));
    request.on('error', (error: Error) => rejectBody(error));
  });

const sendJson = (response: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};



const isDynamics = (value: unknown): value is 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' =>
  value === 'pp' || value === 'p' || value === 'mp' || value === 'mf' || value === 'f' || value === 'ff';

const coerceDuration = (duration: 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th' | undefined): 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' => {
  switch (duration) {
    case 'whole':
    case 'half':
    case 'quarter':
    case 'eighth':
      return duration;
    case '16th':
      return 'sixteenth';
    default:
      return 'quarter';
  }
};

export const createDesktopServer = (port = resolveDesktopPort(process.env.PORT)): DesktopServer => {
  let shellState: DesktopShellState = createDesktopShell();

  const server = createServer(async (request, response) => {

    if (request.method === 'POST' && request.url === '/api/transport') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as { action?: 'toggle-playback' | 'seek-start' };
        if (!payload.action) {
          sendJson(response, 400, { error: 'Missing transport action.' });
          return;
        }

        if (payload.action === 'seek-start') {
          shellState = updateTransport(shellState, { tick: 0, isPlaying: false });
        } else {
          shellState = updateTransport(shellState, { isPlaying: !shellState.transport.isPlaying });
        }

        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid transport request.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/api/hotkey') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as { hotkey?: 'space' | 'v' | 'n' | 't' | 'cmd+k' };
        if (!payload.hotkey) {
          sendJson(response, 400, { error: 'Missing hotkey value.' });
          return;
        }

        shellState = applyHotkey(shellState, payload.hotkey);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request.';
        sendJson(response, 400, { error: message });
      }
      return;
    }


    if (request.method === 'POST' && request.url === '/api/measures') {
      try {
        shellState = addMeasure(shellState);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add measure.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/api/notes') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as {
          pitch?: { step?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'; octave?: number };
          duration?: 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th';
          dots?: 0 | 1 | 2;
        };

        if (!payload.pitch?.step || typeof payload.pitch.octave !== 'number') {
          sendJson(response, 400, { error: 'Invalid pitch payload.' });
          return;
        }

        if (shellState.mode !== 'note-input') {
          shellState = setMode(shellState, 'note-input');
        }

        shellState = stepInsertNote(shellState, { step: payload.pitch.step, octave: payload.pitch.octave }, coerceDuration(payload.duration), payload.dots ?? 0);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to insert note.';
        sendJson(response, 400, { error: message });
      }
      return;
    }


    if (request.method === 'POST' && request.url === '/api/engraving') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as {
          tempoBpm?: number;
          repeatStart?: boolean;
          repeatEnd?: boolean;
          dynamics?: unknown;
        };

        if (typeof payload.tempoBpm !== 'number' || Number.isNaN(payload.tempoBpm)) {
          sendJson(response, 400, { error: 'Invalid tempo payload.' });
          return;
        }

        if (!isDynamics(payload.dynamics)) {
          sendJson(response, 400, { error: 'Invalid dynamics payload.' });
          return;
        }

        shellState = applyInspectorEdits(shellState, {
          tempoBpm: payload.tempoBpm,
          repeatStart: payload.repeatStart ?? false,
          repeatEnd: payload.repeatEnd ?? false,
          dynamics: payload.dynamics,
        });

        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update engraving controls.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    const body = desktopShellBoot(shellState);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
  });

  return { server, port };
};

export const startDesktopServer = async (port?: number): Promise<DesktopServer> => {
  const desktopServer = createDesktopServer(port);
  await new Promise<void>((resolveStart, rejectStart) => {
    const onError = (error: Error): void => {
      desktopServer.server.off('listening', onListening);
      rejectStart(error);
    };

    const onListening = (): void => {
      desktopServer.server.off('error', onError);
      resolveStart();
    };

    desktopServer.server.once('error', onError);
    desktopServer.server.once('listening', onListening);
    desktopServer.server.listen(desktopServer.port);
  });
  return desktopServer;
};

const toComparableEntrypointPath = (entryPath: string): string => {
  if (/^[a-zA-Z]:[\\/]/.test(entryPath)) {
    return entryPath;
  }
  return resolve(entryPath);
};

const normalizeEntrypointPath = (entryPath: string): string => {
  const slashNormalized = normalize(entryPath).replaceAll('\\', '/');
  const withoutDrivePrefixSlash = slashNormalized.replace(/^\/([a-zA-Z]:)/, '$1');
  return withoutDrivePrefixSlash.replace(/^([a-zA-Z]:)/, (_, driveLetter: string) => driveLetter.toLowerCase());
};

export const isServerEntrypointInvocation = (moduleUrl: string, argvPath: string | undefined): boolean => {
  if (!argvPath) {
    return false;
  }

  return (
    normalizeEntrypointPath(toComparableEntrypointPath(fileURLToPath(moduleUrl))) ===
    normalizeEntrypointPath(toComparableEntrypointPath(argvPath))
  );
};

if (isServerEntrypointInvocation(import.meta.url, process.argv[1])) {
  const desktopServer = await startDesktopServer();
  process.stdout.write(`Scorecraft server listening on http://localhost:${desktopServer.port}\n`);
}
