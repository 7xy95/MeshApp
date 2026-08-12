const http = require("node:http")
const { spawn } = require("node:child_process")
const { app } = require("electron")

let server = null
let port = null
let tunnelProcess = null
let tunnelUrl = null

async function updateURL() {
    try {
        let html = await (await fetch("https://meshcoin.org/node")).text()
        const match = html.match(/https?:\/\/[^<\s]+/)
        if (!match) {
            throw new Error("No URL found")
        }
        let url = match[0].replace(/\/$/, "") + "/"
        if (!allNodes.includes(url) && !activeNodes.includes(url) && url !== tunnelUrl) {
            allNodes.push(url)
        }
        return
    }
    catch (error) {console.log(error)}
}
async function getLatestVersion() {
    while (true) {
        try {
            let response = await fetch("https://api.github.com/repos/7xy95/MeshApp/releases/latest")
            response = await response.json()
            latestVersion = response.tag_name
            return response.tag_name
        }
        catch (error) {}
    }
}
async function get(nodeUrl, request, timeout=3) {
    let controller = new AbortController()
    let timer = setTimeout(() => controller.abort(), timeout*1000)
    try {
        let response = await fetch(nodeUrl + request, {
            method: "GET",
            headers: {"Content-Type": "application/json"},
            signal: controller.signal
        })
        if (!response.ok) {return null}

        return await response.json()
    }
    catch (error) {return null}
    finally {
        clearTimeout(timer)
    }
}

async function getNodes() {
    async function g(node) {
        try {
            let res = await get(node, "allNodes")
            let nodes = res.nodes
            for (let n of nodes) {
                if (!allNodes.includes(n) && !activeNodes.includes(n) && n !== tunnelUrl) {
                    allNodes.push(n)
                }
            }
            return true
        }
        catch (error) {return false}
    }
    for (let i = 0; i<3; i++) {
        g([...allNodes, ...activeNodes][Math.floor(Math.random()*(activeNodes.length+allNodes.length))])
    }
}
async function shareUrl() {
    for (let i = 0; i<5; i++) {
        let randNode = [...allNodes, ...activeNodes][Math.floor(Math.random()*(activeNodes.length+allNodes.length))]
        void fetch(randNode + "node", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                node: tunnelUrl
            })
        }).catch(error => {console.log(error)})
    }
}

async function broadcastTx(tx) {
    for (let node of activeNodes) {
        void fetch(node + "tx", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                tx: tx,
                node: tunnelUrl
            })
        }).catch(error => {console.log(error)})
    }
}
async function broadcastBlock(block, tipHash) {
    for (let node of activeNodes) {
        void fetch(node + "block", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                block: block,
                height: blocks.length,
                tipHash: tipHash,
                node: tunnelUrl
            })
        }).catch(error => {console.log(error)})
    }
}
async function broadcastNode(url) {
    for (let node of activeNodes) {
        void fetch(node + "node", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                node: url
            })
        }).catch(error => {console.log(error)})
    }
}

