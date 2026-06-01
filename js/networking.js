async function send(message, nodeId) {
    while (true) {
        try {
            console.log(`sending ${truncateAddress(message, 25)}`)
            await fetch(url + "sendMessage", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    toId: nodeId,
                    fromId: id,
                    message: message
                })
            })
            break
        }
        catch (error) {console.log(error); await sleep(100)}
    }
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
async function deleteMsg(rowId) {
    try {
        await fetch(url + "deleteMessageRow", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({rowId: rowId})
        })
    }
    catch (error) {console.log(error)}
}
async function read(timeout=5) {
    const controller = new AbortController()
    const timer = setTimeout(() => {controller.abort()}, timeout*3000)
    try {
        let response = await fetch(url + `nextMessage?id=${id}&timeout=${timeout}`, {signal: controller.signal})
        response = await response.json()
        return [response.message, response.senderId, response.rowId, true]
    }
    catch (error) {console.log(error); return ["noResponse", -1, null, false]}
    finally {clearTimeout(timer)}
}
async function getIds() {
    while (true) {
        try {
            let response = await fetch(url + "allIds")
            let data = await response.json()
            return data.ids
        }
        catch (error) {await sleep(1500)}
    }
}
async function newId() {
    let response = await fetch(url + "newId")
    let data = await response.json()
    return data.id
}

async function checkId() {
    while (true) {
        await sleep(10000)
        allIds = await getIds()
        if (id === 0) {continue}
        if (!allIds.includes(id)) {
            location.reload()
        }
        // document.getElementById("networkInfo").innerText = `Connected nodes: ${allIds.length-3}`
    }
}
async function check() {
    while (true) {
        if (stop) {await sleep(50); continue}
        let message = ""; let senderId = 0; let rowId = null;
        try {
            [message, senderId, rowId] = await read(5)
            if (message.startsWith("get")) {
                if (idRequestCount[senderId] === undefined) {
                    idRequestCount[senderId] = 1
                }
                else {idRequestCount[senderId] += 1}
            }
            if (idRequestCount[senderId] >= MAX_GET_REQUESTS || blacklistedIds.includes(senderId)) {
                continue
            }
            else if (message.startsWith("getVersion")) {
                await send(`r:getVersion:${JSON.stringify(APP_VERSION)}`, senderId)
            }
            else if (message.startsWith("verifyTx:")) {
                message = message.slice(9)
                let result = ""
                if (message.startsWith("MSG|")) {result = verifyMsg(message)}
                else {result = verifyTx(message)}
                if (result && !mempool.includes(message)) {mempool.push(message)}
            }
            else if (message.startsWith("verifyBlock:")) {
                message = message.slice(12)
                let result = verifyBlock(message)
                if (result) {
                    blocks.push(message)
                    cacheBlock(message)
                    // let index = message.indexOf(",")
                    // let txs = split_(message.slice(index+1))
                    // for (let item of mempool) {
                    //     if (txs.includes(item)) {mempool.}
                    // }
                    mempool = []
                    saveBlocks()
                }
                else {
                    if (!forkCase) {
                        void send("getBlockCount", senderId)
                        forkCase = true
                    }
                }
            }
            else if (message.startsWith("getMempool")) {
                await send(`r:getMempool:${JSON.stringify(mempool)}`, senderId)
            }
            else if (message.startsWith("getBlock:")) {
                let index = message.slice(9)
                let block = blocks[Number(index)]
                await send(`r:getBlock:${JSON.stringify(block)}`, senderId)
            }
            else if (message.startsWith("getBlocks")) {
                await send(`r:getBlocks:${JSON.stringify(blocks)}`, senderId)
            }
            else if (message.startsWith("getBlocksFrom:")) {
                await send(`r:getBlocksFrom:${JSON.stringify(blocks.slice(Number(message.slice(14))))}`, senderId)
            }
            else if (message.startsWith("getBlockCount")) {
                await send(`r:getBlockCount:${blocks.length}`, senderId)
            }
            else if (message.startsWith("getBalance:")) {
                let addr = message.slice(11)
                let [v, unV] = getBalance(addr)
                await send(`r:getBalance:${v},${unV}`, senderId)
            }
            else if (message.startsWith("getLastBlocks:")) {
                let amount = Number(message.slice(14))
                let count = blocks.length
                await send(`r:getLastBlocks:${blocks.slice(count-amount)}`)
            }
            else if (message.startsWith("getDifficulty")) {
                await send(`r:getDifficulty:${getDifficulty(blocks.length)}`, senderId)
            }
            else if (message.startsWith("r:getBlockCount:") && forkCase) {
                try {
                    if (Number(message.slice(16)) > blocks.length) {await send(`getBlocks`, senderId)}
                    else {forkCase = false}
                }
                catch (error) {forkCase = false}
            }
            else if (message.startsWith("r:getBlocks:") && forkCase) {
                let original = blocks
                let b = null
                try {
                    b = JSON.parse(message.slice(12))
                }
                catch (error) {
                    b = split_(message.slice(12))
                }
                if (b.length < original.length) {
                    forkCase = false
                    continue
                }
                difficultyCache = [230]
                balancesCache = {}
                nonceCache = new Set()
                blocks = []
                let i = -1
                for (let block of b) {
                    i++
                    let result = null
                    if (i === 0) {
                        if (block !== GENESIS) {
                            result = false
                        }
                        else {
                            blocks.push(block)
                            cacheBlock(block)
                            continue
                        }
                    }
                    result = verifyBlock(block)
                    if (!result) {
                        difficultyCache = [230]
                        balancesCache = {}
                        nonceCache = new Set()
                        blocks = original
                        for (let block of blocks) {cacheBlock(block)}
                        break
                    }
                    else {
                        blocks.push(block)
                        cacheBlock(block)
                    }
                }
                saveBlocks()
                forkCase = false
            }
            else if (message !== "noResponse" && !message.startsWith("r:get")){
                console.log(`Received unknown request from node ${senderId}: ${message}`)
            }
        }
        catch (error) {}
        finally {
            if (rowId !== null && rowId !== undefined){
                await deleteMsg(rowId)
            }
        }
        await sleep(0)
    }
}
async function checkIdRequests() {
    while (true) {
        try {
            idRequestCount = {}
            await sleep(30000)
            blacklistedIds = []
            for (let [nodeId, requestCount] of Object.entries(idRequestCount)) {
                if (requestCount >= MAX_GET_REQUESTS) {
                    blacklistedIds.push(nodeId)
                }
            }
        }
        catch (error) {}
    }
}