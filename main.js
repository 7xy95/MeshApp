const { app, BrowserWindow, powerMonitor } = require("electron")
const path = require("path")
const fs = require("fs");
global.userDataPath = app.getPath("userData")
app.commandLine.appendSwitch("password-store", "basic")
app.commandLine.appendSwitch("disable-gpu-watchdog")
app.commandLine.appendSwitch("use-mock-keychain")
app.commandLine.appendSwitch("disable-renderer-backgrounding")
app.commandLine.appendSwitch("disable-background-timer-throttling")
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")

const dataDir = app.getPath("userData")
process.env.userPath = dataDir
fs.mkdirSync(dataDir, { recursive: true })

let win = null;
let recreating = false;

function reload() {
    if (recreating) return;
    recreating = true;

    const oldWin = win;
    win = null;

    if (oldWin && !oldWin.isDestroyed()) {
        oldWin.destroy();
    }

    setTimeout(() => {
        createWindow();
        recreating = false;
    }, 500);
}

function createWindow() {
    win = new BrowserWindow({
        width: 750,
        height: 785,
        icon: path.join(__dirname, "assets", "mesh-icon.png"),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, "clear.js"),
        }
    });
    win.loadFile("index.html")
    setInterval(() => {
        if (win && !win.isDestroyed()) {
            win.loadFile("index.html")
        }
    }, 1000 * 60 * 60 * 2)
    win.webContents.on("render-process-gone", () => {
        reload()
    })
    win.webContents.on("unresponsive", () => {
        reload()
    })
}
app.whenReady().then(() => {
    createWindow()
    powerMonitor.on("resume", () => {
        if (win && !win.isDestroyed()) {
            win.loadFile("index.html")
        }
    })

    powerMonitor.on("unlock-screen", () => {
        if (win && !win.isDestroyed()) {
            win.loadFile("index.html")
        }
    })
})