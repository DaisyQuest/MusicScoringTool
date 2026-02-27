export interface KeyboardCommandBinding {
  commandId: string;
  key: string;
}

export interface UiStat {
  label: string;
  value: string;
}

export type UiNotificationLevel = 'success' | 'error' | 'info';

export interface UiNotification {
  level: UiNotificationLevel;
  message: string;
}

export interface DesktopShellUiModel {
  title: string;
  modeLabel: string;
  transportLabel: string;
  projectLabel: string;
  statusTone: 'stable' | 'dirty';
  stats: UiStat[];
  notifications: UiNotification[];
}

export const defaultBindings: KeyboardCommandBinding[] = [
  { commandId: 'insertNote', key: 'N' },
  { commandId: 'transpose', key: 'T' },
];

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const notificationClass = (level: UiNotificationLevel): string => {
  switch (level) {
    case 'success':
      return 'notification success';
    case 'error':
      return 'notification error';
    default:
      return 'notification info';
  }
};

const renderStats = (stats: UiStat[]): string => {
  if (!stats.length) {
    return '<p class="empty-state">No score metrics yet. Start entering notes to populate analytics.</p>';
  }

  return `<dl class="stats-grid">${stats
    .map((stat) => `<div class="stat-card"><dt>${escapeHtml(stat.label)}</dt><dd>${escapeHtml(stat.value)}</dd></div>`)
    .join('')}</dl>`;
};

const renderNotifications = (notifications: UiNotification[]): string => {
  if (!notifications.length) {
    return '<p class="empty-state">No notifications.</p>';
  }

  return `<ul class="notification-list">${notifications
    .map((notification) => `<li class="${notificationClass(notification.level)}">${escapeHtml(notification.message)}</li>`)
    .join('')}</ul>`;
};

export const renderDesktopShellHtml = (model: DesktopShellUiModel): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(model.title)} · Scorecraft Desktop</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #09090f;
        --panel: #141422;
        --panel-strong: #1d2033;
        --text: #f6f7ff;
        --muted: #b1b7d9;
        --accent: #6ee7ff;
        --warning: #fbbf24;
        --success: #34d399;
        --error: #fb7185;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: radial-gradient(circle at top right, #253369 0%, var(--bg) 55%);
        color: var(--text);
        display: flex;
        justify-content: center;
        padding: 2rem;
      }

      main {
        width: min(980px, 100%);
        background: color-mix(in oklab, var(--panel), black 20%);
        border: 1px solid #2f3452;
        border-radius: 20px;
        box-shadow: 0 30px 70px rgb(5 6 16 / 45%);
        overflow: hidden;
      }

      header {
        padding: 1.5rem 1.75rem;
        border-bottom: 1px solid #2f3452;
        background: linear-gradient(125deg, #202a4a, #1a1e34 45%, #141422);
      }

      .mode-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: rgb(110 231 255 / 18%);
        color: var(--accent);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .subhead {
        color: var(--muted);
        margin: 0.4rem 0 0;
      }

      .layout {
        display: grid;
        grid-template-columns: 1.45fr 1fr;
        gap: 1rem;
        padding: 1.3rem;
      }

      section {
        background: var(--panel-strong);
        border-radius: 14px;
        border: 1px solid #313755;
        padding: 1rem;
      }

      h1 {
        margin: 0.6rem 0 0;
        font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      }

      h2 {
        margin: 0;
        font-size: 0.98rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .project-status {
        margin-top: 0.9rem;
        color: ${model.statusTone === 'dirty' ? 'var(--warning)' : 'var(--success)'};
        font-weight: 600;
      }

      .stats-grid {
        margin: 0.9rem 0 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 0.7rem;
      }

      .stat-card {
        background: #171d35;
        border: 1px solid #374167;
        border-radius: 12px;
        padding: 0.65rem;
      }

      .stat-card dt {
        font-size: 0.74rem;
        color: var(--muted);
        margin-bottom: 0.3rem;
      }

      .stat-card dd {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
      }

      .notification-list {
        list-style: none;
        margin: 0.9rem 0 0;
        padding: 0;
        display: grid;
        gap: 0.55rem;
      }

      .notification {
        border-radius: 10px;
        padding: 0.65rem 0.75rem;
        border: 1px solid transparent;
      }

      .notification.info {
        background: rgb(96 165 250 / 16%);
        border-color: rgb(125 211 252 / 40%);
      }

      .notification.success {
        background: rgb(52 211 153 / 16%);
        border-color: rgb(167 243 208 / 40%);
      }

      .notification.error {
        background: rgb(251 113 133 / 16%);
        border-color: rgb(251 113 133 / 35%);
      }

      .empty-state {
        margin: 0.9rem 0 0;
        color: var(--muted);
        font-style: italic;
      }

      @media (max-width: 840px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <span class="mode-pill">${escapeHtml(model.modeLabel)}</span>
        <h1>${escapeHtml(model.title)}</h1>
        <p class="subhead">${escapeHtml(model.transportLabel)} · ${escapeHtml(model.projectLabel)}</p>
        <p class="project-status">${escapeHtml(model.statusTone === 'dirty' ? 'Unsaved changes' : 'All changes saved')}</p>
      </header>

      <div class="layout">
        <section>
          <h2>Live score metrics</h2>
          ${renderStats(model.stats)}
        </section>

        <section>
          <h2>Session notifications</h2>
          ${renderNotifications(model.notifications)}
        </section>
      </div>
    </main>
  </body>
</html>`;
