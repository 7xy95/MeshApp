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
function setFeeText() {
    if (popup === 0) {
        let amount = document.getElementById("dataInput").value
        amount = Math.round(Number(amount)*1000)
        amount = (amount - getFee(amount))/1000
        document.getElementById("sendError").innerHTML = `<span style="color: #fdd54f">WARNING: Receiver will receive ${amount} MESH</span>`
    }
}
async function submitTx() {
    async function broadcastTx(tx) {
        let ids = await getIds()
        for (let i of ids) {
            await send(`verifyTx:${tx}`, i)
        }
    }
    let toAddress = document.getElementById("addressInput").value
    document.getElementById("addressInput").value = ""
    toAddress = parseContact(toAddress)
    if (toAddress.length !== 40) {
        document.getElementById("sendError").innerText = "ERROR: Invalid address"
        return
    }
    let bal = getSpendableBalance(address)
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
        let tx = `${address}|${toAddress}|${amount}|${getNextNonce(address)}`
        let txHash = sha256(Buffer.from(tx, "utf-8"))
        let signature = secp256k1.sign(txHash, privateKey, { prehash: false, format: "der" })
        tx = `${tx}||${Buffer.from(publicKey).toString("hex")}||${Buffer.from(signature).toString("hex")}`
        await broadcastTx(tx)
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
        let tx = `MSG|${address}|${toAddress}|1000|${getNextNonce(address)}|${message}`
        let txHash = sha256(Buffer.from(tx, "utf-8"))
        let signature = secp256k1.sign(txHash, privateKey, { prehash: false, format: "der" })
        tx = `${tx}||${Buffer.from(publicKey).toString("hex")}||${Buffer.from(signature).toString("hex")}`
        await broadcastTx(tx)
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
            if (from === address) {addHistoryElement("msg", -1, -1, parseAddr(to), "", "", txIndex); t++}
            if (to === address) {addHistoryElement("msg", -1, 0, parseAddr(from), messageText, "", txIndex); t++}
            continue
        }
        let [from, to, amount,] = tx.split("|")
        if (from === address) {addHistoryElement("tx", -1, -1*Number(amount)/1000, parseAddr(to), "", "", txIndex); t++}
        if (to === address) {addHistoryElement("tx", -1, (Number(amount)-getFee(Number(amount)))/1000, parseAddr(from), "", "", txIndex); t++}
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
                    if (parts[1] === address) {addHistoryElement("mined", i, (getBlockReward(b)+getMinerRewards(txs))/1000, "", "", block, txIndex); t++}
                }
                continue
            }
            tx = tx.split("||")[0]
            if (tx.startsWith("MSG|")) {
                let [, from, to, , , messageHex] = tx.split("|")
                let bytes = Uint8Array.from(Buffer.from(messageHex, "hex"))
                let messageText = new TextDecoder("utf-8").decode(bytes)
                if (from === address) {addHistoryElement("msg", i, -1, parseAddr(to), "", block, txIndex); t++}
                if (to === address) {addHistoryElement("msg", i, 0, parseAddr(from), messageText, block, txIndex); t++}
                continue
            }
            let [from, to, amount,] = tx.split("|")
            if (from === address) {addHistoryElement("tx", i, -1*Number(amount)/1000, parseAddr(to), "", block, txIndex); t++}
            if (to === address) {addHistoryElement("tx", i, (Number(amount)-getFee(Number(amount)))/1000, parseAddr(from), "", block, txIndex); t++}
        }
    }
}
function addHistoryElement(type, blocksAgo, change, addr="", msg="", block="", txIndex) {
    let hist = document.getElementById("history")
    let time = ""
    let ts = 0
    if (block !== "") {ts = getTs(block)}
    if (blocksAgo >= 0) {
        if (ts === 0) {time = `<p class="timeH">${blocksAgo+1} blocks ago`}
        else {time = `<p class="timeH">${blocksAgo+1} blocks ago (${formatTime(ts)})</p>`}
    }
    else {time = `<p class="timeH" style="color: #c537de">Unverified</p>`;}
    if (type === "tx") {
        if (change >= 0) {
            hist.innerHTML += `
                <button onclick='openTxInfo(${blocksAgo}, ${txIndex})' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1dcd20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote-arrow-up-icon lucide-banknote-arrow-up iconH"><path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="M18 12h.01"/><path d="M19 22v-6"/><path d="m22 19-3-3-3 3"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></svg>
                    ${time}
                    <p class="changeH" style="color: #1dcd20">+${change.toFixed(3)}</p>
                    <p class="infoH">Received from <span style="color: #899df1">${addr}</span></p>
                </button>
                `
        }
        else {
            hist.innerHTML += `
                <button onclick='openTxInfo(${blocksAgo}, ${txIndex})' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff4242" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote-arrow-down-icon lucide-banknote-arrow-down iconH"><path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="m16 19 3 3 3-3"/><path d="M18 12h.01"/><path d="M19 16v6"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></svg>
                    ${time}
                    <p class="changeH" style="color: #ff4242">${change.toFixed(3)}</p>
                    <p class="infoH">Sent to <span style="color: #899df1">${addr}</p>
                </button>
                `
        }
    }
    else if (type === "msg") {
        if (change === 0) {
            hist.innerHTML += `
                <button onclick='openTxInfo(${blocksAgo}, ${txIndex})' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6196ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-text-icon lucide-message-square-text iconH"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg>
                    ${time}
                    <p class="changeH" style="color: #899df1">Received</p>
                    <p class="infoH">From <span style="color: #899df1">${addr}: <span style="color: #6774ff">${msg}</p>
                </button>
            `
        }
        else {
            hist.innerHTML += `
                <button onclick='openTxInfo(${blocksAgo}, ${txIndex})' class="historyItem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6196ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-text-icon lucide-message-square-text iconH"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg>
                    ${time}
                    <p class="changeH" style="color: #ff4242">-1.000</p>
                    <p class="infoH">Message sent to <span style="color: #899df1">${addr}</p>
                </button>
                `
        }
    }
    else {
        hist.innerHTML += `
            <button onclick='openTxInfo(${blocksAgo}, ${txIndex})' class="historyItem">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6196ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pickaxe-icon lucide-pickaxe iconH"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/></svg>
                ${time}
                <p class="changeH" style="color: #1dcd20">+${change.toFixed(3)}</p>
                <p class="infoH">Block #${blocks.length - blocksAgo} mined</p>
            </button>
            `
    }
}
function openTxInfo(blockIndex, txIndex) {
    document.getElementById("txInfo").style.display = "flex"
    let titleText = document.getElementById("txInfoTitle")
    let blockIndexText = document.getElementById("txInfoBlockIndexField")
    let fromText = document.getElementById("txInfoFromField")
    let toText = document.getElementById("txInfoToField")
    let amountText = document.getElementById("txInfoAmountField")
    let feesText = document.getElementById("txInfoFeesField")
    let confText = document.getElementById("txInfoConfField")
    let dateText = document.getElementById("txInfoDateField")
    let extraLabel = document.getElementById("txInfoExtraLabel")
    let extraText = document.getElementById("txInfoExtraField")
    extraLabel.innerText = ""

    let txInfo = {}
    let isMsg = false
    let tx = ""
    let block = ""
    if (blockIndex === -1) {
        tx = mempool[txIndex]
        console.log(tx, txIndex)
    }
    else {
        block = blocks[blocks.length-blockIndex-1]
        let txs = block.slice(block.indexOf(",") + 1)
        txs = split_(txs)
        tx = txs[txIndex]
    }
    [txInfo, isMsg] = parseTx(tx)

    let fees = (getFee(txInfo.amount)/1000).toFixed(3)
    txInfo.amount = (txInfo.amount/1000).toFixed(3)
    if (txIndex === 0) {fees = "0.000"}

    txInfo.from = truncateAddress(parseAddr(txInfo.from))
    txInfo.to = truncateAddress(parseAddr(txInfo.to))
    fromText.innerText = txInfo.from
    toText.innerText = txInfo.to
    amountText.innerText = txInfo.amount
    feesText.innerText = fees
    if (isMsg) {
        let bytes = Uint8Array.from(Buffer.from(txInfo.msgHex, "hex"))
        let msg = new TextDecoder("utf-8").decode(bytes)
        extraLabel.innerText = "Message Sent:"
        extraText.innerText = msg
    }
    else {
        extraLabel.innerText = ""
        extraText.innerText = ""
    }
    titleText.innerText = `Transaction ${Buffer.from(sha256(sha256(Buffer.from(`${tx}`, "utf-8")))).toString("hex").slice(0, 20)}`
    if (blockIndex !== -1) {
        blockIndexText.innerText = `#${blocks.length-blockIndex}`
        confText.innerText = blockIndex+1
        dateText.innerText = (new Date(getTs(block)*1000)).toLocaleString()
    }
    else {
        blockIndexText.innerText = `In mempool, unverified`
        confText.innerText = "0"
        dateText.innerText = "No date until verified"
    }
}
function closeTxInfo() {
    document.getElementById("txInfo").style.display = "none"
}
function removeContact(addr) {
    document.getElementById("contactList").innerHTML = ""
    let contacts = getContacts()
    let result = []
    for (let contact of contacts) {
        if (contact[0] !== addr) {result.push(contact)}
    }
    saveContacts(result)
    initContacts()
}
function addContact() {
    const addr = document.getElementById("contactAddress").value
    const name = document.getElementById("contactName").value
    document.getElementById("contactList").innerHTML += `
            <div class="contactItem">
                <span>${addr}: ${name}</span>
                <button class="btn smallBtn" onclick="removeContact('${addr}')">×</button>
            </div>
        `
    let data = getContacts()
    data.push([addr, name])
    saveContacts(data)
}

