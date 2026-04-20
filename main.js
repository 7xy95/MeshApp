const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch('remote-debugging-port', '9222');

function createWindow() {
    const win = new BrowserWindow({
        width: 700,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }

    });
    win.loadFile("index.html");
}

app.whenReady().then(createWindow);