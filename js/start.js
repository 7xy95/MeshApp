async function startLoad() {
    function init() {
        void refresh(true, false)
        document.getElementById("vBalanceTop").innerText = "Syncing..."
        difficultyCache = [230]
        balancesCache = {}
        nonceCache = new Set()
        blocks = []
        blocks = savedBlocks
    }
    let savedBlocks = getSavedBlocks()
    const INDEX = savedBlocks - 1440
    let infoText = document.getElementById("addressTop")
    infoText.innerText = "Getting node ids..."
    let ids = await getIds()
    infoText.innerText = "Registering new id..."
    id = await newId()
    if (ids.length === 0) {
        for (let block of savedBlocks) {
            blocks.push(block)
            cacheBlock(block)
        }
        return
    }
    init()
    let s = true
    for (let index=0; index<ids.length; index++) {
        infoText.innerText = "Requesting chain..."
        let node = ids[index]
        if (s) {
            // await send(`getBlocksFrom:${INDEX}`, node)
            await send("getBlocks", node)
        }
        s = true
        let correct = true
        let [message, senderId, rowId] = await read()
        if ((!message.startsWith("r:getBlocks:") && !message.startsWith("r:getBlocksFrom:")) || senderId !== ids[index]) {
            await deleteMsg(rowId)
            if (message.startsWith("verify") || message.startsWith("get")) {s = false; index--}
            continue
        }
        let blocks_ = null
        try {
            blocks_ = JSON.parse(message.slice(12))
        }
        catch (error) {
            blocks_ = split_(message.slice(12))
        }
        difficultyCache = [230]
        balancesCache = {}
        nonceCache = new Set()
        blocks = []
        infoText.innerText = `Verifying blocks... 0/${blocks_.length}`
        await new Promise(requestAnimationFrame)
        let i = -1
        const time = Date.now()
        for (let block of blocks_) {
            i++
            if (i === 0) {
                if (block === GENESIS){
                    blocks.push(block)
                    cacheBlock(block)
                    continue
                }
                else {
                    correct = false
                    await deleteMsg(rowId)
                    break
                }
            }
            if (!verifyBlock(block)) {correct = false; await deleteMsg(rowId); break}
            else {
                if (i % 100 === 0) {
                    infoText.innerText = `Verifying blocks... ${i+1}/${blocks_.length}`
                    await new Promise(requestAnimationFrame)
                }
                blocks.push(block)
                cacheBlock(block)
            }
        }
        console.log(Date.now() - time)
        await deleteMsg(rowId)
        if (!correct) {
            continue
        }
        if (blocks.length < savedBlocks.length) {
            blocks = savedBlocks
            difficultyCache = [230]
            balancesCache = {}
            nonceCache = new Set()
            for (let block of blocks) {
                cacheBlock(block)
            }
        }
        saveBlocks()
        infoText.innerText = "Getting mempool..."
        await send("getMempool", ids[index])
        while (true) {
            let [message, senderId, rowId] = await read()
            console.log(message)
            if (!message.startsWith("r:getMempool:") || senderId !== ids[index]) {
                await deleteMsg(rowId)
                continue
            }
            let mempool_ = message.slice(13)
            if (mempool_ !== ""){
                try {
                    mempool_ = JSON.parse(mempool_)
                }
                catch (error) {
                    mempool_ = split_(mempool_)
                }
                console.log(mempool_)
                for (let tx=0; tx<mempool_.length; tx++) {
                    if (mempool_[tx].startsWith("MSG")) {
                        if (verifyMsg(mempool_[tx])) {mempool.push(mempool_[tx])}
                    }
                    else if (verifyTx(mempool_[tx])) {mempool.push(mempool_[tx])}
                }
                await deleteMsg(rowId)
            }
            break
        }
        break
    }
    lastSeen = Date.now()
    saveBlocks()
    latestVersion = await getLatestVersion()
}