function openPage(newPage) {
    if (newPage === page) {return}
    document.getElementById(`page${newPage}`).style.display = "flex"
    document.getElementById(`page${page}`).style.display = "none"
    page = newPage
}
function updateBlockData() {
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
    let searchSpecific = false
    document.getElementById("explorerData").innerHTML = ""
    let addrSearch = document.getElementById("searchingAddress").value
    if (addrSearch !== "") {
        addrSearch = parseContact(addrSearch)
        console.log(addrSearch, getSpendableBalance(addrSearch), getSpendableBalance(addrSearch)/1000, (getSpendableBalance(addrSearch)/1000).toFixed(3))
        document.getElementById("searchBalance").innerText = (getSpendableBalance(addrSearch)/1000).toFixed(3)
        searchSpecific = true
        document.getElementById("explorerAmountText").innerText = "Change"
        document.getElementById("searchBalanceInfo").style.display = "flex"
    }
    else {
        document.getElementById("explorerAmountText").innerText = "Amount"
        document.getElementById("searchBalanceInfo").style.display = "none"
    }
    if (hideSystemMined) {
        let rowCount = document.getElementById("maxTxDisplay").value
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
                if (tx.startsWith("SYSTEM|8943e2763da16d5da9276b5ed900a78ff6ad9cfa|")) {
                    if (txs.length === 1) {break}
                }
                if (tx.startsWith("SYSTEM|")) {
                    tx = tx.split("|")
                    let to = parseAddr(tx[1])
                    if (searchSpecific && tx[0] !== addrSearch && tx[1] !== addrSearch) {continue}
                    let amount = ""
                    if (searchSpecific) {amount = "+" + (Number(tx[2]) + getMinerRewards(txs))}
                    else {amount = Number(tx[2]) + getMinerRewards(txs)}
                    addItem(i+1, "Block Mined", truncateAddress(to), amount, "", tx[1])
                    totalInfo += 1
                }
                else if (!tx.startsWith("MSG|")) {
                    tx = tx.split("|")
                    let to = parseAddr(tx[1])
                    let from = parseAddr(tx[0])
                    let amount = Number(tx[2])
                    if (searchSpecific && tx[0] !== addrSearch && tx[1] !== addrSearch) {continue}
                    if (!searchSpecific) {addItem("", truncateAddress(from), truncateAddress(to), amount - getFee(amount), tx[0], tx[1])}
                    else {
                        if (tx[0] === addrSearch) {
                            addItem("", truncateAddress(from), truncateAddress(to), "-" + (amount - getFee(amount)), tx[0], tx[1], true)
                        }
                        else {
                            addItem("", truncateAddress(from), truncateAddress(to), "+" + (amount - getFee(amount)), tx[0], tx[1])
                        }
                    }
                    totalInfo += 1
                }
            }
        }
    }
    else {
        let rowCount = document.getElementById("maxTxDisplay").value
        let totalInfo = 0
        let i = blocks.length
        while (totalInfo <= rowCount) {
            i--
            if (i < 1) {
                return
            }
            let block = blocks[i]
            let index = block.indexOf(",")
            let txs = block.slice(index + 1)
            txs = split_(txs)
            for (let tx of txs) {
                if (tx.startsWith("SYSTEM|")) {
                    tx = tx.split("|")
                    let to = parseAddr(tx[1])
                    addItem(i+1, "Block Mined", truncateAddress(to), Number(tx[2]) + getMinerRewards(txs), "", tx[1])
                    totalInfo += 1
                }
                else if (!tx.startsWith("MSG|")) {
                    tx = tx.split("|")
                    let to = parseAddr(tx[1])
                    let from = parseAddr(tx[0])
                    let amount = Number(tx[2])
                    addItem("", truncateAddress(from), truncateAddress(to), amount - getFee(amount), tx[0], tx[1])
                    totalInfo += 1
                }
            }
        }
    }
}