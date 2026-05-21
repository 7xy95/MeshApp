function getMeshPerMin(hashes) {
    let CPerHash = 2 ** (getDifficultyBits(blocks.length) - 256)
    return hashes * 60 * CPerHash * getBlockReward(blocks.length) / 1000
}

async function refresh(once=false, checkVersion=true) {
    let lastHashes = 0
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

            document.getElementById("difficulty").innerText = `${format(2**(256-getDifficultyBits(blocks.length)))}`
            document.getElementById("blockCount").innerText =  `${blocks.length}`

            let w = blocks.length - Math.floor(blocks.length/10)*10
            let amount = 0
            if (w !== 0) {amount = getDifficultyFromTs4(getTs(blocks[Math.floor(blocks.length/10)*10 -1]), Math.floor(Date.now()/1000), w+1)}
            else {amount = 0}
            if (w > 3) {document.getElementById("nextDiff").innerText = `${format(2**(256-(getDifficultyBits(blocks.length) + amount)))}`}
            else {document.getElementById("nextDiff").innerText = "-"}

            document.getElementById("blockReward").innerText = `${((getBlockReward(blocks.length)+getMinerRewards(mempool))/1000).toFixed(3)} MESH`

            let totalHashes_ = document.getElementById("totalHashes")
            let hashesFound = document.getElementById("hashesFound")

            document.getElementById("estMesh").innerText = getMeshPerMin(totalHashes - lastHashes).toFixed(3)
            lastHashes = totalHashes

            totalHashes_.innerText = `${format(totalHashes, false)}`
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

        let nonce = Math.floor(Math.random()*(2**32 - 2_000_000))
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