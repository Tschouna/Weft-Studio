// The only bridge between the studio page and the desktop: file dialogs, the slicer hand-off and menu commands.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weftDesktop', {
  saveFile: (filename, data) => ipcRenderer.invoke('save-file', { filename, data }),
  openInSlicer: (filename, data) => ipcRenderer.invoke('open-in-slicer', { filename, data }),
  showInFolder: (file) => ipcRenderer.invoke('show-in-folder', file),
  openDesign: () => ipcRenderer.invoke('open-design'),
  setTitle: (name) => ipcRenderer.invoke('set-title', name),
  info: () => ipcRenderer.invoke('app-info'),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action, arg) => cb(action, arg)),
});
