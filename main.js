const { app, BrowserWindow } = require("electron")
const path = require("path")
global.userDataPath = app.getPath("userData")
app.commandLine.appendSwitch("password-store", "basic")
app.commandLine.appendSwitch("disable-gpu-watchdog")
app.commandLine.appendSwitch("use-mock-keychain")
app.commandLine.appendSwitch("disable-renderer-backgrounding")
app.commandLine.appendSwitch("disable-background-timer-throttling")
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")

function createWindow() {
    const win = new BrowserWindow({
        width: 750,
        height: 775,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, "clear.js")
        }
    });
    win.loadFile("index.html");
    setInterval(() => {
        if (win && !win.isDestroyed()) {
            win.loadFile("index.html")
        }
    }, 1000 * 60 * 60 * 2)
    win.webContents.on("render-process-gone", () => {
        if (win && !win.isDestroyed()) {
            win.loadFile("index.html")
        }
    })
    win.webContents.on("unresponsive", () => {
        if (win && !win.isDestroyed()) {
            win.loadFile("index.html")
        }
    })
}
app.whenReady().then(createWindow);