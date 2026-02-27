import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserializeScore } from '@scorecraft/core';
import { addMeasure, advancePlayback, applyArticulationEdits, applyHotkey, applyInspectorEdits, applyTextSymbolEdits, createDesktopShell, desktopShellBoot, exportMidiWithNotifications, saveProject, setMode, stepInsertNote, updateTransport, type DesktopShellState } from './index.js';

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

const isArticulation = (value: unknown): value is 'none' | 'accent' | 'staccato' | 'tenuto' =>
  value === 'none' || value === 'accent' || value === 'staccato' || value === 'tenuto';

const isNavigationMarker = (value: unknown): value is 'DC' | 'DS' | 'Fine' | 'Coda' =>
  value === 'DC' || value === 'DS' || value === 'Fine' || value === 'Coda';

const coerceDuration = (duration: 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th' | undefined): 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirtySecond' | 'sixtyFourth' => {
  switch (duration) {
    case 'whole':
    case 'half':
    case 'quarter':
    case 'eighth':
      return duration;
    case '16th':
      return 'sixteenth';
    case '32nd':
      return 'thirtySecond';
    case '64th':
      return 'sixtyFourth';
    default:
      return 'quarter';
  }
};

export const createDesktopServer = (port = resolveDesktopPort(process.env.PORT)): DesktopServer => {
  let shellState: DesktopShellState = createDesktopShell();
  const undoStack: DesktopShellState[] = [];
  const redoStack: DesktopShellState[] = [];

  const commitMutation = (mutate: (state: DesktopShellState) => DesktopShellState): void => {
    undoStack.push(structuredClone(shellState));
    if (undoStack.length > 100) {
      undoStack.shift();
    }
    shellState = mutate(shellState);
    redoStack.length = 0;
  };

  const commitMutationAsync = async (mutate: (state: DesktopShellState) => Promise<DesktopShellState>): Promise<void> => {
    undoStack.push(structuredClone(shellState));
    if (undoStack.length > 100) {
      undoStack.shift();
    }
    shellState = await mutate(shellState);
    redoStack.length = 0;
  };

  const server = createServer(async (request, response) => {
    shellState = advancePlayback(shellState);


    if (request.method === 'GET' && request.url === '/api/state') {
      sendJson(response, 200, {
        mode: shellState.mode,
        project: shellState.project,
        measureCount: shellState.score.parts[0]?.staves[0]?.measures.length ?? 0,
        eventCount: shellState.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.length ?? 0,
      });
      return;
    }

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

    if (request.method === 'POST' && request.url === '/api/history') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as { action?: 'undo' | 'redo' };
        if (!payload.action) {
          sendJson(response, 400, { error: 'Missing history action.' });
          return;
        }

        if (payload.action === 'undo') {
          const previous = undoStack.pop();
          if (!previous) {
            sendJson(response, 200, { ok: true, changed: false });
            return;
          }
          redoStack.push(structuredClone(shellState));
          shellState = previous;
          sendJson(response, 200, { ok: true, changed: true });
          return;
        }

        const next = redoStack.pop();
        if (!next) {
          sendJson(response, 200, { ok: true, changed: false });
          return;
        }
        undoStack.push(structuredClone(shellState));
        shellState = next;
        sendJson(response, 200, { ok: true, changed: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid history request.';
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

        const hotkey = payload.hotkey;
        commitMutation((state) => applyHotkey(state, hotkey));
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/api/project/new') {
      try {
        commitMutation(() => createDesktopShell());
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create project.';
        sendJson(response, 400, { error: message });
      }
      return;
    }


    if (request.method === 'POST' && request.url === '/api/measures') {
      try {
        commitMutation((state) => addMeasure(state));
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

        const step = payload.pitch.step;
        const octave = payload.pitch.octave;
        commitMutation((state) => {
          const noteModeState = state.mode !== 'note-input' ? setMode(state, 'note-input') : state;
          return stepInsertNote(noteModeState, { step, octave }, coerceDuration(payload.duration), payload.dots ?? 0);
        });
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to insert note.';
        sendJson(response, 400, { error: message });
      }
      return;
    }



    if (request.method === 'POST' && request.url === '/api/project/save') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as { path?: string };
        if (!payload.path || payload.path.trim() === '') {
          sendJson(response, 400, { error: 'Missing save path.' });
          return;
        }

        shellState = await saveProject(shellState, payload.path, writeFile);
        sendJson(response, 200, { ok: true, path: shellState.project.path, dirty: shellState.project.dirty });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save project.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/api/project/load') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as { path?: string };
        if (!payload.path || payload.path.trim() === '') {
          sendJson(response, 400, { error: 'Missing load path.' });
          return;
        }

        const loadPath = payload.path;
        await commitMutationAsync(async () => {
          const raw = await readFile(loadPath, 'utf8');
          const loadedScore = deserializeScore(raw);
          const nextShell = createDesktopShell({ title: loadedScore.title });
          nextShell.score = loadedScore;
          nextShell.project.path = loadPath;
          nextShell.project.dirty = false;
          return nextShell;
        });

        sendJson(response, 200, { ok: true, title: shellState.score.title });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load project.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/api/midi/export') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as { path?: string };
        if (!payload.path || payload.path.trim() === '') {
          sendJson(response, 400, { error: 'Missing export path.' });
          return;
        }

        shellState = await exportMidiWithNotifications(shellState, payload.path, writeFile);
        const last = shellState.notifications.at(-1);
        if (last?.level === 'error') {
          sendJson(response, 400, { error: last.message });
          return;
        }
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to export MIDI.';
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
          articulation?: unknown;
        };

        if (typeof payload.tempoBpm !== 'number' || Number.isNaN(payload.tempoBpm)) {
          sendJson(response, 400, { error: 'Invalid tempo payload.' });
          return;
        }

        if (!isDynamics(payload.dynamics)) {
          sendJson(response, 400, { error: 'Invalid dynamics payload.' });
          return;
        }

        if (!isArticulation(payload.articulation)) {
          sendJson(response, 400, { error: 'Invalid articulation payload.' });
          return;
        }

        const tempoBpm = payload.tempoBpm;
        const dynamics = payload.dynamics;
        const articulation = payload.articulation;
        commitMutation((state) =>
          applyArticulationEdits(
            applyInspectorEdits(state, {
              tempoBpm,
              repeatStart: payload.repeatStart ?? false,
              repeatEnd: payload.repeatEnd ?? false,
              dynamics,
            }),
            articulation,
          ),
        );

        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update engraving controls.';
        sendJson(response, 400, { error: message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/api/text-symbols') {
      try {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body) as {
          chordSymbol?: unknown;
          navigationMarker?: unknown;
        };

        if (typeof payload.chordSymbol !== 'string') {
          sendJson(response, 400, { error: 'Invalid chord symbol payload.' });
          return;
        }

        if (payload.navigationMarker !== undefined && payload.navigationMarker !== '' && !isNavigationMarker(payload.navigationMarker)) {
          sendJson(response, 400, { error: 'Invalid navigation marker payload.' });
          return;
        }

        const chordSymbol = payload.chordSymbol;
        const navigationMarker = payload.navigationMarker === '' ? undefined : payload.navigationMarker;
        commitMutation((state) =>
          applyTextSymbolEdits(state, {
            chordSymbol,
            ...(navigationMarker !== undefined ? { navigationMarker } : {}),
          }),
        );
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to apply text/symbol edits.';
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
