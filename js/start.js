async function startLoad() {
    async function reqRandNode(type) {
        try {
            let node = [...allNodes, ...activeNodes][Math.floor(Math.random()*(activeNodes.length+allNodes.length))]
            if (type === "b") {
                let data = await get(node, `blocks?start=${blocks.length}&stop=${blocks.length+2047}`)
                return data.blocks
            }
            else {
                let data = await get(node, `mempool`)
                return data.mempool
            }
        }
        catch (error) {return null}
    }
    let rewardAddress = await value("rewardAddress")
    rewardAddress = parseContact(rewardAddress)
    if (rewardAddress.length === 40) {miningAddress = rewardAddress}
    else {miningAddress = address}

    await getNodes()
    await manageActivePeers(true)
    void shareUrl()
    function init() {
        refresh(true, false)
        difficultyCache = [230]
        balancesCache = {}
        nonceCache = new Set()
        blocks = []
        blocks = savedBlocks
    }
    let savedBlocks = getSavedBlocks()
    for (let block of savedBlocks) {
        blocks.push(block)
        cacheBlock(block)
    }
    if (allNodes.length + activeNodes.length < 1) {stop=false; return}
    init()

    difficultyCache = [230]
    balancesCache = {}
    nonceCache = new Set()
    blocks = []

    let empty = 0
    while (true) {
        edit("addressTop", "innerText", `${blocks.length} Blocks verified so far...`)
        await sleep(0)
        let bs = await reqRandNode("b")
        if (bs === null) {continue}
        if (bs.length === 0) {
            empty++
            if (empty >= 2) {
                break
            }
        }
        for (let b of bs) {
            if (!verifyBlock(b)) {
                difficultyCache = [230]
                balancesCache = {}
                nonceCache = new Set()
                blocks = []
                empty = 0
                break
            }
            blocks.push(b)
            cacheBlock(b)
        }
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

    edit("addressTop", "innerText", "Getting mempool...")
    let rMempool = await reqRandNode("m")
    for (let tx of rMempool) {
        if (verifyTx(tx)) {mempool.push(tx)}
    }

    lastSeen = Date.now()
    stop = false
    saveBlocks()
    refresh(true, false)
    latestVersion = void getLatestVersion()
}