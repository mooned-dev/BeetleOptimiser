// main.js - Electron main process for Beetle Optimiser.
// Following the official Electron docs at
// https://www.electronjs.org/docs/latest/api/browser-window
//
// We use a frameless window with frame: false (so we can have a fully custom
// title bar). The renderer draws its own min/max/close buttons that call back
// via IPC for the actual window operations.
//
// Why not setTitleBarOverlay()? It requires the OS-drawn frame to exist, so
// it cannot be used together with frame: false. We render our own controls.

const { app, BrowserWindow, ipcMain, shell, net, dialog, Tray, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');

// Google's OAuth sign-in is no longer done inside this app at all (see the
// loopback-redirect flow further down) - Google permanently blocks OAuth
// from any embedded webview, including an Electron BrowserWindow, so
// spoofing the UA for that purpose doesn't work and isn't attempted. This
// fallback stays because it's still useful for the app's other requests
// to Google APIs (Firestore, etc.) looking like a normal desktop browser
// rather than "Electron/x.y.z", set this early since app.userAgentFallback
// only affects requests made after it's assigned.
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
app.userAgentFallback = DESKTOP_CHROME_UA;

let mainWindow = null;
let telemetryProcess = null;

// Runs scripts/telemetry.ps1 as a single persistent process (re-spawning
// PowerShell per poll is too slow for a multi-second cadence) and pushes
// each parsed JSON line to the renderer as it arrives.
function startTelemetry() {
  // Inside an asar archive, __dirname is a virtual path that only Node's
  // own fs/require can read transparently - an external process like
  // powershell.exe can't open a file "inside" app.asar. electron-builder's
  // asarUnpack (see package.json) extracts scripts/ next to the asar as
  // app.asar.unpacked instead; in dev (no asar at all) this replace is a
  // no-op since the string "app.asar" never appears in the path.
  const scriptPath = path.join(__dirname, 'scripts', 'telemetry.ps1')
    .replace('app.asar', 'app.asar.unpacked');
  telemetryProcess = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { windowsHide: true }
  );

  let buffer = '';
  telemetryProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const data = JSON.parse(line);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('system:telemetry', data);
        }
        if (flyoutWindow && !flyoutWindow.isDestroyed()) {
          flyoutWindow.webContents.send('system:telemetry', data);
        }
      } catch (e) { /* skip a malformed line rather than crash the reader */ }
    }
  });

  telemetryProcess.on('error', (err) => {
    console.error('[telemetry] failed to start:', err);
    telemetryProcess = null;
  });
  telemetryProcess.on('exit', (code) => {
    if (code !== null && code !== 0) console.error('[telemetry] exited with code', code);
    telemetryProcess = null;
  });
}

// Firebase Auth's OAuth popup/redirect flow needs a verifiable origin to
// check against the project's authorized-domains list - per Firebase's own
// docs (see the comment above the loadURL call below), this requires
// http(s):// and does not work with a file:// origin at all, regardless of
// User-Agent or any other patch. So the renderer is served from a small
// local static server instead of BrowserWindow.loadFile(). "localhost" is
// authorized by default in every Firebase project - "127.0.0.1" is NOT
// (verified in this project's Authentication > Settings > Authorized
// domains: only localhost, beetle-studio.firebaseapp.com, and
// beetle-studio.web.app are listed), so this must bind to localhost
// specifically, not 127.0.0.1, even though both resolve to loopback.
let localServer = null;
let localServerPort = null;

const MIME_TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function startLocalServer() {
  const distDir = path.join(__dirname, 'dist');
  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      const reqPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);
      // Guard against escaping distDir via a crafted request path.
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    localServer.on('error', reject);
    // Bind to "localhost" specifically, not 127.0.0.1 - confirmed via
    // Firebase Console (Authentication > Settings > Authorized domains)
    // that only "localhost" is authorized by default, not 127.0.0.1 (they
    // are distinct entries there even though both resolve to loopback).
    // Port 0 lets the OS pick a free port - avoids clashing with the Vite
    // dev server (5173) or anything else already listening.
    localServer.listen(0, 'localhost', () => {
      localServerPort = localServer.address().port;
      resolve(localServerPort);
    });
  });
}

function stopLocalServer() {
  if (localServer) { localServer.close(); localServer = null; }
}

function stopTelemetry() {
  if (telemetryProcess) {
    telemetryProcess.kill();
    telemetryProcess = null;
  }
}

// Resolves to build/icon.ico if present, else build/icon.png (the only one
// actually checked into this project right now), else undefined (Electron's
// own default icon) - shared by both the window and the tray so they match.
function resolveAppIconPath() {
  const icoPath = path.join(__dirname, 'build', 'icon.ico');
  if (fs.existsSync(icoPath)) return icoPath;
  const pngPath = path.join(__dirname, 'build', 'icon.png');
  if (fs.existsSync(pngPath)) return pngPath;
  return undefined;
}