function getCloudflarePath() {
    function getResourcePath(...parts) {
        if (app.isPackaged) {
            return path.join(process.resourcesPath, ...parts)
        }
        return path.join(__dirname, ...parts)
    }

    if (process.platform === "darwin" && process.arch === "arm64") {
        return getResourcePath("bin", "mac-arm64", "cloudflared")
    }

    if (process.platform === "darwin" && process.arch === "x64") {
        return getResourcePath("bin", "mac-x64", "cloudflared")
    }

    if (process.platform === "win32") {
        return getResourcePath("bin", "win-x64", "cloudflared.exe")
    }
}
function runServer() {
    function readBody(req) {
        return new Promise((resolve, reject) => {
            let body = ""
            req.on("data", chunk => {
                body += chunk.toString()
            })
            req.on("end", () => {
                resolve(body)
            })
            req.on("error", reject)
        })
    }
    function sendJSON(res, statusCode, data) {
        res.writeHead(statusCode, {
            "Content-Type": "application/json"
        })
        res.end(JSON.stringify(data))
    }
    if (server) {return}

    server = http.createServer(async (req, res) => {
        try {
            if (req.method === "GET" && req.url === "/getPeers") {
                sendJSON(res, 200, {
                    ok: true,
                    peers: JSON.stringify(activeNodes)
                })
                return
            }
            if (req.method === "GET" && req.url === "/online") {
                sendJSON(res, 200, {
                    ok: true
                })
                return
            }
            if (req.method === "GET" && req.url === "/height") {
                sendJSON(res, 200, {
                    ok: true,
                    height: blocks.length,
                    tipHash: getTipHash()
                })
                return
            }
            if (req.method === "GET" && req.url === "/mempool") {
                sendJSON(res, 200, {
                    ok: true,
                    mempool: mempool,
                    tipHash: getTipHash()
                })
                return
            }
            if (req.method === "GET" && req.url === "/nodes") {
                sendJSON(res, 200, {
                    ok: true,
                    nodes: activeNodes
                })
                return
            }
            if (req.method === "GET" && req.url === "/allNodes") {
                sendJSON(res, 200, {
                    ok: true,
                    nodes: [...allNodes, ...activeNodes]
                })
                return
            }
            if (req.method === "GET" && req.url.startsWith("/blocks?")) {
                let url = new URL(req.url, "http://localhost")
                try {
                    let start = Number(url.searchParams.get("start"))
                    let stop = url.searchParams.get("stop")
                    if (stop !== null) {
                        stop = Number(stop)
                        if (stop - start > MAX_BLOCKS || start > stop) {
                            sendJSON(res, 400, {
                                ok: false,
                                error: "Invalid or too large block request count"
                            })
                            return
                        }
                        sendJSON(res, 200, {
                            ok: true,
                            blocks: blocks.slice(start, stop+1)
                        })
                        return
                    }
                    else {
                        sendJSON(res, 200, {
                            ok: true,
                            blocks: blocks.slice(start, start+MAX_BLOCKS)
                        })
                        return
                    }
                }
                catch (error) {
                    sendJSON(res, 400, {
                        ok: false,
                        error: error
                    })
                    return
                }
            }

            async function parsePOST(req, res) {
                let body = await readBody(req)
                let data = null
                try {
                    data = JSON.parse(body)
                    return data
                }
                catch (error) {
                    sendJSON(res, 400, {
                        ok: false,
                        error: "Invalid JSON"
                    })
                    return "return"
                }
            }
            if (req.method === "POST" && req.url === "/tx") {
                data = await parsePOST(req, res)
                if (data === "return") {return}

                sendJSON(res, 200, {
                    ok: true
                })
                if (mempool.includes(data.tx)) {return}
                if (!verifyTx(data.tx)) {return}
                mempool.push(data.tx)
                void broadcastTx(data.tx)
                return
            }
            if (req.method === "POST" && req.url === "/block") {
                data = await parsePOST(req, res)
                if (data === "return") {return}

                sendJSON(res, 200, {
                    ok: true
                })
                if (blocks.includes(data.block)) {return}
                if (!verifyBlock(data.block)) {
                    let h = await get(data.node, "height")
                    if (!h || !h.ok || h.height <= blocks.length) {return}

                    let fStart = blocks.length - MAX_FBLOCKS

                    let oData = await get(data.node, `blocks?start=${fStart}`)
                    if (!oData || !oData.ok || !Array.isArray(oData.blocks)) {return}
                    let oBlocks = oData.blocks
                    if (oBlocks[0] !== blocks[fStart]) {return}
                    let sBlocks = blocks.slice()
                    let sDiff = difficultyCache.slice()
                    let sBalance = structuredClone(balancesCache)
                    let sNonce = new Set(nonceCache)
                    for (let i = 1; i < oBlocks.length; i++) {
                        if (fStart + i >= blocks.length || oBlocks[i] !== blocks[fStart+i]) {
                            blocks = blocks.slice(0, fStart+i)
                            difficultyCache = [230]
                            balancesCache = {}
                            nonceCache = new Set()
                            for (let b of blocks) {
                                cacheBlock(b)
                            }
                            for (let b of oBlocks.slice(i)) {
                                if (verifyBlock(b)) {
                                    blocks.push(b)
                                    cacheBlock(b)
                                }
                                else {
                                    blocks = sBlocks
                                    difficultyCache = sDiff
                                    balancesCache = sBalance
                                    nonceCache = sNonce
                                    return
                                }
                            }
                            if (sBlocks[fStart+i] !== undefined && !compare(sBlocks.slice(fStart+i), oBlocks.slice(i), fStart+i)) {
                                blocks = sBlocks
                                difficultyCache = sDiff
                                balancesCache = sBalance
                                nonceCache = sNonce
                                return
                            }
                            saveBlocks()
                            await broadcastBlock(data.block, getTipHash())
                            return
                        }
                    }
                }
                await broadcastBlock(data.block, getTipHash())
                blocks.push(data.block)
                cacheBlock(data.block)
                mempool = []
                return
            }
            if (req.method === "POST" && req.url === "/node") {
                data = await parsePOST(req, res)
                if (data === "return") {return}

                sendJSON(res, 200, {
                    ok: true
                })
                if (allNodes.includes(data.node) || activeNodes.includes(data.node) || data.node === tunnelUrl) {return}
                allNodes.push(data.node)
                void broadcastNode(data.node)
                return
            }

            sendJSON(res, 404, {
                ok: false,
                error: "Invalid Endpoint"
            })
        }
        catch (error) {
            sendJSON(res, 500, {
                ok: false,
                error: error
            })
        }
    })

    server.listen(0, "127.0.0.1", () => {
        port = server.address().port
        startQuickTunnel()
    })
    function startQuickTunnel() {
        edit("addressTop", "innerText", "Requesting public endpoint...")
        async function tunnelOutput(text) {
            if (tunnelUrl !== null) {return}
            let match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)

            if (!match) {return}
            tunnelUrl = match[0] + "/"
            console.log(`tunnel url: ${tunnelUrl}`)
            edit("addressTop", "innerText", "Waiting for URL to be reachable...")
            await sleep(5000)
            let data = await get(tunnelUrl, "online")
            if (data === null) {
                console.log("did not respond")
                tunnelProcess.kill()
                return
            }
            edit("addressTop", "innerText", "Getting other node URLs...")
            await updateURL()
            void startLoad()
        }
        if (tunnelProcess) {return}
        if (!port) {return}

        let cloudflarePath = getCloudflarePath()
        tunnelProcess = spawn(cloudflarePath, [
            "tunnel",
            "--url",
            `http://127.0.0.1:${port}`
        ])

        tunnelProcess.stdout.on("data", data => {
            tunnelOutput(data.toString())
        })
        tunnelProcess.stderr.on("data", data => {
            tunnelOutput(data.toString())
        })

        tunnelProcess.on("close", c => {
            console.log(`tunnel closed: ${c}`)
            tunnelProcess = null
            tunnelUrl = null
            startQuickTunnel()
        })
    }
}

global.getNodes = getNodes
global.shareUrl = shareUrl