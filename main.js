const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch("password-store", "basic")
app.commandLine.appendSwitch("use-mock-keychain")

function createWindow() {
    const win = new BrowserWindow({
        width: 750,
        height: 775,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });
    win.loadFile("index.html");
}
app.whenReady().then(createWindow);