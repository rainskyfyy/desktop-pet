const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

let win = null;
let tray = null;
let isQuitting = false;

// 交互区域缓存（由渲染进程定时上报）
let interactiveRegions = [];
let cursorPollTimer = null;

// ======================== 获取主显示器边界（固定到主屏，不支持多屏） ========================
function getPrimaryBounds() {
    const disp = screen.getPrimaryDisplay();
    return { x: disp.bounds.x, y: disp.bounds.y, width: disp.bounds.width, height: disp.bounds.height };
}

// ======================== 创建全屏透明窗口 ========================
function createWindow() {
    const primaryBounds = getPrimaryBounds();

    win = new BrowserWindow({
        width: primaryBounds.width,
        height: primaryBounds.height,
        x: primaryBounds.x,
        y: primaryBounds.y,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        maximizable: false,
        minimizable: false,
        focusable: false,
        // 不使用 type:'toolbar' —— Windows 上该类型强制限制单显示器，导致无法跨屏
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // 保持在最顶层
    win.setAlwaysOnTop(true, 'floating');

    win.loadFile('index.html');

    // 默认：鼠标事件穿透到桌面，仅交互区域可捕获
    win.setIgnoreMouseEvents(true, { forward: true });

    // 关闭时隐藏到托盘
    win.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            win.hide();
            updateTrayMenu(false);
        }
    });

    // 启动光标轮询，检测是否进入交互区域
    startCursorPolling();
}

// 主屏分辨率/缩放变更时自适应调整窗口大小
function updateWindowBounds() {
    if (!win) return;
    const primaryBounds = getPrimaryBounds();
    win.setBounds(primaryBounds);
    // 窗口大小变化时不清除"是否穿透"的状态，让轮询在下一次 tick 纠正
    win._lastIgnoreState = null;
}

// ======================== 系统托盘 ========================
let trayMenuCheckedItem = null;

function updateTrayMenu(visible) {
    if (trayMenuCheckedItem) {
        trayMenuCheckedItem.checked = visible;
    }
}

function createTray() {
    // 用小猫图片做托盘图标
    let icon;
    try {
        icon = nativeImage.createFromPath(path.join(__dirname, 'luoxiaohei_stand.png'));
        icon = icon.resize({ width: 16, height: 16 });
    } catch (e) {
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('罗小黑桌面宠物');

    const showToggleItem = {
        label: '显示宠物',
        type: 'checkbox',
        checked: true,
        click: (menuItem) => {
            if (win.isVisible()) {
                win.hide();
                menuItem.checked = false;
            } else {
                win.show();
                menuItem.checked = true;
            }
        }
    };
    trayMenuCheckedItem = showToggleItem;

    const contextMenu = Menu.buildFromTemplate([
        showToggleItem,
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                isQuitting = true;
                if (cursorPollTimer) clearInterval(cursorPollTimer);
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    // 双击托盘图标切换显示
    tray.on('double-click', () => {
        if (win.isVisible()) {
            win.hide();
            updateTrayMenu(false);
        } else {
            win.show();
            updateTrayMenu(true);
        }
    });
}

// ======================== 光标轮询：自动穿透/捕获 ========================
function startCursorPolling() {
    cursorPollTimer = setInterval(() => {
        if (!win || !win.isVisible()) return;

        const point = screen.getCursorScreenPoint();
        const bounds = win.getBounds();
        const rx = point.x - bounds.x;
        const ry = point.y - bounds.y;

        let inZone = false;
        for (const r of interactiveRegions) {
            if (rx >= r.x && rx <= r.x + r.w && ry >= r.y && ry <= r.y + r.h) {
                inZone = true;
                break;
            }
        }

        // 只在状态改变时才调用，避免频繁设置
        if (win._lastIgnoreState !== inZone) {
            win._lastIgnoreState = inZone;
            win.setIgnoreMouseEvents(!inZone, { forward: true });
        }
    }, 80);
}

// ======================== IPC ========================
ipcMain.handle('update-regions', (_event, regions) => {
    interactiveRegions = regions || [];
});

// 返回主显示器的工作区域（排除任务栏），转换为窗口相对坐标
ipcMain.handle('get-screen-work-areas', () => {
    if (!win) return [];
    const bounds = win.getBounds();
    const disp = screen.getPrimaryDisplay();
    return [{
        x: disp.workArea.x - bounds.x,
        y: disp.workArea.y - bounds.y,
        w: disp.workArea.width,
        h: disp.workArea.height
    }];
});

// ======================== 应用生命周期 ========================
app.whenReady().then(() => {
    createWindow();
    createTray();
    // 仅监听主屏分辨率/缩放变化，重新适配窗口（不再处理多屏热插拔）
    screen.on('display-metrics-changed', updateWindowBounds);
});

app.on('before-quit', () => {
    isQuitting = true;
    if (cursorPollTimer) clearInterval(cursorPollTimer);
});

// 防止多实例（Windows）
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (win) {
            if (!win.isVisible()) win.show();
            win.focus();
        }
    });
}
