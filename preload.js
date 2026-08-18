const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * 上报鼠标交互区域列表（每个区域 {x, y, w, h}）
     * 当光标进入任一区域时，窗口将捕获鼠标事件；离开时穿透到桌面
     */
    updateRegions: (regions) => {
        ipcRenderer.invoke('update-regions', regions);
    },
    /**
     * 获取所有显示器的工作区域（排除任务栏等），窗口相对坐标
     * 返回 [{x, y, w, h}, ...]
     */
    getScreenWorkAreas: () => ipcRenderer.invoke('get-screen-work-areas')
});
