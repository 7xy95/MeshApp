const { app, BrowserWindow, powerMonitor } = require("electron")
const path = require("path")
const fs = require("fs")
const http = require("node:http")
const { spawn } = require("node:child_process")
const main = require("./mainlogic")

let server = null; let port = null
let tunnelProcess = null; let tunnelUrl = null

app.commandLine.appendSwitch("password-store", "basic")
app.commandLine.appendSwitch("use-mock-keychain")
app.commandLine.appendSwitch("disable-renderer-backgrounding")
app.commandLine.appendSwitch("disable-background-timer-throttling")
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")

const dataDir = app.getPath("userData")
process.env.userPath = dataDir
fs.mkdirSync(dataDir, { recursive: true })

let win = null
let reloading = false
let wakeReloadTimer = null

function reloadWindow() {
    if (reloading) return
    reloading = true

    if (win && !win.isDestroyed()) {
        win.webContents.reloadIgnoringCache()
    }
    else {
        createWindow()
    }

    setTimeout(() => {
        reloading = false
    }, 3000)
}

function scheduleWakeReload() {
    if (wakeReloadTimer) {
        clearTimeout(wakeReloadTimer)
    }

    wakeReloadTimer = setTimeout(() => {
        wakeReloadTimer = null
        reloadWindow()
    }, 10000)
}

function createWindow() {
    win = new BrowserWindow({
        width: 750,
        height: 775,
        icon: path.join(__dirname, "assets", "mesh-icon.png"),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, "clear.js")
        }
    })

    win.loadFile("index.html")

    win.webContents.on("did-finish-load", () => {
        main.startApp(win)
        main.attachWindow(win)
    })

    win.webContents.on("render-process-gone", () => {
        reloadWindow()
    })

    win.webContents.on("unresponsive", () => {
        reloadWindow()
    })

    win.on("closed", () => {
        win = null
        main.attachWindow(win)
    })
}

app.whenReady().then(async () => {
    createWindow()

    powerMonitor.on("resume", () => {
        scheduleWakeReload()
    })

    powerMonitor.on("unlock-screen", () => {
        scheduleWakeReload()
    })
})

app.on("activate", () => {
    if (!win || win.isDestroyed()) {
        createWindow()
    }
})
app.on("window-all-closed", (event) => {
    event.preventDefault()
})

powerMonitor.on("resume", async () => {
    main.setStop(true)
    await sleep(1000)
    try {
        await main.startLoad()
    }
    catch (error) {console.log(`error in resume: ${error}`)}
    main.setStop(false)
    console.log("this is here!!!")
})