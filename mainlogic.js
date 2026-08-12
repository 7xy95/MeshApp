const { ipcMain } = require("electron")
const fs = require("fs")
const vm = require("vm")
const path = require("path")

let win = null
let appStarted = false

global.require = require
global.__dirname = __dirname

async function attachWindow(window) {
    win = window
    if (!win) {return}

    if (appStarted) {
        // await saveSession()
        await loadSession()
        void refresh(true)
    }
}

function loadScript(p) {
    let fullPath = path.join(__dirname, p)
    let code = fs.readFileSync(fullPath, "utf-8")
    vm.runInThisContext(code, {
        filename: fullPath
    })
}

let s = false
let peerManage = false
async function start() {
    if (!s) {s = true}
    else {return}
    initContacts()
    try {
        void runServer()
        stop = true
        void refresh()
        void mineLoop()
        void updateBatteryLevel()
        void manageActivePeers()
    }
    catch (error) {
        console.log(`on start: ${error}`)
        s = false
    }
}
async function logIn(seed) {
    seedToAddress(seed)
    style("logInPanel", "display", "none")
    style("mainPanel", "display", "flex")
    await sleep(50)
    if (!noStart) {await start()}
    else {await refresh(true)}
}
async function logOut() {
    style("logInPanel", "display", "flex")
    style("mainPanel", "display", "none")
    noStart = true
    edit("walletSeedInput", "value", "")
    privateKey = null
    void saveSession()
}
global.logIn = logIn
global.logOut = logOut

let ss = null
function startApp(window) {
    if (appStarted) {return}
    appStarted = true
    win = window

    global.callRenderer = callRenderer
    global.edit = edit
    global.style = style
    global.value = value
    global.sendToRenderer = sendToRenderer
    global.start = start

    loadScript("gpuMiner.js")
    loadScript("js/globals.js")
    loadScript("js/verify.js")
    loadScript("js/getChainData.js")
    loadScript("js/storage.js")
    loadScript("js/networking.js")
    loadScript("js/loops.js")
    loadScript("js/utils.js")

    void loadSession()
    void loadNodes()
    void start()
    if (ss === null) {
        ss = setInterval(() => {
            void saveSession()
            void saveNodes()
        }, 10_000)
    }
}

loadScript("js/start.js")
global.startLoad = startLoad

ipcMain.on("main:run", (event, code) => {
    try {
        vm.runInThisContext(code)
    }
    catch (error) {
        console.log(error)
    }
})
ipcMain.handle("main:get", async (event, code) => {
    try {
        return await vm.runInThisContext(code)
    }
    catch (error) {
        console.log(error)
        return null
    }
})

function sendToRenderer(channel, data) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {return}
    win.webContents.send(channel, data)
}
function callRenderer(functionName, args = []) {
    sendToRenderer("ui:call", {
        functionName,
        args
    })
}
function edit(id, property, value) {
    sendToRenderer("ui:set", {id, property, value})
}
function style(id, property, value) {
    sendToRenderer("ui:style", {id, property, value})
}
async function value(id) {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {return ""}
    try {
        return await win.webContents.executeJavaScript(
            "(() => {" +
            "const el = document.getElementById(" + JSON.stringify(id) + ");" +
            "return el ? el.value : '';" +
            "})()"
        )
    }
    catch (error) {
        console.log("value failed:", error.message)
        return ""
    }
}

function setStop(value) {
    stop = value
}
module.exports = {
    startApp,
    attachWindow,
    setStop,
    startLoad
}