// main.js
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

const store = new Store({ name: 'xeo-keymapper' });

let mainWindow = null;
let tray = null;
let paused = false;
let quitting = false; // flag used when quitting from tray

// try optional system-level hook (iohook)
let iohook = null;
try {
  iohook = require('iohook');
  console.log('iohook loaded -> system-level recording available (best capture).');
} catch (e) {
  console.log('iohook not available - system-level recording disabled (fallback will be used).');
}

// defaults for settings
const defaultSettings = {
  startAtLogin: false,
  minimizeToTray: true,
  startMinimized: false
};

function getSettings() {
  return store.get('settings', defaultSettings);
}
function setSettings(partial) {
  const s = Object.assign({}, getSettings(), partial);
  store.set('settings', s);
  // apply startAtLogin immediately if changed
  try {
    if (app.setLoginItemSettings) {
      app.setLoginItemSettings({ openAtLogin: !!s.startAtLogin });
    }
  } catch (e) {
    console.warn('Failed to set login item settings:', e);
  }
  return s;
}

// util: app-level flags for menu/tray
function createWindow() {
  const s = getSettings();
  
  // أيقونة نافذة التطبيق (Base64 SVG)
  // داخل createWindow()
const appIconBase64 = `
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABfUlEQVR4nO3YsQ3CMAwE0ONr7VwX
7rUDLAFoF5bBWz2x0mSwNYe+U7cNzG3b0YJCYmJmZmwv5/NAgAEBAQEhISEiAc4D0RzHcqzsq3c5d6
f0+zHzj76fJ+6tQkBAQEBwP/AeIqD/oaYkRc4+zHaH0fJzF1g0y0+9uPbL99f35+7XV1dFhISEhISE
hL8AmQ+g2ol1+xAAAAAElFTkSuQmCC
`;

// استخدامه لنافذة التطبيق
mainWindow = new BrowserWindow({
  width: 900,
  height: 700,
  icon: nativeImage.createFromDataURL(appIconBase64).resize({ width: 64, height: 64 }),
  webPreferences: { preload: path.join(__dirname, 'preload.js') }
});


  Menu.setApplicationMenu(null);
  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    const settings = getSettings();
    if (settings.minimizeToTray && !quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => (mainWindow = null));
}

function safeCreateTray() {
  try {
    // أيقونة Tray صغيرة
   tray = new Tray(nativeImage.createFromDataURL(appIconBase64).resize({ width: 16, height: 16 }));

tray = new Tray(img);

    const settings = getSettings();
    const menuTemplate = [
      {
        label: 'Pause mapper',
        type: 'checkbox',
        checked: paused,
        click: (item) => {
          paused = item.checked;
          if (paused) globalShortcut.unregisterAll();
          else registerMappings(loadMappings());
          if (mainWindow) mainWindow.webContents.send('paused-changed', paused);
        }
      },
      { type: 'separator' },
      {
        label: 'Start at login',
        type: 'checkbox',
        checked: !!settings.startAtLogin,
        click: (item) => setSettings({ startAtLogin: !!item.checked })
      },
      {
        label: 'Minimize to tray on close',
        type: 'checkbox',
        checked: !!settings.minimizeToTray,
        click: (item) => setSettings({ minimizeToTray: !!item.checked })
      },
      { type: 'separator' },
      { label: 'Open UI', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ];

    tray.setToolTip('Xeo Studio — Key Mapper');
    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));

    tray.on('double-click', () => {
      if (!mainWindow) createWindow();
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    });

  } catch (err) {
    console.error('Failed to create tray:', err);
  }
}


