const { app, BrowserWindow } = require("electron");
const { updateElectronApp, UpdateSourceType } = require("update-electron-app")

updateElectronApp({
    updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: "7xy95/MeshApp"
    },
    updateInterval: "10 minutes"
})
function createWindow() {
    const win = new BrowserWindow({
        width: 750,
        height: 750,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });
    win.loadFile("index.html");
}
app.whenReady().then(createWindow);