async function createMainWindow() {
  let iconPath = resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1024,
    minHeight: 680,
    frame: false,             // frameless so we control the title bar fully
    titleBarStyle: 'hidden',  // macOS: hide system bar but keep resize borders
    title: 'BeetleOptimiser',
    icon: iconPath,
    backgroundColor: '#0F1426',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Windows 11 Mica material - per Electron docs.
  if (process.platform === 'win32') {
    try { mainWindow.setBackgroundMaterial('mica'); } catch (e) { /* not available */ }
  }

  // Prevent double-click-maximize flicker on frameless windows.
  // Without the OS frame, double-clicking the title-bar drag region fires
  // a 'maximize' event. We immediately unmaximize to cancel it, but there
  // is still a 1-frame flicker. To eliminate it entirely, we use a
  // webContents event handler that intercepts the double-click before
  // it reaches the window manager.
  mainWindow.on('maximize', () => { mainWindow.unmaximize(); });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Block double-clicks on the title bar drag region only.
    if (input.type === 'mouseDoubleClick') {
      event.preventDefault();
      // Note: doesn't actually stop the click but doesn't trigger our state
    }
  });

  // Per Firebase's own Electron guidance, signInWithPopup needs the app
  // loaded from an http(s) origin - loadFile's file:// has no origin
  // Firebase's authorized-domains check can verify against, and OAuth
  // silently cannot complete regardless of User-Agent or anything else.
  // Must be "localhost", not "127.0.0.1" - see startLocalServer's comment.
  const port = await startLocalServer();
  mainWindow.loadURL(`http://localhost:${port}/index.html`);

  // Clicking the X hides to the tray instead of quitting - this is how the
  // real Auslogics BoostSpeed behaves too (it keeps running so its
  // dashboard telemetry/tray icon stay live), and it's the whole reason a
  // tray icon exists at all: closing the window shouldn't stop the app.
  // isQuitting is only set true from the tray's own "Quit" item or the
  // OS's actual shutdown/before-quit path, so that route still really quits.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

let tray = null;
let isQuitting = false;

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ----------------------------------------------------------------------
// Tray flyout: a small popup anchored above the tray icon on hover, showing
// the live Status widget (Security/Drive/Disk + CPU/RAM/Net + Ask a
// question) - this used to be a corner overlay baked into the Dashboard
// tab, but that's not where the real Auslogics BoostSpeed widget lives:
// it's a tray popup, opened from near the clock, independent of whether
// the main window is even open. See src/FlyoutApp.jsx for the renderer
// side and StatusOverlay.jsx's `standalone` prop for the layout tweak.
//
// Built lazily (on first hover) rather than at startup, since most
// sessions may never hover the tray icon at all.
// ----------------------------------------------------------------------
let flyoutWindow = null;
let flyoutHovered = false;
let hideFlyoutTimer = null;
// True between creating a brand-new flyout window and its first real
// 'flyout:resize' report - see the comment on ipcMain's 'flyout:resize'
// handler below for why the window stays hidden+un-positioned until then.
let flyoutPendingShow = false;

// Rough placeholder size for the split-second before the renderer's own
// ResizeObserver (FlyoutApp.jsx) reports the real content size. Never
// actually shown at this size (see flyoutPendingShow) - it only matters as
// the window's starting bounds so setSize/setBounds have something to
// resize FROM.
const FLYOUT_WIDTH = 348;
const FLYOUT_HEIGHT = 460;