// --- Mapping helpers (same logic as before) ---
function normalizeAccelerator(userStr) {
  if (!userStr) return null;
  const plat = process.platform;
  const parts = userStr.split('+').map(p => p.trim());
  const mapped = parts.map(token => {
    const low = token.toLowerCase();
    if (low === 'ctrl' || low === 'control') return 'Control';
    if (low === 'cmd' || low === 'command') return plat === 'darwin' ? 'Command' : 'Control';
    if (low === 'alt') return 'Alt';
    if (low === 'shift') return 'Shift';
    if (low === 'win' || low === 'meta' || low === 'super') return plat === 'darwin' ? 'Command' : 'Super';
    if (/^f\d+$/i.test(token)) return token.toUpperCase();
    if (token.length === 1) return token.toUpperCase();
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
  return mapped.join('+');
}

function parseComboForNut(comboStr) {
  if (!comboStr) return { modifiers: [], key: null };
  const parts = comboStr.split('+').map(s => s.trim()).filter(Boolean);
  const modifiers = [];
  let main = null;
  for (const p of parts) {
    const k = p.toLowerCase();
    if (k === 'ctrl' || k === 'control') modifiers.push(Key.LeftControl);
    else if (k === 'alt') modifiers.push(Key.LeftAlt);
    else if (k === 'shift') modifiers.push(Key.LeftShift);
    else if (k === 'win' || k === 'meta' || k === 'super') modifiers.push(Key.LeftSuper);
    else if (/^f\d+$/i.test(k)) main = Key[`F${k.slice(1)}`];
    else if (/^[a-z]$/i.test(k)) main = Key[k.toUpperCase()];
    else if (/^\d$/.test(k)) main = Key['Digit' + k];
    else if (k === '.') main = null;
    else main = null;
  }
  return { modifiers, key: main };
}

async function executeCombo(comboStr) {
  const { modifiers, key } = parseComboForNut(comboStr);
  try {
    for (const m of modifiers) await keyboard.pressKey(m);
    if (key) {
      await keyboard.pressKey(key);
      await keyboard.releaseKey(key);
    } else {
      const printable = comboStr.split('+').map(s => s.trim()).filter(s => !/^(ctrl|control|alt|shift|win|meta|super)$/i.test(s)).join('');
      if (printable) await keyboard.type(printable);
    }
    for (const m of modifiers.slice().reverse()) await keyboard.releaseKey(m);
  } catch (err) {
    console.error('executeCombo error:', err);
  }
}

function loadMappings() { return store.get('mappings', []); }
function saveMappings(mappings) { store.set('mappings', mappings); registerMappings(mappings); }

function registerMappings(mappings) {
  try {
    globalShortcut.unregisterAll();
    for (const m of mappings) {
      const accel = normalizeAccelerator(m.to);
      if (!accel) continue;
      try {
        const ok = globalShortcut.register(accel, () => {
          if (paused) return;
          // when mapped key pressed -> simulate original
          executeCombo(m.from);
        });
        if (!ok) console.warn('registration failed for', accel);
      } catch (e) {
        console.warn('globalShortcut error for', accel, e);
      }
    }
  } catch (err) {
    console.error('registerMappings error:', err);
  }
}

// -------- system-level recording via iohook (best-effort) --------
// returns { ok: true, combo: ['Ctrl','Shift','S'] } or { ok:false, reason }
ipcMain.handle('start-record-system', async () => {
  if (!iohook) return { ok: false, reason: 'no-iohook' };

  return new Promise((resolve) => {
    const pressed = new Set();
    let lastTime = Date.now();
    let timer = null;
    const TIMEOUT_MS = 350; // if no keydown for 350ms after last, finish

    function cleanupAndResolve() {
      clearTimeout(timer);
      try { iohook.off('keydown', onKeyDown); iohook.off('keyup', onKeyUp); } catch (e) {}
      resolve({ ok: true, combo: Array.from(pressed) });
    }

    function scheduleFinish() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        cleanupAndResolve();
      }, TIMEOUT_MS);
    }

    function onKeyDown(e) {
      // Build readable name
      if (e && typeof e.keychar === 'number' && e.keychar !== 0) {
        try {
          const ch = String.fromCharCode(e.keychar);
          if (ch.length === 1) pressed.add(ch.toUpperCase());
        } catch {}
      } else {
        // try to detect modifiers via flags (iohook provides ctrlKey/shiftKey/altKey maybe)
        if (e.ctrlKey) pressed.add('Ctrl');
        if (e.shiftKey) pressed.add('Shift');
        if (e.altKey) pressed.add('Alt');
        if (e.metaKey) pressed.add('Win');
        // fallback: map keycode to some names (best-effort, not exhaustive)
        if (e.keycode) {
          const kc = e.keycode;
          // basic mapping for common keys (may vary by platform)
          if (kc >= 59 && kc <= 68) { // F1-F10 mapping sometimes
            const idx = kc - 58;
            pressed.add('F' + idx);
          }
        }
      }
      lastTime = Date.now();
      scheduleFinish();
      // Note: iohook cannot reliably cancel OS handling of special combos on all OSes.
    }

    function onKeyUp(e) {
      // schedule finish quickly (keeps current pressed items)
      scheduleFinish();
    }

    try {
      iohook.on('keydown', onKeyDown);
      iohook.on('keyup', onKeyUp);
      iohook.start();
      scheduleFinish();
    } catch (err) {
      console.warn('iohook start failed:', err);
      try { iohook.off('keydown', onKeyDown); iohook.off('keyup', onKeyUp); } catch(e){}
      resolve({ ok: false, reason: 'iohook-error' });
    }
  });
});

// --------------- IPC for mappings & settings ---------------
ipcMain.handle('load-mappings', () => loadMappings());
ipcMain.on('save-mappings', (evt, mappings) => saveMappings(mappings));

ipcMain.handle('get-settings', () => getSettings());
ipcMain.on('set-settings', (evt, partial) => setSettings(partial));

ipcMain.on('pause-mapper', () => { paused = true; globalShortcut.unregisterAll(); });
ipcMain.on('resume-mapper', () => { paused = false; registerMappings(loadMappings()); });

// apply login setting on startup if needed
app.whenReady().then(() => {
  // apply auto-launch if set
  const s = getSettings();
  try {
    if (app.setLoginItemSettings) {
      app.setLoginItemSettings({ openAtLogin: !!s.startAtLogin });
    }
  } catch (e) {
    console.warn('setLoginItemSettings failed:', e);
  }

  createWindow();
  safeCreateTray();
  try { registerMappings(loadMappings()); } catch (e) { console.error(e); }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (iohook) {
    try { iohook.unload(); iohook.stop(); } catch (e) {}
  }
});

