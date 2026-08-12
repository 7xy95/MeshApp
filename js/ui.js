function openTxPopup() {
    document.getElementById("tx").style.display = "flex"
    document.getElementById("dataInput").placeholder = "Enter Amount..."
    document.getElementById("sendPopupTitle").innerText = "Send MESH"
    popup = 0
}
function openMsgPopup() {
    document.getElementById("tx").style.display = "flex"
    document.getElementById("dataInput").placeholder = "Enter Message..."
    document.getElementById("sendPopupTitle").innerText = "Send Msg"
    popup = 1
}
function openContactPopup() {
    document.getElementById("contacts").style.display = "flex"
}
async function setFeeText() {
    if (popup === 0) {
        let amount = document.getElementById("dataInput").value
        amount = Math.round(Number(amount)*1000)
        amount = (amount - Number(await get(`getFee(${amount})`)))/1000
        console.log(get(`getFee(${amount})`))
        document.getElementById("sendError").innerHTML = `<span style="color: #fdd54f">WARNING: Receiver will receive ${amount} MESH</span>`
    }
}
async function submitTx() {
    let toAddress = document.getElementById("addressInput").value
    document.getElementById("addressInput").value = ""
    toAddress = await get(`parseContact(${JSON.stringify(toAddress)})`)
    let address = await get('address')
    console.log(toAddress)
    if (toAddress.length !== 40) {
        document.getElementById("sendError").innerText = "ERROR: Invalid address"
        return
    }
    let bal = await get(`getSpendableBalance(address)`)
    if (popup === 0) {
        let amount = document.getElementById("dataInput").value
        document.getElementById("dataInput").value = ""
        amount = Math.round(Number(amount)*1000)
        if (bal < amount) {
            document.getElementById("sendError").innerText = "ERROR: Insufficient funds"
            return
        }
        if (amount <= 10) {
            document.getElementById("sendError").innerText = "ERROR: The minimum amount is 0.011"
            return
        }
        closePopup()
        let tx = `${address}|${toAddress}|${amount}|${await get('getNextNonce(address)')}`
        tx = await get(`hashTx(${JSON.stringify(tx)})`)
        console.log(tx)
        run(`broadcastTx(${JSON.stringify(tx)})`)
    }
    else if (popup === 1) {
        if (bal < 1000) {
            document.getElementById("sendError").innerText = "ERROR: Insufficient funds"
            return
        }
        let message = document.getElementById("dataInput").value
        document.getElementById("dataInput").value = ""
        if (message.length > 150) {
            document.getElementById("sendError").innerText = "ERROR: Message too long"
            return
        }
        closePopup()
        message = Buffer.from(message, "utf-8").toString("hex")
        let tx = `MSG|${address}|${toAddress}|1000|${await get('getNextNonce(address)')}|${message}`
        let txHash = sha256(Buffer.from(tx, "utf-8"))
        let signature = secp256k1.sign(txHash, privateKey, { prehash: false, format: "der" })
        tx = `${tx}||${Buffer.from(publicKey).toString("hex")}||${Buffer.from(signature).toString("hex")}`
        run(`await broadcastTx(${tx})`)
    }
}
function closePopup() {
    document.getElementById("tx").style.display = "none"
    document.getElementById("addressInput").value = ""
    document.getElementById("dataInput").value = ""
    document.getElementById("sendError").innerText = ""
    popup = -1
}
function closeHistoryPopup() {
    document.getElementById("contacts").style.display = "none"
}
async function addHistoryElement(type, blocksAgo, change, addr="", msg="", block="", txIndex) {
    function getTs(block) {
        let header = block.split(",")[0]
        return Number(header.split("|")[2])
    }
    let hist = document.getElementById("history")
    let time = ""
    let ts = 0
    let height = Number(await get('blocks.length'))
    if (block !== "") {ts = getTs(block)}
    if (blocksAgo >= 0) {
        if (ts === 0) {time = `<p class="timeH">${blocksAgo+1} blocks ago`}
        else {time = `<p class="timeH">${blocksAgo+1} blocks ago (${formatTime(ts)})</p>`}
    }
    else {time = `<p class="timeH" style="color: #c537de">Unverified</p>`;}
    if (type === "tx") {
        if (change >= 0) {
            hist.innerHTML += `
                <button onclick='run("openTxInfo(${blocksAgo}, ${txIndex})")' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1dcd20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote-arrow-up-icon lucide-banknote-arrow-up iconH"><path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="M18 12h.01"/><path d="M19 22v-6"/><path d="m22 19-3-3-3 3"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></svg>
                    ${time}
                    <p class="changeH" style="color: #1dcd20">+${change.toFixed(3)}</p>
                    <p class="infoH">Received from <span style="color: #899df1">${truncateAddress(addr)}</span></p>
                </button>
                `
        }
        else {
            hist.innerHTML += `
                <button onclick='run("openTxInfo(${blocksAgo}, ${txIndex})")' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff4242" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote-arrow-down-icon lucide-banknote-arrow-down iconH"><path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="m16 19 3 3 3-3"/><path d="M18 12h.01"/><path d="M19 16v6"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></svg>
                    ${time}
                    <p class="changeH" style="color: #ff4242">${change.toFixed(3)}</p>
                    <p class="infoH">Sent to <span style="color: #899df1">${truncateAddress(addr)}</p>
                </button>
                `
        }
    }
    else if (type === "msg") {
        if (change === 0) {
            hist.innerHTML += `
                <button onclick='run("openTxInfo(${blocksAgo}, ${txIndex})")' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6196ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-text-icon lucide-message-square-text iconH"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg>
                    ${time}
                    <p class="changeH" style="color: #899df1">Received</p>
                    <p class="infoH">From <span style="color: #899df1">${truncateAddress(addr)}: <span style="color: #6774ff">${msg}</p>
                </button>
            `
        }
        else {
            hist.innerHTML += `
                <button onclick='run("openTxInfo(${blocksAgo}, ${txIndex})")' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6196ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-text-icon lucide-message-square-text iconH"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg>
                    ${time}
                    <p class="changeH" style="color: #ff4242">-1.000</p>
                    <p class="infoH">Message sent to <span style="color: #899df1">${truncateAddress(addr)}</p>
                </button>
                `
        }
    }
    else {
        hist.innerHTML += `
            <button onclick='run("openTxInfo(${blocksAgo}, ${txIndex})")' class="historyItem">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6196ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pickaxe-icon lucide-pickaxe iconH"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/></svg>
                ${time}
                <p class="changeH" style="color: #1dcd20">+${change.toFixed(3)}</p>
                <p class="infoH">Block #${height - blocksAgo} mined</p>
            </button>
            `
    }
}

