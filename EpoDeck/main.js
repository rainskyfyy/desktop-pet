/**
 * EpoDeck 纪念日浮窗 - Electron 主进程
 * Windows 原生桌面浮窗：无边框、透明背景、置顶、系统托盘
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 580;

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ── 数据持久化（userData/epodeck-data.json）──
const dataFile = () => path.join(app.getPath('userData'), 'epodeck-data.json');

function loadData() {
    try {
        if (fs.existsSync(dataFile())) {
            return JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
        }
    } catch (e) {
        console.error('读取数据失败:', e);
    }
    return null;
}

function saveData(data) {
    try {
        fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('保存数据失败:', e);
        return false;
    }
}

// ── 窗口位置持久化 ──
const boundsFile = () => path.join(app.getPath('userData'), 'epodeck-window.json');

function loadWindowBounds() {
    try {
        if (fs.existsSync(boundsFile())) {
            const b = JSON.parse(fs.readFileSync(boundsFile(), 'utf-8'));
            // 校验位置仍在某块屏幕可视区域内
            const ok = screen.getAllDisplays().some((d) => {
                const a = d.workArea;
                return b.x >= a.x - WINDOW_WIDTH / 2 && b.x < a.x + a.width &&
                       b.y >= a.y && b.y < a.y + a.height;
            });
            if (ok && Number.isFinite(b.x) && Number.isFinite(b.y)) return b;
        }
    } catch (e) { /* ignore */ }
    // 默认：屏幕右下角
    const area = screen.getPrimaryDisplay().workArea;
    return { x: area.x + area.width - WINDOW_WIDTH - 24, y: area.y + area.height - WINDOW_HEIGHT - 24 };
}

function saveWindowBounds() {
    if (!mainWindow) return;
    try {
        const [x, y] = mainWindow.getPosition();
        fs.writeFileSync(boundsFile(), JSON.stringify({ x, y }), 'utf-8');
    } catch (e) { /* ignore */ }
}

// ── 创建浮窗 ──
function createWindow() {
    const pos = loadWindowBounds();
    const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));

    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        x: pos.x,
        y: pos.y,
        frame: false,               // 无边框
        transparent: true,          // 透明背景
        resizable: false,
        alwaysOnTop: true,          // 置顶
        skipTaskbar: true,          // 不显示在任务栏
        hasShadow: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        icon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile('index.html');
    mainWindow.setMenu(null);

    // 移动结束后记住位置
    mainWindow.on('moved', saveWindowBounds);

    // 关闭 = 隐藏到托盘（除非真正退出）
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    // 渲染进程里的外链用系统浏览器打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// ── 托盘 ──
function createTray() {
    const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    tray.setToolTip('EpoDeck 纪念日浮窗');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示 / 隐藏浮窗',
            click: () => {
                if (!mainWindow) return createWindow();
                mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
            },
        },
        {
            label: '窗口置顶',
            type: 'checkbox',
            checked: true,
            click: (item) => { if (mainWindow) mainWindow.setAlwaysOnTop(item.checked); },
        },
        {
            label: '开机自启',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => { isQuitting = true; app.quit(); },
        },
    ]);
    tray.setContextMenu(contextMenu);

    // 单击托盘图标切换显示
    tray.on('click', () => {
        if (!mainWindow) return createWindow();
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

// ── IPC ──
ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_e, data) => saveData(data));
ipcMain.handle('window:hide', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.handle('app:quit', () => { isQuitting = true; app.quit(); });
ipcMain.handle('window:toggle-always-on-top', () => {
    if (!mainWindow) return true;
    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next);
    return next;
});

// ── 生命周期 ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });

    app.whenReady().then(() => {
        createWindow();
        createTray();
    });

    app.on('before-quit', () => {
        isQuitting = true;
        saveWindowBounds();
    });

    app.on('window-all-closed', () => {
        // 常驻托盘，不退出
    });
}
