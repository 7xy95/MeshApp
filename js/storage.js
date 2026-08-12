function initContacts() {
    if (getContacts() === null) {saveContacts([])}
    else {
        let contacts = getContacts()
        let html = ""
        for (let contact of contacts) {
            html += `
                <div class="contactItem">
                    <span>${contact[0]}: ${contact[1]}</span>
                    <button class="btn smallBtn" onclick="removeContact('${contact[0]}')">×</button>
                </div>
            `
        }
        edit("contactList", "innerHTML", html)
    }
}
function getContacts() {
    try {
        if (!fs.existsSync(contacts)) {
            fs.writeFileSync(contacts, "[]")
        }
        return JSON.parse(fs.readFileSync(contacts, "utf-8"))
    }
    catch {
        return []
    }
}
function saveContacts(data) {
    fs.writeFileSync(contacts, JSON.stringify(data, null, 2))
}
function getSavedBlocks() {
    try {
        if (!fs.existsSync(blocksPath)) {
            fs.writeFileSync(blocksPath, "[]")
        }
        return JSON.parse(fs.readFileSync(blocksPath, "utf-8"))
    }
    catch {
        return []
    }
}
function saveBlocks() {
    fs.writeFileSync(blocksPath, JSON.stringify(blocks))
}
function saveNodes() {
    fs.writeFileSync(nodesPath, JSON.stringify(allNodes))
}
function loadNodes() {
    try {
        if (!fs.existsSync(nodesPath)) {
            fs.writeFileSync(nodesPath, "[]")
        }
        allNodes = JSON.parse(fs.readFileSync(nodesPath, "utf-8"))
    }
    catch {
        return []
    }
}
async function saveSession() {
    fs.writeFileSync(session, JSON.stringify({
        privateKey: privateKey,
        publicKey: publicKey,
        address: address,
        mine: mine,
        useGPU: useGPU,
        totalHashes: totalHashes,
        totalHashesFound: totalHashesFound,
        throttle: throttleTime,
        minBattery: minBattery,
        rewardAddress: await value("rewardAddress")
    }, null, 2))
}
async function loadSession(Start=true) {
    try {
        if (!fs.existsSync(session)) {
            fs.writeFileSync(session, "{}")
        }
        let data = JSON.parse(fs.readFileSync(session, "utf-8"))
        if (data.privateKey == null) {return}
        privateKey = Buffer.from(data.privateKey, "hex")
        publicKey = Buffer.from(data.publicKey, "hex")
        address = data.address
        mine = data.mine
        if (mine) {edit("toggleMiningBtn", "innerText", "Stop Mining")}
        useGPU = data.useGPU
        totalHashes = data.totalHashes
        totalHashesFound = data.totalHashesFound
        style("logInPanel", "display","none")
        style("mainPanel", "display","flex")
        edit("useGPUCheckbox", "checked", useGPU)
        edit("throttleTime", "value", data.throttle)
        throttleTime = data.throttle
        let savedMinBattery = data.minBattery
        if (savedMinBattery === "" || savedMinBattery === null) {
            edit("minBattery", "value", 25)
            minBattery = 25
        }
        else {
            edit("minBattery", "value", savedMinBattery*100)
            minBattery = savedMinBattery
        }
        edit("rewardAddress", "value", data.rewardAddress)
        miningAddress = data.rewardAddress
        void updateRewardAddress()
        if (Start) {void start()}
    }
    catch (error) {console.log(error)}
}
async function updateRewardAddress() {
    let rewardAddress = await value("rewardAddress")
    rewardAddress = parseContact(rewardAddress)
    if (rewardAddress.length === 40) {miningAddress = rewardAddress}
    else {miningAddress = address}
}