function closeTxInfo() {
    document.getElementById("txInfo").style.display = "none"
}
function openMiningSettingsPopup() {
    document.getElementById("miningSettings").style.display = "flex"
}
function closeMiningSettingsPopup() {
    document.getElementById("miningSettings").style.display = "none"
}
async function removeContact(addr) {
    document.getElementById("contactList").innerHTML = ""
    let contacts = await get('getContacts()')
    let result = []
    for (let contact of contacts) {
        if (contact[0] !== addr) {result.push(contact)}
    }
    run(`saveContacts(${JSON.stringify(result)})`)
    run('initContacts()')
}
async function addContact() {
    const addr = document.getElementById("contactAddress").value
    const name = document.getElementById("contactName").value
    document.getElementById("contactList").innerHTML += `
            <div class="contactItem">
                <span>${addr}: ${name}</span>
                <button class="btn smallBtn" onclick="removeContact('${addr}')">×</button>
            </div>
        `
    let data = await get('getContacts()')
    data.push([addr, name])
    run(`saveContacts(${JSON.stringify(data)})`)
    run('initContacts()')
}

function openPage(newPage) {
    if (newPage === page) {return}
    if (newPage === 1) {run('updateBlockData()')}
    document.getElementById(`page${newPage}`).style.display = "flex"
    document.getElementById(`page${page}`).style.display = "none"
    page = newPage
    run(`page = ${newPage}`)
}

function addItem(blockIndex, from, to, amount, fullFrom, fullTo, red=false) {
    let outcome = `<p class="blockInfo">`
    if (typeof blockIndex === "number") {
        outcome += `<span class="value">#${blockIndex}</span>`
    }
    else {outcome += `<span class="value">|</span>`}
    if (from === "Block Mined") {
        outcome += `<span class="value" style="color: #6774ff">${from}</span>`
    }
    else {outcome += `<span class="value" style="color: #899df1; cursor: pointer" onclick="navigator.clipboard.writeText('${fullFrom}')">${from}</span>`}
    outcome += `<span class="value" style="color: #899df1; cursor: pointer" onclick="navigator.clipboard.writeText('${fullTo}')">${to}</span>`
    amount = (amount/1000).toFixed(3)
    if (!red) {outcome += `<span class="value" style="color: #1dcd20">${amount}</span></p>`}
    else {outcome += `<span class="value" style="color: #ff4242">${amount}</span></p>`}
    document.getElementById("explorerData").innerHTML += outcome
}