function createFlyoutWindow() {
  flyoutWindow = new BrowserWindow({
    width: FLYOUT_WIDTH,
    height: FLYOUT_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  flyoutWindow.loadURL(`http://localhost:${localServerPort}/index.html#flyout`);

  // Clicking anywhere outside it closes it - matching every native Windows
  // tray flyout (volume, network, calendar). The hover-based path below
  // handles the "mouse just moved away" case; this handles "clicked
  // elsewhere on the desktop" while the popup still had focus.
  flyoutWindow.on('blur', () => scheduleHideFlyout(150));
  flyoutWindow.on('closed', () => { flyoutWindow = null; });
}

// Positions the flyout centered on the tray icon, flipped above/below
// depending on which half of the display the tray icon sits in (handles
// a top-mounted taskbar, not just the common bottom one).
function positionFlyoutNearTray() {
  if (!flyoutWindow || !tray) return;
  const trayBounds = tray.getBounds();
  const { width, height } = flyoutWindow.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const wa = display.workArea;
  const trayCenterY = trayBounds.y + trayBounds.height / 2;
  const showAbove = trayCenterY > wa.y + wa.height / 2;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  let y = showAbove
    ? Math.round(trayBounds.y - height - 8)
    : Math.round(trayBounds.y + trayBounds.height + 8);

  x = Math.min(Math.max(x, wa.x + 4), wa.x + wa.width - width - 4);
  y = Math.min(Math.max(y, wa.y + 4), wa.y + wa.height - height - 4);
  flyoutWindow.setBounds({ x, y, width, height });
}

function scheduleHideFlyout(delayMs = 250) {
  clearTimeout(hideFlyoutTimer);
  hideFlyoutTimer = setTimeout(() => {
    if (flyoutWindow && !flyoutWindow.isDestroyed() && !flyoutHovered) {
      flyoutWindow.hide();
    }
  }, delayMs);
}

function showFlyout() {
  clearTimeout(hideFlyoutTimer);
  if (!flyoutWindow || flyoutWindow.isDestroyed()) {
    createFlyoutWindow();
    // First-ever load: wait for FlyoutApp's ResizeObserver to report the
    // real content size (below) before showing anything, so the popup
    // never flashes at the placeholder guessed size.
    flyoutPendingShow = true;
  } else {
    positionFlyoutNearTray();
    flyoutWindow.show();
  }
}

ipcMain.on('flyout:hover', (_event, hovered) => {
  flyoutHovered = !!hovered;
  if (flyoutHovered) clearTimeout(hideFlyoutTimer);
  else scheduleHideFlyout();
});

// FlyoutApp.jsx measures its own rendered content via a ResizeObserver and
// reports it here - the popup is sized to fit exactly, not to a fixed
// guess (the original fixed-height version left a large empty area below
// the actual card, which is what looked "too big").
ipcMain.on('flyout:resize', (_event, { width, height }) => {
  if (!flyoutWindow || flyoutWindow.isDestroyed()) return;
  flyoutWindow.setSize(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  positionFlyoutNearTray();
  if (flyoutPendingShow) {
    flyoutPendingShow = false;
    flyoutWindow.show();
  }
});

ipcMain.handle('flyout:navigate', (_event, tab) => {
  if (flyoutWindow && !flyoutWindow.isDestroyed()) flyoutWindow.hide();
  showMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:navigate', tab);
  return { ok: true };
});

function createTray() {
  const iconPath = resolveAppIconPath();
  if (!iconPath) return; // no icon asset available - skip rather than show a blank/broken tray icon
  tray = new Tray(iconPath);
  tray.setToolTip('Beetle Optimiser');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Beetle Optimiser', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit', click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Left-click on Windows conventionally toggles the window rather than
  // only opening the context menu (that's what right-click is for).
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });

  // Hover shows the live-status flyout, matching how Windows' own tray
  // icons (volume, network, battery) reveal a popup on mouse-over rather
  // than requiring a click. mouse-enter/mouse-leave are Windows/macOS only
  // per Electron's Tray docs - unsupported platforms just never fire them,
  // so the flyout simply never appears there and click-to-open still works.
  tray.on('mouse-enter', showFlyout);
  tray.on('mouse-leave', () => scheduleHideFlyout());
}

// IPC handlers for window controls
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ----------------------------------------------------------------------
// SYSTEM utility IPCs (openExternal + shell)
//
// openExternal(url) hands off to Electron's built-in shell.openExternal
// so the renderer can launch a real Windows URI handler (e.g.
// ms-settings:defaultapps) without spawning its own process. The URL
// must use a registered protocol; arbitrary http(s) URLs are passed
// through (useful for opening the Auslogics download page from a
// "Create BoostSpeed Portable" promo).
//
// shell(command, ...args) is a thin wrapper around child_process.spawn
// for one-off PowerShell or cmd commands that don't justify a dedicated
// IPC channel. Output is captured but the call returns a structured
// {ok, exitCode, stderr} - the caller is responsible for any UI.
// Both reject with an Error if the process can't be spawned.
// ----------------------------------------------------------------------

ipcMain.handle('system:open-external', async (_, url) => {
  if (typeof url !== 'string' || !url) {
    throw new Error('openExternal: url is required');
  }
  await shell.openExternal(url);
  return { ok: true };
});

// ----------------------------------------------------------------------
// CHAT: local LLM inference via node-llama-cpp, for the "Ask a Question"
// tab (see llm-training/ for how the model is built - fine-tuned on
// Windows troubleshooting Q&A, quantized to GGUF). node-llama-cpp is
// ESM-only, so it's loaded via dynamic import() rather than require()
// even though this file is CommonJS.
//
// The model ships at models/beetle.Q4_K_M.gguf (copied in from
// llm-training/models/ once training+quantization is done - that folder
// itself never ships, it's a dev-time staging area). Same asar-unpacking
// concern as scripts/: node-llama-cpp's native binary can't read a file
// packed inside app.asar, so this path needs the same
// app.asar -> app.asar.unpacked swap, and models/ needs to be added to
// package.json's asarUnpack list alongside scripts/.
//
// If the model file isn't there yet (still training) or fails to load,
// this returns { ok: false } rather than throwing - the renderer already
// has its own client-side keyword-search fallback (src/lib/ragSearch.js)
// for exactly this case, so a missing/broken model degrades gracefully
// instead of breaking the tab.
const CHAT_MODEL_PATH = path.join(__dirname, 'models', 'beetle.Q4_K_M.gguf')
  .replace('app.asar', 'app.asar.unpacked');

const CHAT_SYSTEM_PROMPT = (
  'You are Beetle, the built-in Windows PC troubleshooting assistant inside Beetle Optimiser. '
  + 'You help with performance, startup, memory, disk space, registry, drivers, Windows updates, '
  + 'and common Windows errors. If a question is outside this scope, say so politely instead of '
  + 'guessing, and suggest what you can actually help with.'
);

let chatSessionPromise = null;

function getChatSession() {
  if (!fs.existsSync(CHAT_MODEL_PATH)) return null;
  if (!chatSessionPromise) {
    chatSessionPromise = (async () => {
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath: CHAT_MODEL_PATH });
      const context = await model.createContext();
      return new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: CHAT_SYSTEM_PROMPT,
      });
    })().catch((err) => {
      chatSessionPromise = null; // let the next call retry instead of caching a failure forever
      throw err;
    });
  }
  return chatSessionPromise;
}

ipcMain.handle('chat:ask', async (_, question) => {
  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('chat:ask: question is required');
  }
  let session;
  try {
    session = await getChatSession();
  } catch (err) {
    return { ok: false, reason: 'load-error', message: String(err) };
  }
  if (!session) return { ok: false, reason: 'model-not-ready' };
  try {
    const answer = await session.prompt(question);
    return { ok: true, answer };
  } catch (err) {
    return { ok: false, reason: 'inference-error', message: String(err) };
  }
});

