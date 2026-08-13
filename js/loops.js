function getMeshPerMin(hashes) {
    let CPerHash = 2 ** (getDifficultyBits(blocks.length) - 256)
    return hashes * 60 * CPerHash * getBlockReward(blocks.length) / 1000
}

async function updateBlockData() {
    let searchSpecific = false
    edit("explorerData", "innerHTML", "")
    let addrSearch = await value("searchingAddress")
    if (addrSearch !== "") {
        addrSearch = parseContact(addrSearch)
        console.log(addrSearch, getSpendableBalance(addrSearch), getSpendableBalance(addrSearch)/1000, (getSpendableBalance(addrSearch)/1000).toFixed(3))
        edit("searchBalance", "innerText",(getSpendableBalance(addrSearch)/1000).toFixed(3))
        searchSpecific = true
        edit("explorerAmountText", "innerText","Change")
        style("searchBalanceInfo", "display", "flex")
    }
    else {
        edit("explorerAmountText", "innerText","Amount")
        style("searchBalanceInfo", "display", "none")
    }
    let rowCount = await value("maxTxDisplay")
    let totalInfo = 0
    let i = blocks.length
    while (totalInfo <= rowCount) {
        i--
        if (i < 1) {return}
        let block = blocks[i]
        let index = block.indexOf(",")
        let txs = block.slice(index+1)
        txs = split_(txs)
        for (let tx of txs) {
            // if (tx.startsWith("SYSTEM|8943e2763da16d5da9276b5ed900a78ff6ad9cfa|")) {
            //     if (txs.length === 1) {break}
            // }
            if (tx.startsWith("SYSTEM|")) {
                tx = tx.split("|")
                let to = parseAddr(tx[1])
                if (searchSpecific && tx[0] !== addrSearch && tx[1] !== addrSearch) {continue}
                let amount = ""
                if (searchSpecific) {amount = "+" + (Number(tx[2]) + getMinerRewards(txs))}
                else {amount = Number(tx[2]) + getMinerRewards(txs)}
                callRenderer("addItem", [i+1, "Block Mined", truncateAddress(to), amount, "", tx[1]])
                totalInfo += 1
            }
            else if (!tx.startsWith("MSG|")) {
                tx = tx.split("|")
                let to = parseAddr(tx[1])
                let from = parseAddr(tx[0])
                let amount = Number(tx[2])
                if (searchSpecific && tx[0] !== addrSearch && tx[1] !== addrSearch) {continue}
                if (!searchSpecific) {callRenderer("addItem", ["", truncateAddress(from), truncateAddress(to), amount - getFee(amount), tx[0], tx[1]])}
                else {
                    if (tx[0] === addrSearch) {
                        callRenderer("addItem", ["", truncateAddress(from), truncateAddress(to), "-" + (amount - getFee(amount)), tx[0], tx[1], true])
                    }
                    else {
                        callRenderer("addItem", ["", truncateAddress(from), truncateAddress(to), "+" + (amount - getFee(amount)), tx[0], tx[1]])
                    }
                }
                totalInfo += 1
            }
        }
    }
    await sleep(60000)
}
async function refresh(once=false, checkVersion=true) {
    function setHistory() {
        let t = 0
        let txIndex = -1
        for (let tx of mempool) {
            txIndex++
            tx = tx.split("||")[0]
            if (tx.startsWith("MSG|")) {
                let [, from, to, , , messageHex] = tx.split("|")
                let bytes = Uint8Array.from(Buffer.from(messageHex, "hex"))
                let messageText = new TextDecoder("utf-8").decode(bytes)
                if (from === address) {callRenderer("addHistoryElement", ["msg", -1, -1, parseAddr(to), "", "", txIndex]); t++}
                if (to === address) {callRenderer("addHistoryElement", ["msg", -1, 0, parseAddr(from), messageText, "", txIndex]); t++}
                continue
            }
            let [from, to, amount,] = tx.split("|")
            if (from === address) {callRenderer("addHistoryElement", ["tx", -1, -1*Number(amount)/1000, parseAddr(to), "", "", txIndex]); t++}
            if (to === address) {callRenderer("addHistoryElement", ["tx", -1, (Number(amount)-getFee(Number(amount)))/1000, parseAddr(from), "", "", txIndex]); t++}
        }
        let i = -1; let b = blocks.length+1
        for (let block of [...blocks].reverse()) {
            if (t>100) {return}
            i++; b--
            let index = block.indexOf(",")
            let txs = split_(block.slice(index+1))
            let txIndex = -1
            for (let tx of txs) {
                txIndex++
                if (tx.startsWith("SYSTEM|")) {
                    if (b !== 0) {
                        let parts = tx.split("|")
                        if (parts[1] === address) {callRenderer("addHistoryElement", ["mined", i, (getBlockReward(b)+getMinerRewards(txs))/1000, "", "", block, txIndex]); t++}
                    }
                    continue
                }
                tx = tx.split("||")[0]
                if (tx.startsWith("MSG|")) {
                    let [, from, to, , , messageHex] = tx.split("|")
                    let bytes = Uint8Array.from(Buffer.from(messageHex, "hex"))
                    let messageText = new TextDecoder("utf-8").decode(bytes)
                    if (from === address) {callRenderer("addHistoryElement", ["msg", i, -1, parseAddr(to), "", block, txIndex]); t++}
                    if (to === address) {callRenderer("addHistoryElement", ["msg", i, 0, parseAddr(from), messageText, block, txIndex]); t++}
                    continue
                }
                let [from, to, amount,] = tx.split("|")
                if (from === address) {callRenderer("addHistoryElement", ["tx", i, -1*Number(amount)/1000, parseAddr(to), "", block, txIndex]); t++}
                if (to === address) {callRenderer("addHistoryElement", ["tx", i, (Number(amount)-getFee(Number(amount)))/1000, parseAddr(from), "", block, txIndex]); t++}
            }
        }
    }
    let lastHashes = 0
    let lastBlockCount = 0
    let lastMempoolCount = 0
    while (true) {
        try {
            if (stop && !once) {await sleep(50); continue}
            //if (window.getSelection() && window.getSelection().toString().length > 0) {await sleep(50); continue}
            //todo move this to renderer and a var to allow easier selection
            if (lastMempoolCount !== mempool.length || lastBlockCount !== blocks.length) {
                let [v_, unV_] = getBalance(address)
                edit("vBalance", "innerText", `${(v_/1000).toFixed(3)} MESH`)
                edit("unVBalance", "innerText", `${(unV_/1000).toFixed(3)} MESH`)
                edit("vBalanceTop", "innerText", `Balance: ${(getSpendableBalance(address)/1000).toFixed(3)} MESH`)
                edit("addressTop", "innerText", `Your Address: ${address}`)
                if (page === 1) {void updateBlockData(); continue}

                edit("difficulty", "innerText", `${format(2**(256-getDifficultyBits(blocks.length)))}`)
                edit("blockCount", "innerText", `${blocks.length}`)
            }

            if (Date.now() % 100 === 0) {void getLatestVersion()}
            if (latestVersion !== APP_VERSION && checkVersion && latestVersion !== undefined) {edit("version", "innerHTML", `<a href="https://github.com/7xy95/MeshApp/releases" style="color: dodgerblue">Get ${latestVersion}</a>`)}
            else {edit("version", "innerText", APP_VERSION)}

            let w = blocks.length - Math.floor(blocks.length/10)*10
            let amount = 0
            if (w !== 0) {amount = getDifficultyFromTs4(getTs(blocks[Math.floor(blocks.length/10)*10 -1]), Math.floor(Date.now()/1000), w+1, true)}
            else {amount = 0}
            if (w > 0) {edit("nextDiff", "innerText", `${format(2**(256-(getDifficultyBits(blocks.length) + amount)))}`)}
            else {edit("nextDiff", "innerText", "-")}

            edit("blockReward", "innerText", `${((getBlockReward(blocks.length)+getMinerRewards(mempool))/1000).toFixed(3)} MESH`)
            edit("hashrate", "innerText",format(totalHashes - lastHashes) + "/s")
            edit("nextHalving", "innerText",String(getNextHalving()))

            edit("estMesh", "innerText", getMeshPerMin(totalHashes - lastHashes).toFixed(3))
            lastHashes = totalHashes

            edit("totalHashes", "innerText", `${format(totalHashes)}`)
            edit("hashesFound", "innerText", `${totalHashesFound}`)

            if ((lastMempoolCount !== mempool.length || lastBlockCount !== blocks.length) || Math.round(Date.now()/1000) % 10 === 0) {
                edit("history", "innerHTML", "")
                setHistory()
            }
            lastMempoolCount = mempool.length
            lastBlockCount = blocks.length
            if (once) {return}
            await sleep(1000)
        }
        catch (error) {console.log(error)}
    }
}
async function mineLoop() {
    let nonce = 1_000_000_000
    let extraNonce = 0
    while (true) {
        try {
            await sleep(throttleTime)
            if (stop) {await sleep(50); continue}
            if (!mine) {await sleep(50); continue}
            if (blocks.length === 0) {await sleep(50); continue}
            if (batteryLevel < minBattery/100) {
                edit("lowBatteryMining", "innerText",  "Low battery, mining disabled")
                await sleep(250)
                continue
            }
            else {
                edit("lowBatteryMining", "innerText",  "")
            }
            let txs = [...mempool]
            txs.unshift(`SYSTEM|${miningAddress}|${getBlockReward(blocks.length)}|0`)

            if (nonce < 2**32-20_000_001) {nonce += 2_000_000}
            else {
                nonce = 1_000_000_000
                extraNonce += 1
                if (extraNonce >= 1000) {
                    extraNonce = 0
                }
            }
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
                let prefix = `${priorHash}|${merkleRoot}|${ts}|`
                if (extraNonce !== 0) {prefix += String(extraNonce)}

                let r1 = gpuHash(prefix, difficultyBytes, nonce, 2_000_000)
                let r2 = gpuHash(prefix, difficultyBytes, nonce+2_000_000, 2_000_000)
                let results = await Promise.all([r1, r2])
                for (let result of results) {
                    totalHashes += result.attempts
                    if (result.found) {
                        const header = prefix + String(result.nonce)
                        const block = `${header},${JSON.stringify(txs)}`
                        if (verifyBlock(block)) {
                            mempool = []
                            blocks.push(block)
                            cacheBlock(block)
                            await broadcastBlock(block, getTipHash())
                            totalHashesFound += 1
                            saveBlocks()
                        }
                        else {
                            console.log(`Block ${block} rejected`)
                        }
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
                            await broadcastBlock(block, getTipHash())
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
        catch (error) {console.log(error); await sleep(50)}
    }
}
async function manageActivePeers(once=false) {
    while (true) {
        try {
            let swap = []

            let nodeUsage = Object.create(null)
            for (let url of allNodes) {
                nodeUsage[url] = 0
            }
            for (let url of activeNodes) {
                nodeUsage[url] = 0
            }

            let results = await Promise.allSettled(
                activeNodes.map(async node => {
                    let data = await get(node, "nodes")
                    return {node: node, data: data}
                })
            )
            for (let r of results) {
                let data = r.value.data
                let node = r.value.node

                if (!data || !data.ok) {
                    swap.push(node)
                    continue
                }

                for (let n of data.nodes) {
                    if (nodeUsage[n] !== undefined) {nodeUsage[n]++}
                    else {nodeUsage[n] = 1}
                }
            }
            for (let node of swap) {
                let i = activeNodes.indexOf(node)
                if (i !== -1) {activeNodes.splice(i, 1)}
            }
            if (activeNodes.length < MAX_ACTIVE_NODES && allNodes.length !== 0) {
                let results = await Promise.allSettled(
                    allNodes.map(async node => {
                        let data = await get(node, "online")
                        return {node: node, data: data}
                    })
                )
                for (let r of results) {
                    console.log(r)
                    let data = r.value.data
                    let node = r.value.node

                    if (!data || !data.ok) {
                        let i = allNodes.indexOf(node)
                        if (i !== -1) {allNodes.splice(i, 1)}
                    }
                    console.log(allNodes)
                }
                while (activeNodes.length < MAX_ACTIVE_NODES) {
                    if (activeNodes.length + allNodes.length <= MAX_ACTIVE_NODES) {
                         for (let node of allNodes) {
                             activeNodes.push(node)
                         }
                         allNodes = []
                         break
                    }
                    let selected = Object.entries(nodeUsage)
                        .filter(([u]) => allNodes.includes(u))
                        .sort((a, b) => a[1] - b[1] || Math.random() - 0.5)
                        .slice(0, MAX_ACTIVE_NODES-activeNodes.length)
                        .map(([u]) => u)

                    activeNodes.push(...selected)
                    for (let node of selected) {
                        let i = allNodes.indexOf(node)
                        if (i !== -1) {allNodes.splice(i, 1)}
                    }
                }
            }
            else if (allNodes.length > 0 && Math.random() < 0.5) {
                let least = Object.entries(nodeUsage)
                    .filter(([u]) => allNodes.includes(u))
                    .sort((a, b) => a[1] - b[1] || Math.random() - 0.5)[0][0]

                let most = Object.entries(nodeUsage)
                    .filter(([u]) => activeNodes.includes(u))
                    .sort((a, b) => b[1] - a[1] || Math.random() - 0.5)[0][0]
                let i = activeNodes.indexOf(most)
                if (i !== -1) {
                    activeNodes.splice(i, 1)
                    allNodes.push(most)
                    i = allNodes.indexOf(least)
                    if (i !== -1) {
                        allNodes.splice(i, 1)
                        activeNodes.push(least)
                    }
                }
            }
            if (once) {return}
            if (Math.random() < 0.2) {void shareUrl()}
            await sleep(8_000)
        }
        catch (error) {console.log(error)}
    }
}

const si = require("systeminformation")
async function updateBatteryLevel() {
    while (true) {
        try {
            let battery = await si.battery()

            if (battery.hasBattery) {
                batteryLevel = battery.percent / 100
                console.log(battery.percent)
            }
            else {
                batteryLevel = 1
            }
        }
        catch {}
        await sleep(5000)
    }
}

async function updateDebug() {
    while (true) {
        if (!debug) {await sleep(100); continue}
        edit("debugData", "innerHTML",`
                version: ${APP_VERSION}<br>
                height: ${blocks.length}<br>
                tipHash: ${getTipHash()}<br>
                mempoolSize: ${mempool.length}<br>
                stop: ${stop}<br>
                address: ${address}<br><br>
                
                miningAddress: ${miningAddress}<br>
                lastBlockAge: ${blocks.length ? Math.round((Date.now()-(blocks.length ? getTs(blocks[blocks.length-1]) * 1000 : 0))/1000) + "s" : ""}<br>
                mine: ${mine}<br>
                useGPU: ${useGPU}<br>
                totalHashes: ${totalHashes}<br>
                totalHashesFound: ${totalHashesFound}<br>
                throttleTime: ${throttleTime}<br>
                minBattery: ${minBattery}<br>
                
                url: ${tunnelUrl}<br>
                portUsed: ${port}<br>
                allNodesL: ${allNodes.length}<br>
                activeNodesL: ${activeNodes.length}<br>
                activeNodes:<br>${activeNodes.join("<br>")}<br>
            `
        )
        await sleep(250)
    }
}