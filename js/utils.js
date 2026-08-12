function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function sha256(data) {
    return crypto.createHash("sha256").update(data).digest()
}
function hash160(data) {
    return crypto.createHash("ripemd160").update(sha256(data)).digest()
}
function seedToAddress(seedText) {
    privateKey = sha256(sha256(Buffer.from(String(seedText), "utf-8")))
    publicKey = Buffer.from(secp256k1.getPublicKey(privateKey, true))
    address = hash160(publicKey).toString("hex")
    if (miningAddress === "") {miningAddress = address}
}
function split_(text) {
    text = text.trim()
    let result = []
    let current = ""
    let nestedList = 0
    const startIndex = text.indexOf("[")
    text = text.slice(startIndex+1).replaceAll(" ", "").replaceAll("'", "").replaceAll('"', "")
    for (let c=0; c<text.length; c++) {
        let currentChar = text[c]
        let nextChar = text[c+1]
        if (currentChar === "," && nextChar === "[") {
            nestedList++
            current += currentChar
            continue
        }
        if (currentChar === "," && nestedList === 0) {
            result.push(current.trim())
            current = ""
            continue
        }
        if (currentChar === "]" && nestedList === 0) {
            result.push(current.trim())
            continue
        }
        if (currentChar === "]") {
            current += currentChar
            nestedList--
            continue
        }
        current += currentChar
    }
    return result.filter(x => x !== "")
}
function parseAddr(address) {
    let contacts = getContacts()
    for (let contact of contacts) {
        if (contact[0] === address) {return contact[1]}
    }
    return address
}
function parseContact(address) {
    let contacts = getContacts()
    for (let contact of contacts) {
        if (contact[1] === address) {return contact[0]}
    }
    return address
}
function hashTx(tx) {
    let txHash = sha256(Buffer.from(tx, "utf-8"))
    let signature = secp256k1.sign(txHash, privateKey, { prehash: false, format: "der" })
    return `${tx}||${Buffer.from(publicKey).toString("hex")}||${Buffer.from(signature).toString("hex")}`
}
function truncateAddress(address, a=10) {
    if (address.length > a) {return address.slice(0, a) + "..."}
    else {return address}
}
function format(number, hashrateUnits=true) {
    let units = []
    if (hashrateUnits) {
        units = [
            [" PH", 1_000_000_000_000_000],
            [" TH", 1_000_000_000_000],
            [" GH", 1_000_000_000],
            [" MH", 1_000_000],
            [" KH", 1_000]
        ]
    }
    else {
        units = [
            ["Q", 1_000_000_000_000_000],
            ["T", 1_000_000_000_000],
            ["B", 1_000_000_000],
            ["M", 1_000_000],
            ["K", 1_000]
        ]
    }
    for (let [suffix, amount] of units) {
        if (number >= amount) {return (number/amount).toFixed(2) + suffix}
    }
    return number
}
function formatTime(unixTs) {
    let difference = Math.floor(Date.now()/1000) - unixTs
    difference = Math.ceil(difference/60)
    let years = difference/60/24/365
    let days = (years - Math.floor(years))*365
    let hours = (days - Math.floor(days))*24
    let minutes = (hours - Math.floor(hours))*60
    if (years >= 1) {
        return `${Math.floor(years)}y${Math.floor(days)}d`
    }
    if (days >= 1) {
        return `${Math.floor(days)}d${Math.floor(hours)}h`
    }
    if (hours >= 1) {
        return `${Math.floor(hours)}h${Math.floor(minutes)}m`
    }
    return `${Math.floor(minutes)}m`
}
function parseTx(tx) {
    tx = tx.split("||")[0]
    if (tx.startsWith("MSG|")) {
        let [, from, to, amount, nonce, msgHex] = tx.split("|")
        return [{
            "from": from,
            "to": to,
            "amount": amount,
            "nonce": nonce,
            "msgHex": msgHex
        }, true]
    }
    else {
        let [from, to, amount, nonce] = tx.split("|")
        return [{
            "from": from,
            "to": to,
            "amount": amount,
            "nonce": nonce
        }, false]
    }
}
function openTxInfo(blockIndex, txIndex) {
    style("txInfo", "display", "flex")
    edit("txInfoExtraLabel", "innerText", "")

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
    if (txIndex === 0) {
        fees = "0.000"
        // txInfo.amount += " + fees"
    }

    edit("txInfoFromField", "innerHTML", `<span class="value" style="cursor: pointer" 
        onclick="navigator.clipboard.writeText('${txInfo.from}')">${truncateAddress(parseAddr(txInfo.from))}</span>`)
    edit("txInfoToField", "innerHTML", `<span class="value" style="cursor: pointer" 
        onclick="navigator.clipboard.writeText('${txInfo.to}')">${truncateAddress(parseAddr(txInfo.to))}</span>`)

    edit("txInfoAmountField", "innerText", txInfo.amount)

    edit("txInfoFeesField", "innerText", fees)
    if (isMsg) {
        let bytes = Uint8Array.from(Buffer.from(txInfo.msgHex, "hex"))
        let msg = new TextDecoder("utf-8").decode(bytes)
        edit("txInfoExtraLabel", "innerText", "Message Sent:")
        edit("txInfoExtraField", "innerText", msg)
    }
    else {
        edit("txInfoExtraLabel", "innerText", "")
        edit("txInfoExtraField", "innerText", "")
    }
    edit("txInfoTitle", "innerText", `Transaction ${Buffer.from(sha256(sha256(Buffer.from(`${tx}`, "utf-8")))).toString("hex").slice(0, 20)}`)
    if (blockIndex !== -1) {
        edit("txInfoBlockIndexField", "innerText", `#${blocks.length-blockIndex}`)
        edit("txInfoConfField", "innerText", blockIndex+1)
        edit("txInfoDateField", "innerText", (new Date(getTs(block)*1000)).toLocaleString())
    }
    else {
        edit("txInfoBlockIndexField", "innerText", "In mempool, unverified")
        edit("txInfoConfField", "innerText", "0")
        edit("txInfoDateField", "innerText", "No date until verified")
    }
}
function remove(list, itemToRemove) {
    return list.filter(item => item !== itemToRemove)
}