// ----------------------------------------------------------------------
// OAuth sign-in via an external-browser + custom-protocol handoff.
//
// Google permanently blocks OAuth from ANY embedded webview (including an
// Electron BrowserWindow popup) - a hard security policy enforced since
// 2021 (see developers.googleblog.com's "Upcoming security changes to
// Google's OAuth 2.0 authorization endpoint in embedded webviews"),
// independent of User-Agent spoofing. So the consent screen has to run in
// the user's real system browser (shell.openExternal).
//
// A plain http://127.0.0.1:PORT loopback redirect (RFC 8252, Google's own
// recommended installed-app flow) works, but leaves the raw address in the
// browser's address bar for the final step. Google explicitly disallows
// registering a custom URI scheme (e.g. beetleoptimiser://) directly as an
// OAuth redirect_uri - it's blocked as an anti-impersonation measure (see
// developers.googleblog.com's "Improving user safety in OAuth flows through
// new OAuth Custom URI scheme restrictions"). The pattern real desktop apps
// (Slack, VS Code, etc.) use instead: register a normal https redirect_uri
// - a small hosted "bridge" page - and have THAT page's own JS immediately
// redirect to the custom scheme. Google's server only ever sees a valid
// https URL; the custom-scheme hop happens after Google is out of the
// picture entirely.
//
// The bridge here is a Cloudflare Worker at https://auth.mooned.dev/callback
// (source: see the "beetle-oauth-bridge" Worker in the mooned.dev Cloudflare
// account) that forwards every query param verbatim to
// beetleoptimiser://oauth-callback. It's provider-agnostic - which of the
// two flows below is waiting is tracked here via the `state` param, not by
// anything the bridge page does.
const GOOGLE_WEB_CLIENT_ID = '405417987229-v734pmv7ik4nu538v2140lpf0tlvvfv3.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_SECRET = '<REDACTED>';
const GITHUB_CLIENT_ID = '<REDACTED>';
const GITHUB_CLIENT_SECRET = '<REDACTED>';
const OAUTH_BRIDGE_REDIRECT_URI = 'https://auth.mooned.dev/callback';
const OAUTH_PROTOCOL = 'beetleoptimiser';

// A custom-protocol activation launches a NEW OS process of this same exe
// with the URL as an argv entry - requestSingleInstanceLock + 'second-instance'
// (below, near app.whenReady) forwards that URL to the already-running
// instance instead of opening a second app window.
//
// Electron's own docs call out that this registration only works as a bare
// "electron.exe %1" in the PACKAGED app, where process.execPath IS the whole
// app. Running from source ("electron.exe ."), the OS would launch plain
// electron.exe with the callback URL as its only argument - Electron then
// tries to interpret that URL as an app path to load and fails with
// "Cannot find module <url>". The documented fix is to explicitly pass the
// app directory as an extra argument when unpackaged.
if (app.isPackaged) {
  app.setAsDefaultProtocolClient(OAUTH_PROTOCOL);
} else {
  app.setAsDefaultProtocolClient(OAUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
}

const pendingOAuthCallbacks = new Map(); // state -> resolve(URLSearchParams)

function handleProtocolUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(`${OAUTH_PROTOCOL}://`)) return;
  let params;
  try {
    params = new URL(url).searchParams;
  } catch (e) {
    return;
  }
  const state = params.get('state');
  const resolve = pendingOAuthCallbacks.get(state);
  if (resolve) {
    pendingOAuthCallbacks.delete(state);
    resolve(params);
  }
}

function waitForProtocolCallback(state, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingOAuthCallbacks.delete(state);
      reject(new Error('Sign-in timed out'));
    }, timeoutMs);
    pendingOAuthCallbacks.set(state, (params) => {
      clearTimeout(timer);
      resolve(params);
    });
  });
}

// If the user closes/abandons the browser tab without finishing, the
// promise above would otherwise just sit there until the 5-minute timeout -
// the renderer's "Waiting for browser..." button had no way to escape that
// except waiting it out. This lets a fresh sign-in click (or any explicit
// cancel) immediately unstick it: resolving with a synthetic error makes
// externalBrowserOAuth's existing params.has('error') path throw right away.
ipcMain.handle('auth:cancel-login', () => {
  for (const resolve of pendingOAuthCallbacks.values()) {
    resolve(new URLSearchParams({ error: 'cancelled' }));
  }
  pendingOAuthCallbacks.clear();
  return { ok: true };
});

