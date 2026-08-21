const { BrowserWindow: GpuBrowserWindow, ipcMain: gpuIpcMain } = require("electron")

let gpuMinerWindow = null
let gpuMinerReady = null
let gpuJobId = 0
let gpuJobs = new Map()

function createGpuMinerWindow() {
    if (gpuMinerWindow && !gpuMinerWindow.isDestroyed()) {return gpuMinerWindow}

    gpuMinerWindow = new GpuBrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    })

    gpuMinerWindow.loadFile(path.join(__dirname, "gpuMinerWindow.html"))
    // gpuMinerWindow.webContents.openDevTools({ mode: "detach" })

    gpuMinerWindow.on("closed", () => {
        gpuMinerWindow = null
        gpuMinerReady = null

        for (let job of gpuJobs.values()) {
            job.resolve({
                found: false,
                nonce: 0,
                attempts: 0,
                error: "GPU miner window closed"
            })
        }

        gpuJobs.clear()
    })

    return gpuMinerWindow
}

async function initGpuMiner() {
    if (gpuMinerReady) {return gpuMinerReady}

    gpuMinerReady = new Promise((resolve, reject) => {
        let minerWindow = createGpuMinerWindow()

        minerWindow.webContents.once("did-finish-load", () => {
            resolve(true)
        })

        minerWindow.webContents.once("did-fail-load", (event, code, description) => {
            gpuMinerReady = null
            reject(new Error(description))
        })
    })

    return gpuMinerReady
}

gpuIpcMain.on("gpu:result", (event, data) => {
    let job = gpuJobs.get(data.id)
    if (!job) {return}

    gpuJobs.delete(data.id)
    job.resolve(data.result)
})

async function gpuHash(prefix, difficultyBytes, startNonce, attempts = batchSize*1_000_000) {
    await initGpuMiner()

    if (!gpuMinerWindow || gpuMinerWindow.isDestroyed()) {
        return {
            found: false,
            nonce: 0,
            attempts: 0,
            error: "GPU miner window unavailable"
        }
    }

    let id = ++gpuJobId

    return await new Promise((resolve) => {
        gpuJobs.set(id, {resolve})

        gpuMinerWindow.webContents.send("gpu:hash", {
            id,
            prefix,
            difficultyBytes: Array.from(difficultyBytes),
            startNonce,
            attempts
        })
    })
}

global.gpuHash = gpuHash
global.initGpuMiner = initGpuMiner