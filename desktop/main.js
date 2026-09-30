// HackGround OS for Windows: plays the intro while the site loads in the
// background, then shows the site in its own window.
const { app, BrowserWindow, Menu, session, shell } = require("electron");
const path = require("path");

const APP_URL = process.env.HACKGROUNDOS_URL || "https://hackgroundos.vercel.app";
const ORIGIN = new URL(APP_URL).origin;
const BG = "#0D0F1C";
// The site opens straight to sign-in for its apps and hides "get the app" links.
const USER_AGENT_TAG = "HackathonBaseApp/1 HackGroundOSDesktop/1";
const MAX_INTRO_MS = 10000;

if (!app.requestSingleInstanceLock()) app.quit();

let intro = null;
let main = null;

const secure = { contextIsolation: true, nodeIntegration: false, sandbox: true };

function createWindows() {
  intro = new BrowserWindow({
    width: 960, height: 540, frame: false, resizable: false, center: true, backgroundColor: BG, show: false,
    icon: path.join(__dirname, "build", "icon.png"), webPreferences: secure,
  });
  intro.loadFile(path.join(__dirname, "pages", "intro.html"));
  intro.once("ready-to-show", () => intro.show());

  main = new BrowserWindow({
    width: 1366, height: 860, minWidth: 380, minHeight: 600, backgroundColor: BG, show: false,
    title: "HackGround OS", autoHideMenuBar: true, icon: path.join(__dirname, "build", "icon.png"), webPreferences: secure,
  });
  main.webContents.setUserAgent(`${main.webContents.getUserAgent()} ${USER_AGENT_TAG}`);
  keepInApp(main.webContents);
  main.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    // -3 = the load was replaced by another navigation; not an error.
    if (isMainFrame && code !== -3 && !url.startsWith("file:")) main.loadFile(path.join(__dirname, "pages", "offline.html"), { query: { url: APP_URL + "/app" } });
  });
  main.loadURL(APP_URL + "/app");

  // Show the site once the intro has played and the page has loaded (or after 10 s).
  const started = Date.now();
  let introDone = false;
  let pageDone = false;
  const reveal = () => {
    if (!main || main.isVisible()) return;
    if (!(introDone && pageDone) && Date.now() - started < MAX_INTRO_MS) return;
    main.maximize();
    main.show();
    if (intro && !intro.isDestroyed()) intro.close();
  };
  intro.webContents.on("page-title-updated", (_e, title) => { if (title === "done") { introDone = true; reveal(); } });
  main.webContents.once("did-finish-load", () => { pageDone = true; reveal(); });
  setTimeout(() => { introDone = true; pageDone = true; reveal(); }, MAX_INTRO_MS);
  main.on("closed", () => { main = null; app.quit(); });
}

/** Pages of the site stay in the window; other links open in the normal browser. */
function keepInApp(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN + "/")) contents.loadURL(url);
    else if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
}

app.on("second-instance", () => {
  const w = main?.isVisible() ? main : intro;
  if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.whenReady().then(() => {
  // The camera is used by the QR check-in page; nothing else is granted.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const fromSite = (details.requestingUrl || contents.getURL()).startsWith(ORIGIN);
    callback(fromSite && (permission === "media" || permission === "clipboard-sanitized-write" || permission === "fullscreen"));
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "HackGround OS", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "togglefullscreen" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  ]));
  createWindows();
});

app.on("window-all-closed", () => app.quit());