// Runs one full external-browser OAuth round-trip: opens the authorize URL
// in the system browser, waits for the bridge page to hand control back via
// the custom protocol, then exchanges the code for tokens via a direct POST
// (no browser involved, so no CORS issue and the client secret never leaves
// this process).
async function externalBrowserOAuth({ buildAuthorizeUrl, tokenUrl, buildTokenBody }) {
  const state = crypto.randomUUID();
  const callbackPromise = waitForProtocolCallback(state);
  await shell.openExternal(buildAuthorizeUrl(state));

  const params = await callbackPromise;
  if (params.has('error')) {
    throw new Error(`OAuth provider returned an error: ${params.get('error')}`);
  }
  const code = params.get('code');
  if (!code) throw new Error('OAuth callback did not include an authorization code');

  // net.fetch is Electron's documented replacement for the Fetch API in
  // the main process (respects the OS/Chromium network stack, incl.
  // proxy config) - see electronjs.org/docs/latest/api/net.
  const response = await net.fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams(buildTokenBody(code)).toString(),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${await response.text()}`);
  }
  const body = await response.json();
  // GitHub's token endpoint returns HTTP 200 even on failure (e.g.
  // bad_verification_code, redirect_uri_mismatch), with the actual error in
  // the JSON body - response.ok alone misses this, so the exchange looked
  // "successful" while tokens.access_token was silently undefined.
  if (body.error) {
    throw new Error(`Token exchange failed: ${body.error_description || body.error}`);
  }
  return body;
}

ipcMain.handle('auth:login-google', async () => {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const tokens = await externalBrowserOAuth({
    buildAuthorizeUrl: (state) => {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.searchParams.set('client_id', GOOGLE_WEB_CLIENT_ID);
      u.searchParams.set('redirect_uri', OAUTH_BRIDGE_REDIRECT_URI);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', 'openid email profile');
      u.searchParams.set('state', state);
      u.searchParams.set('code_challenge', codeChallenge);
      u.searchParams.set('code_challenge_method', 'S256');
      u.searchParams.set('prompt', 'select_account');
      return u.toString();
    },
    tokenUrl: 'https://oauth2.googleapis.com/token',
    buildTokenBody: (code) => ({
      code,
      client_id: GOOGLE_WEB_CLIENT_ID,
      client_secret: GOOGLE_WEB_CLIENT_SECRET,
      redirect_uri: OAUTH_BRIDGE_REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });

  return { provider: 'google', idToken: tokens.id_token, accessToken: tokens.access_token };
});

ipcMain.handle('auth:login-github', async () => {
  const tokens = await externalBrowserOAuth({
    buildAuthorizeUrl: (state) => {
      const u = new URL('https://github.com/login/oauth/authorize');
      u.searchParams.set('client_id', GITHUB_CLIENT_ID);
      u.searchParams.set('redirect_uri', OAUTH_BRIDGE_REDIRECT_URI);
      u.searchParams.set('scope', 'read:user user:email');
      u.searchParams.set('state', state);
      return u.toString();
    },
    tokenUrl: 'https://github.com/login/oauth/access_token',
    buildTokenBody: (code) => ({
      code,
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      redirect_uri: OAUTH_BRIDGE_REDIRECT_URI,
    }),
  });

  return { provider: 'github', accessToken: tokens.access_token };
});

ipcMain.handle('system:shell', async (_, payload) => {
  const cmd = payload?.command;
  const args = Array.isArray(payload?.args) ? payload.args : [];
  if (typeof cmd !== 'string' || !cmd) {
    throw new Error('shell: command is required');
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => {
      resolve({ ok: false, error: String(err), stderr, stdout });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, exitCode: code, stderr: stderr.slice(0, 500), stdout: stdout.slice(0, 500) });
    });
  });
});

// ----------------------------------------------------------------------
// OPTIMIZER IPC handlers (Phase 1 item f)
//
// Each handler spawns a single PowerShell subcommand under scripts/ and
// parses NDJSON lines from stdout. The handler always collects the lines
// into an array and returns them via the `invoke` round-trip; the renderer
// can then show e.g. per-category "files / bytes" rows in a card.
//
// Scripts inside an asar archive: the telemetry handler above uses the
// standard `replace('app.asar', 'app.asar.unpacked')` trick to make scripts/
// resolve next to the asar. Asar builds need to list scripts/ in
// asarUnpack (electron-builder config) for this to work.
//
// Errors from the script surface as a rejection - the renderer's safe
// behavior is to display the error, not silently no-op.
//
// CONFIRMATION SAFEGUARD: destructive ops (clean-junk, uninstall-do,
// disable/enable-startup, repair-registry) used to fire unconditionally
// with --yes the moment the renderer called them, trusting a "Confirm
// modal" that never actually got built - the same trust-the-caller gap
// implicated in a prior incident where a test run wiped real temp files.
// Now each destructive handler requires a short-lived, single-use token
// minted by requestConfirm() for that exact action. A bare renderer call
// with no token (e.g. from devtools) is rejected instead of executing.
// ----------------------------------------------------------------------

const pendingConfirmations = new Map();
const CONFIRM_TTL_MS = 30_000;

ipcMain.handle('optimizer:request-confirm', (_, action) => {
  const token = crypto.randomUUID();
  pendingConfirmations.set(token, { action, expires: Date.now() + CONFIRM_TTL_MS });
  return token;
});

function consumeConfirmation(token, expectedAction) {
  const pending = pendingConfirmations.get(token);
  if (pending) pendingConfirmations.delete(token); // single-use either way
  if (!pending || pending.action !== expectedAction || Date.now() > pending.expires) {
    throw new Error(`Action "${expectedAction}" was not explicitly confirmed`);
  }
}

function spawnOptimizer(scriptRel, args) {
  const scriptPath = path.join(__dirname, scriptRel).replace('app.asar', 'app.asar.unpacked');
  const child = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...(args || [])],
    { windowsHide: true }
  );
  const result = { items: [], stderr: '', exitCode: null };
  return new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try { result.items.push(JSON.parse(line)); } catch (_) { /* skip */ }
      }
    });
    child.stderr.on('data', (c) => { result.stderr += c.toString(); });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      result.exitCode = code;
      if (code === 0) resolve(result);
      else reject(new Error(`${scriptRel} exited ${code}: ${result.stderr.slice(0, 200)}`));
    });
  });
}

// System Information - read-only, no confirm token needed (never writes).
ipcMain.handle('optimizer:get-sysinfo', () => spawnOptimizer('scripts/optimize-sysinfo.ps1', []));

// Disk Doctor - wraps Windows' own Repair-Volume. Scan is read-only but
// still requires an elevated process (Repair-Volume itself demands it,
// independent of our confirm-token gate) - an access-denied result is
// reported back to the renderer rather than treated as a script bug.
ipcMain.handle('optimizer:diskdoctor-scan', (_, driveLetter) =>
  spawnOptimizer('scripts/optimize-diskdoctor.ps1', driveLetter ? [driveLetter] : []));
ipcMain.handle('optimizer:diskdoctor-repair', (_, driveLetter, token) => {
  consumeConfirmation(token, 'diskdoctor-repair');
  return spawnOptimizer('scripts/optimize-diskdoctor.ps1', [...(driveLetter ? [driveLetter] : []), '--yes']);
});

// Service Manager - list / disable / enable, same shape as Startup Manager.
ipcMain.handle('optimizer:list-services', () => spawnOptimizer('scripts/optimize-services.ps1', ['list']));
ipcMain.handle('optimizer:disable-service', (_, name, token) => {
  consumeConfirmation(token, 'disable-service');
  return spawnOptimizer('scripts/optimize-services.ps1', ['disable', '--name', name, '--yes']);
});
ipcMain.handle('optimizer:enable-service', (_, name, token) => {
  consumeConfirmation(token, 'enable-service');
  return spawnOptimizer('scripts/optimize-services.ps1', ['enable', '--name', name, '--yes']);
});

// Task Scheduler manager - list / disable / enable, same shape as Service
// Manager. List excludes \Microsoft\Windows\* by default (500+ internal
// maintenance tasks most users have no reason to touch).
ipcMain.handle('optimizer:list-scheduled-tasks', () => spawnOptimizer('scripts/optimize-scheduled-tasks.ps1', ['list']));
ipcMain.handle('optimizer:disable-scheduled-task', (_, taskPath, taskName, token) => {
  consumeConfirmation(token, 'disable-scheduled-task');
  return spawnOptimizer('scripts/optimize-scheduled-tasks.ps1', ['disable', '--path', taskPath, '--name', taskName, '--yes']);
});
ipcMain.handle('optimizer:enable-scheduled-task', (_, taskPath, taskName, token) => {
  consumeConfirmation(token, 'enable-scheduled-task');
  return spawnOptimizer('scripts/optimize-scheduled-tasks.ps1', ['enable', '--path', taskPath, '--name', taskName, '--yes']);
});
ipcMain.handle('optimizer:create-scheduled-task', (_, name, trigger, command, args, token) => {
  consumeConfirmation(token, 'create-scheduled-task');
  const argv = ['create', '--taskname', name, '--trigger', trigger, '--command', command];
  if (args) argv.push('--cargs', args);
  argv.push('--yes');
  return spawnOptimizer('scripts/optimize-scheduled-tasks.ps1', argv);
});
ipcMain.handle('optimizer:delete-scheduled-task', (_, taskPath, taskName, token) => {
  consumeConfirmation(token, 'delete-scheduled-task');
  return spawnOptimizer('scripts/optimize-scheduled-tasks.ps1', ['delete', '--path', taskPath, '--name', taskName, '--yes']);
});

// Tweak Manager - real reversible tweaks behind MaintainView's Performance /
// Stability / Internet categories (Security stays Pro-gated, no backend).
ipcMain.handle('optimizer:tweaks-status', () => spawnOptimizer('scripts/optimize-tweaks.ps1', ['status']));
ipcMain.handle('optimizer:tweaks-apply', (_, id, token) => {
  consumeConfirmation(token, 'tweaks-apply');
  return spawnOptimizer('scripts/optimize-tweaks.ps1', ['apply', '--id', id, '--yes']);
});
ipcMain.handle('optimizer:tweaks-revert', (_, id, token) => {
  consumeConfirmation(token, 'tweaks-revert');
  return spawnOptimizer('scripts/optimize-tweaks.ps1', ['revert', '--id', id, '--yes']);
});

// Driver check - read-only (installing a driver needs the vendor's own
// package, out of scope for a safe scripted action).
ipcMain.handle('optimizer:list-drivers', () => spawnOptimizer('scripts/optimize-drivers.ps1', []));
ipcMain.handle('optimizer:internet-list', () => spawnOptimizer('scripts/optimize-internet.ps1', ['list']));
ipcMain.handle('optimizer:internet-optimize', (_, token) => {
  consumeConfirmation(token, 'internet-optimize');
  return spawnOptimizer('scripts/optimize-internet.ps1', ['optimize', '--yes']);
});
ipcMain.handle('optimizer:internet-reset', (_, token) => {
  consumeConfirmation(token, 'internet-reset');
  return spawnOptimizer('scripts/optimize-internet.ps1', ['reset', '--yes']);
});

// File Shredder - the user picks files via the OS's own native dialog
// (no way to select "everything in a folder" by accident), then the
// picked paths go through the usual confirm-token gate before the actual
// (irreversible) overwrite-then-delete runs.
ipcMain.handle('optimizer:pick-files-for-shred', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select files to shred',
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled) return { canceled: true, paths: [] };
  return { canceled: false, paths: result.filePaths };
});
ipcMain.handle('optimizer:shred-files', (_, paths, token) => {
  consumeConfirmation(token, 'shred-files');
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('No files given to shred');
  return spawnOptimizer('scripts/optimize-shredder.ps1', [...paths, '--yes']);
});

// Browser Protection check - read-only (HOSTS file hijack indicators,
// Chrome/Edge homepage+startup URL tampering, default browser identity).
ipcMain.handle('optimizer:browser-check', () => spawnOptimizer('scripts/optimize-browser-check.ps1', []));

// Duplicates Finder - scan (size then SHA-256 grouping, read-only) and
// delete (explicit paths only, confirm-gated - same no-wildcards principle
// as the shredder).
ipcMain.handle('optimizer:scan-duplicates', () => spawnOptimizer('scripts/optimize-duplicates.ps1', []));
ipcMain.handle('optimizer:delete-duplicates', (_, paths, token) => {
  consumeConfirmation(token, 'delete-duplicates');
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('No files given to delete');
  return spawnOptimizer('scripts/optimize-duplicates.ps1', ['--delete', ...paths, '--yes']);
});

// Cleanup - scan only (no destructive ops)
ipcMain.handle('optimizer:scan-junk', () => spawnOptimizer('scripts/optimize-cleanup.ps1', []));

// Cleanup - destructive. Requires a token from requestConfirm('clean-junk')
// minted right after the renderer's ConfirmModal was accepted - a bare
// call with no valid token is rejected before any PowerShell process runs.
ipcMain.handle('optimizer:clean-junk', (_, token) => {
  consumeConfirmation(token, 'clean-junk');
  return spawnOptimizer('scripts/optimize-clean-execute.ps1', ['--yes']);
});

// Empty Folder Cleaner - scan only (user profile folders, dev-artifact dirs
// like node_modules/.git pruned from the walk - see the script's own header).
ipcMain.handle('optimizer:scan-empty-folders', () => spawnOptimizer('scripts/optimize-empty-folders.ps1', []));
ipcMain.handle('optimizer:disk-explorer', () => spawnOptimizer('scripts/optimize-disk-explorer.ps1', []));
ipcMain.handle('optimizer:file-recovery-list', () => spawnOptimizer('scripts/optimize-file-recovery.ps1', ['list']));
ipcMain.handle('optimizer:file-recovery-restore', (_, paths, destDir, token) => {
  consumeConfirmation(token, 'file-recovery-restore');
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('No files given to restore');
  return spawnOptimizer('scripts/optimize-file-recovery.ps1', ['restore', ...paths, '--dest', destDir, '--yes']);
});
ipcMain.handle('optimizer:list-addons', () => spawnOptimizer('scripts/optimize-addons.ps1', []));
ipcMain.handle('optimizer:win10-list', () => spawnOptimizer('scripts/optimize-win10.ps1', ['list-all']));
ipcMain.handle('optimizer:wiper-list', () => spawnOptimizer('scripts/optimize-wiper.ps1', ['list']));
ipcMain.handle('optimizer:wiper-wipe', (_, driveLetter, token) => {
  consumeConfirmation(token, 'wiper-wipe');
  return spawnOptimizer('scripts/optimize-wiper.ps1', ['wipe', driveLetter, '--yes']);
});
ipcMain.handle('optimizer:slimmer-list', () => spawnOptimizer('scripts/optimize-windows-slimmer.ps1', ['list']));
ipcMain.handle('optimizer:slimmer-apply', (_, op, token) => {
  consumeConfirmation(token, 'slimmer-apply');
  return spawnOptimizer('scripts/optimize-windows-slimmer.ps1', ['apply', '--op', op, '--yes']);
});
ipcMain.handle('optimizer:mode-list', () => spawnOptimizer('scripts/optimize-mode-switcher.ps1', ['list']));
ipcMain.handle('optimizer:mode-set', (_, schemeId, token) => {
  consumeConfirmation(token, 'mode-set');
  return spawnOptimizer('scripts/optimize-mode-switcher.ps1', ['set', '--scheme', schemeId, '--yes']);
});
ipcMain.handle('optimizer:context-menu-list', () => spawnOptimizer('scripts/optimize-context-menu.ps1', ['list']));
ipcMain.handle('optimizer:context-menu-disable', (_, id, token) => {
  consumeConfirmation(token, 'context-menu-disable');
  return spawnOptimizer('scripts/optimize-context-menu.ps1', ['disable', '--id', id, '--yes']);
});
ipcMain.handle('optimizer:context-menu-enable', (_, id, token) => {
  consumeConfirmation(token, 'context-menu-enable');
  return spawnOptimizer('scripts/optimize-context-menu.ps1', ['enable', '--id', id, '--yes']);
});
// The portable exe has no fixed install path, so the script can't guess it -
// process.execPath is the actual running exe in a packaged build (in dev it
// points at the electron.exe helper instead, which isn't a real launch
// target; the Integrator naturally reports itself as unavailable in that case).
ipcMain.handle('optimizer:integrator-list', () => spawnOptimizer('scripts/optimize-integrator.ps1', ['list', '--exe', process.execPath]));
ipcMain.handle('optimizer:integrator-add', (_, id, token) => {
  consumeConfirmation(token, 'integrator-add');
  return spawnOptimizer('scripts/optimize-integrator.ps1', ['add', '--entry', id, '--exe', process.execPath, '--yes']);
});
ipcMain.handle('optimizer:rescue-list', () => spawnOptimizer('scripts/optimize-rescue.ps1', ['list']));
ipcMain.handle('optimizer:registry-defrag', () => spawnOptimizer('scripts/optimize-registry-defrag.ps1', ['list']));
ipcMain.handle('optimizer:registry-defrag-compact', (_, token) => {
  consumeConfirmation(token, 'registry-defrag-compact');
  return spawnOptimizer('scripts/optimize-registry-defrag.ps1', ['compact', '--yes']);
});
ipcMain.handle('optimizer:action-center', () => spawnOptimizer('scripts/optimize-action-center.ps1', ['list']));
ipcMain.handle('optimizer:action-center-apply', (_, op, token) => {
  consumeConfirmation(token, 'action-center-apply');
  return spawnOptimizer('scripts/optimize-action-center.ps1', ['apply', '--op', op, '--yes']);
});
ipcMain.handle('optimizer:debug-log', () => spawnOptimizer('scripts/optimize-debug-log.ps1', []));
ipcMain.handle('optimizer:disk-priority', () => spawnOptimizer('scripts/optimize-disk-priority.ps1', ['list']));
ipcMain.handle('optimizer:disk-priority-apply', (_, token) => {
  consumeConfirmation(token, 'disk-priority-apply');
  return spawnOptimizer('scripts/optimize-disk-priority.ps1', ['apply', '--yes']);
});
ipcMain.handle('optimizer:backup-cleaner', () => spawnOptimizer('scripts/optimize-backup-cleaner.ps1', ['list']));
ipcMain.handle('optimizer:backup-cleaner-apply', (_, token) => {
  consumeConfirmation(token, 'backup-cleaner-apply');
  return spawnOptimizer('scripts/optimize-backup-cleaner.ps1', ['apply', '--yes']);
});
ipcMain.handle('optimizer:defrag-on-boot', () => spawnOptimizer('scripts/optimize-defrag-on-boot.ps1', ['list']));
ipcMain.handle('optimizer:defrag-on-boot-apply', (_, token) => {
  consumeConfirmation(token, 'defrag-on-boot-apply');
  return spawnOptimizer('scripts/optimize-defrag-on-boot.ps1', ['apply', '--yes']);
});
ipcMain.handle('optimizer:defrag-on-boot-reset', (_, token) => {
  consumeConfirmation(token, 'defrag-on-boot-reset');
  return spawnOptimizer('scripts/optimize-defrag-on-boot.ps1', ['reset', '--yes']);
});
ipcMain.handle('optimizer:browser-helper-objects', () => spawnOptimizer('scripts/optimize-browser-helper-objects.ps1', ['list']));
ipcMain.handle('optimizer:bho-apply', (_, token) => {
  consumeConfirmation(token, 'bho-apply');
  return spawnOptimizer('scripts/optimize-browser-helper-objects.ps1', ['apply', '--yes']);
});
ipcMain.handle('optimizer:integrator-remove', (_, id, token) => {
  consumeConfirmation(token, 'integrator-remove');
  return spawnOptimizer('scripts/optimize-integrator.ps1', ['remove', '--entry', id, '--yes']);
});
ipcMain.handle('optimizer:win10-apply', (_, id, token) => {
  consumeConfirmation(token, 'win10-apply');
  return spawnOptimizer('scripts/optimize-win10.ps1', ['apply:' + id, '--yes']);
});
ipcMain.handle('optimizer:win10-revert', (_, id, token) => {
  consumeConfirmation(token, 'win10-revert');
  return spawnOptimizer('scripts/optimize-win10.ps1', ['revert:' + id, '--yes']);
});
ipcMain.handle('optimizer:list-task-manager', () => spawnOptimizer('scripts/optimize-task-manager.ps1', ['list']));
ipcMain.handle('optimizer:kill-process', (_, pid, token) => {
  consumeConfirmation(token, 'kill-process');
  return spawnOptimizer('scripts/optimize-task-manager.ps1', ['kill', '--pid', String(pid), '--yes']);
});
ipcMain.handle('optimizer:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose folder', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return { canceled: true, paths: [] };
  return { canceled: false, paths: result.filePaths };
});
ipcMain.handle('optimizer:clean-empty-folders', (_, token) => {
  consumeConfirmation(token, 'clean-empty-folders');
  return spawnOptimizer('scripts/optimize-empty-folders.ps1', ['--yes']);
});

// Memory - trim every process's working set. Requires admin (the script
// reports ntstatus=0xC0000061 STATUS_PRIVILEGE_NOT_HELD if not elevated).
// Renderer should disable the button if `ph.isAdmin` is false.
ipcMain.handle('optimizer:trim-working-sets', () =>
  spawnOptimizer('scripts/optimize-memory.ps1', [])
);

// Disk - analyze (default, read-only, no token needed), TRIM (--trim), or
// defrag (--defrag). Defrag rewrites file layout and may take a long time
// on large HDDs; trim/defrag both require a confirmation token the same
// way the other drive/file-mutating ops do.
ipcMain.handle('optimizer:defrag-drive', (_, mode = 'analyze', token) => {
  if (mode !== 'analyze') consumeConfirmation(token, 'defrag-drive');
  return spawnOptimizer('scripts/optimize-defrag.ps1', [mode]);
});

// Apps - list installed programs (read-only) or uninstall a specific one.
// Renderer takes the list result, shows it as a table; user clicks X next to
// an entry, ConfirmModal is accepted, THEN main.js invokes (do) with --yes.
ipcMain.handle('optimizer:uninstall-program', () =>
  spawnOptimizer('scripts/optimize-uninstall.ps1', ['list'])
);
ipcMain.handle('optimizer:uninstall-program-do', (_, productId, token) => {
  consumeConfirmation(token, 'uninstall-program-do');
  return spawnOptimizer('scripts/optimize-uninstall.ps1', ['do', productId, '--yes']);
});

// Startup - list / disable / enable. Disable and enable mutate state and
// require a confirmation token. Renderer should show the list, toggle the
// toggle in the UI, then call the appropriate verb on confirm.
ipcMain.handle('optimizer:list-startup', () =>
  spawnOptimizer('scripts/optimize-startup.ps1', ['list'])
);
ipcMain.handle('optimizer:disable-startup-item', (_, entryId, token) => {
  consumeConfirmation(token, 'disable-startup-item');
  return spawnOptimizer('scripts/optimize-startup.ps1', ['disable', '--entry', entryId, '--yes']);
});
ipcMain.handle('optimizer:enable-startup-item', (_, entryId, token) => {
  consumeConfirmation(token, 'enable-startup-item');
  return spawnOptimizer('scripts/optimize-startup.ps1', ['enable', '--entry', entryId, '--yes']);
});

// Registry - safe orphan scan and opt-in repair. By default we only touch
// "App Paths" keys (the canonical "where is the EXE for this app" registry)
// whose file is gone. The repair IPC needs a confirmation token, which only
// exists once the renderer's ConfirmModal has been accepted.
ipcMain.handle('optimizer:scan-registry', () =>
  spawnOptimizer('scripts/optimize-registry.ps1', ['list'])
);
ipcMain.handle('optimizer:repair-registry', (_, issues, token) => {
  consumeConfirmation(token, 'repair-registry');
  return spawnOptimizer('scripts/optimize-registry.ps1', ['fix', '--id', (issues ?? 'all'), '--yes']);
});

// Windows/Linux: activating the beetleoptimiser:// protocol launches a new
// OS process of this same exe with the URL as an argv entry. Without a
// single-instance lock, that would open a second app window; with it, the
// new process finds the lock held, quits immediately, and instead fires
// 'second-instance' on the original (already-running) process with its
// argv - which is where the OAuth callback URL actually needs to end up.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${OAUTH_PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS delivers custom-protocol activations via 'open-url' instead of a
  // second process launch.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.whenReady().then(async () => {
    await createMainWindow();
    createTray();
    startTelemetry();
  });

  app.on('window-all-closed', () => {
    stopTelemetry();
    stopLocalServer();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    // Marks the real quit path so the window's own 'close' handler (which
    // normally hides to the tray instead) lets this one through.
    isQuitting = true;
    stopTelemetry();
    stopLocalServer();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}
