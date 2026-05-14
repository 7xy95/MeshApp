async function refresh(once=false, checkVersion=true) {
    while (true) {
        try {
            if (stop) {await sleep(50); continue}
            if (window.getSelection() && window.getSelection().toString().length > 0) {await sleep(50); continue}
            let [v_, unV_] = getBalance(address)
            document.getElementById("vBalance").innerText = `${(v_/1000).toFixed(3)} MESH`
            document.getElementById("unVBalance").innerText = `${(unV_/1000).toFixed(3)} MESH`
            document.getElementById("vBalanceTop").innerText = `Balance: ${(getSpendableBalance(address)/1000).toFixed(3)} MESH`
            document.getElementById("addressTop").innerText = `Your Address: ${address}`
            if (page === 1) {updateBlockData(); await sleep(5000); continue}

            if (Math.random() < 0.005) {await getLatestVersion()}
            if (latestVersion !== APP_VERSION && checkVersion) {document.getElementById("version").innerHTML = `<a href="https://github.com/7xy95/MeshApp/releases" style="color: dodgerblue">Download latest update</a>`}
            else {document.getElementById("version").innerText = APP_VERSION}

            document.getElementById("difficulty").innerText = `${getDifficultyBits(blocks.length).toFixed(2)}`
            document.getElementById("blockCount").innerText =  `${blocks.length}`

            let w = blocks.length - Math.floor(blocks.length/10)*10
            let amount = 0
            if (w !== 0) {amount = getDifficultyFromTs4(getTs(blocks[Math.floor(blocks.length/10)*10 -1]), Math.floor(Date.now()/1000), w+1)}
            else {amount = 0}
            const sign = Math.sign(amount)
            amount = sign * amount
            if (sign === 1) {document.getElementById("nextDiff").innerText = `+${amount}`}
            else {document.getElementById("nextDiff").innerText = `-${amount}`}

            document.getElementById("blockReward").innerText = `${((getBlockReward(blocks.length)+getMinerRewards(mempool))/1000).toFixed(3)} MESH`

            let miningToggled = document.getElementById("miningToggledL")
            let totalHashes_ = document.getElementById("totalHashes")
            let hashesFound = document.getElementById("hashesFound")
            let estTimePerHash = document.getElementById("estTimePerHash")

            if (!mine) {miningToggled.innerText = "Mining Disabled"}
            else {miningToggled.innerText = "Mining Enabled"}

            totalHashes_.innerText = `${totalHashes.toLocaleString()}`
            hashesFound.innerText = `${totalHashesFound}`

            document.getElementById("history").innerHTML = ""
            setHistory()
            if (once) {return}
            await sleep(1000)
        }
        catch (error) {console.log(error)}
    }
}
async function mineLoop() {
    async function broadcastBlock(block) {
        let ids = await getIds()
        for (let i of ids) {
            if (id !== i) {await send(`verifyBlock:${block}`, i)}
        }
    }
    while (true) {
        await sleep(document.getElementById("throttleTime").value)
        if (stop) {await sleep(50); continue}
        if (!mine) {await sleep(50); continue}
        if (blocks.length === 0) {await sleep(50); continue}
        if (Date.now() - lastSeen > 5000) {await sleep(50); continue}
        let txs = [...mempool]
        txs.unshift(`SYSTEM|${address}|${getBlockReward(blocks.length)}|0`)

        let nonce = Math.floor(Math.random()*(2**31))
        let counter = 0

        let index = blocks[blocks.length-1].indexOf(",")
        let lastHeader = blocks[blocks.length-1].slice(0, index)
        let [lHash, lRoot, lTs, lNonce] = lastHeader.split("|")
        if (useGPU) {
            const priorHash = BigInt("0x" + sha256(sha256(Buffer.from(`${lHash}|${lRoot}|${Number(lTs)}|${Number(lNonce)}`, "utf-8"))).toString("hex")).toString(16)
            const difficultyHex = getDifficulty(blocks.length).toString(16).padStart(64, "0")
            const difficultyBytes = Buffer.from(difficultyHex, "hex")
            const merkleRoot = sha256(Buffer.from(txs.join(""), "utf-8")).toString("hex")
            const ts = Math.floor(Date.now()/1000)
            const prefix = `${priorHash}|${merkleRoot}|${ts}|`
            const result = await gpuHash(prefix, difficultyBytes, nonce, 2_000_000)
            totalHashes += result.attempts
            if (result.found) {
                const header = prefix + String(result.nonce)
                const hash = sha256(sha256(Buffer.from(header, "utf-8")))
                const block = `${header},${JSON.stringify(txs)}`
                if (verifyBlock(block)) {
                    mempool = []
                    blocks.push(block)
                    cacheBlock(block)
                    await broadcastBlock(block)
                    totalHashesFound += 1
                    saveBlocks()
                }
            }
        }
        else {
            const priorHash = BigInt("0x" + sha256(sha256(Buffer.from(`${lHash}|${lRoot}|${Number(lTs)}|${Number(lNonce)}`, "utf-8"))).toString("hex")).toString(16)
            const difficultyHex = getDifficulty(blocks.length).toString(16).padStart(64, "0")
            const difficultyBytes = Buffer.from(difficultyHex, "hex")
            const merkleRoot = sha256(Buffer.from(txs.join(""), "utf-8")).toString("hex")
            const ts = Math.floor(Date.now()/1000)
            const prefix = `${priorHash}|${merkleRoot}|${ts}|`
            while (counter < 25000) {
                counter++
                const header = prefix + String(nonce+counter)
                const result = sha256(sha256(Buffer.from(header, "utf-8")))

                let passed = true
                for (let i = 0; i < 32; i++) {
                    if (result[i] < difficultyBytes[i]) {break}
                    if (result[i] > difficultyBytes[i]) {passed = false; break}
                }
                if (passed) {
                    const block = `${header},${JSON.stringify(txs)}`
                    if (verifyBlock(block)) {
                        mempool = []
                        blocks.push(block)
                        cacheBlock(block)
                        await broadcastBlock(block)
                        saveBlocks()
                        totalHashesFound += 1
                        break
                    }
                }
            }
            totalHashes += counter
            await sleep(0)
        }
    }
}
async function fixDisconnect() {
    console.log(Date.now() - lastSeen)
    stop = true
    document.getElementById("vBalanceTop").innerText = "Reconnecting..."
    document.getElementById("addressTop").innerText = "This may take up to 20s..."
    difficultyCache = [230]
    balancesCache = {}
    nonceCache = new Set()
    blocks = []
    await startLoad()
    lastSeen = Date.now()
    stop = false
    console.log("restarted...")
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
                    mempool = []
                    saveBlocks()
                }
                else {
                    await send("getBlockCount", senderId)
                    forkCase = true
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