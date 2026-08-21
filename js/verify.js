const MAX_HEADER_LENGTH = 160
const MAX_TX_LENGTH = 400

function validInt(value, maxLength = 15) {
    if (value.length < 1 || value.length > maxLength) {return false}
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {return false}
    return Number.isSafeInteger(Number(value))
}
function validHex(hex, length) {
    return 0 < hex.length && hex.length <= length && /^[0-9a-f]+$/.test(hex)
}

function verifyTx(tx_, checkMempool=true) {
    try {
        if (tx_.length > MAX_TX_LENGTH) {return false}
        let txParts = tx_.split("||")
        if (txParts.length !== 3) {return false}
        let [tx, pubKey, sig] = txParts
        if (!validHex(pubKey, 66)) {return false}
        if (pubKey.slice(0, 2) !== "02" && pubKey.slice(0, 2) !== "03") {return false}
        if (sig.length < 1 || sig.length > 144 || sig.length % 2 !== 0 || !/^[0-9a-f]+$/.test(sig)) {return false}
        pubKey = String(pubKey); sig = String(sig); tx = String(tx)
        pubKey = new Uint8Array(Buffer.from(pubKey, "hex"))
        sig = new Uint8Array(Buffer.from(sig, "hex"))
        let parts = tx.split("|")
        if (parts.length !== 4 && parts.length !== 5) {return false}
        let [from, to, amount, nonce, fee] = parts
        if (fee === undefined) {
            fee = 0
            if (blocks.length > FEE_CHANGE_H) {return false}
        }
        if (blocks.length > FEE_CHANGE_H) {fee++}
        if (!validHex(from, 40) || (blocks.length > 23000 && !validHex(to, 40))) {return false}
        if (!validInt(amount) || !validInt(nonce) || !validInt(fee)) {return false}
        amount = Number(amount); nonce = Number(nonce); fee = Number(fee)
        if (amount < 1) {return false}
        if (checkMempool && mempool.some(memTx => {
            let parts = memTx.split("||")[0].split("|")
            let memFrom = parts[0] === "MSG" ? parts[1] : parts[0]
            let memNonce = parts[0] === "MSG" ? parts[4] : parts[3]

            return memFrom === from && Number(memNonce) === nonce
        })) {return false}
        let txHash = sha256(Buffer.from(tx, "utf-8"))
        if (!secp256k1.verify(sig, txHash, pubKey, {prehash: false, format: "der"})) {return false}
        if (from !== hash160(pubKey).toString("hex")) {return false}
        if (nonceCache.has(`${from}|${nonce}`)) {return false}
        if (checkMempool && amount+fee > getSpendableBalance(from, tx_)) {return false}
        return true
    }
    catch (error) {
        console.log(error)
        return false
    }
}
function verifyBlock(block) {
    try {
        if (blocks.length === 0) {
            if (block === GENESIS) {return true}
            return false
        }
        let index = block.indexOf(",")
        let header = block.slice(0, index)
        if (header.length > MAX_HEADER_LENGTH) {return false}
        let txs = block.slice(index+1)
        txs = split_(txs)
        let parts = header.split("|")
        if (parts.length !== 4) {return false}
        let [priorHash, merkleRoot, ts, nonce] = parts
        if (!validHex(priorHash, 64) || !validHex(merkleRoot, 64)) {return false}
        if (!validInt(ts, 12) || !validInt(nonce)) {return false}
        ts = Number(ts)
        if (ts >= Math.round(Date.now()/1000)+5) {return false}
        nonce = Number(nonce)
        if (txs.length === 0) {return false}
        if (txs.length > getMaxTxs() && blocks.length > FEE_CHANGE_H) {return false}
        let combined = ""
        for (let i=0; i<txs.length; i++) {
            combined += txs[i]
        }
        if (sha256(Buffer.from(combined, "utf-8")).toString("hex") !== merkleRoot) {return false}
        let seenNonces = new Set()
        let from = ""; let txNonce = ""
        for (const tx of txs.slice(1)) {
            let tx_ = tx.split("||")[0]
            if (tx_.startsWith("MSG|")) {
                if (blocks.length > 23000) {return false}
                [, from, , , txNonce,] = tx_.split("|")
                if (!verifyMsg(tx, false) || nonceCache.has(`${from}|${txNonce}`)) {return false}
            }
            else {
                [from, , , txNonce] = tx_.split("|")
                if (!verifyTx(tx, false) || nonceCache.has(`${from}|${txNonce}`)) {return false}
            }
            let nonceKey = `${from}|${txNonce}`
            if (seenNonces.has(nonceKey)) {return false}
            seenNonces.add(nonceKey)
        }
        let tempBalances = {...balancesCache}
        let to = ""; let amount = 0; from = ""
        for (let tx of txs.slice(1)) {
            let fee = undefined

            tx = tx.split("||")[0]
            if (tx.startsWith("MSG|")) {
                if (blocks.length > 23000) {return false}
                [, from, to, amount, ,] = tx.split("|")
                amount = 1000
            }
            else {
                [from, to, amount, , fee] = tx.split("|")
                if (fee === undefined) {
                    fee = 0
                    if (blocks.length > FEE_CHANGE_H) {return false}
                }
                if (blocks.length > FEE_CHANGE_H) {fee++}
                if (!validInt(amount) || !validInt(fee)) {return false}
                amount = Number(amount); fee = Number(fee)
            }
            if (blocks.length > FEE_CHANGE_H) {
                if ((tempBalances[from] || 0) < amount + fee) {return false}
                tempBalances[from] = (tempBalances[from] || 0) - amount - fee
                tempBalances[to] = (tempBalances[to] || 0) + amount
            }
            else {
                if ((tempBalances[from] || 0) < amount) {return false}
                tempBalances[from] = (tempBalances[from] || 0) - amount
                tempBalances[to] = (tempBalances[to] || 0) + amount - getFee(amount)
            }
        }
        let result = BigInt("0x" + sha256(sha256(Buffer.from(header, "utf-8"))).toString("hex"))
        let blockIndex = blocks.length
        if (!txs[0].startsWith("SYSTEM|") || !txs[0].endsWith(`|${getBlockReward(blockIndex)}|0`)) {return false}
        if (txs[0].split("|").length !== 4) {return false}
        if (!validHex(txs[0].split("|")[1], 40)) {return false}
        if (blockIndex === 0) {
            if (priorHash !== "0".repeat(64)) {return false}
        }
        else {
            index = blocks[blocks.length-1].indexOf(",")
            let lastHeader = blocks[blocks.length-1].slice(0, index)
            let [lHash, lRoot, lTs, lNonce] = lastHeader.split("|")
            if (Number(lTs) > ts) {return false}
            let expected = BigInt("0x" + sha256(sha256(Buffer.from(lastHeader, "utf-8"))).toString("hex")).toString(16)
            if (priorHash !== expected) {return false}
        }
        if (result > BigInt(getDifficulty(blockIndex))) {return false}
        return true
    }
    catch (error) {
        console.log(error)
        return false
    }
}

function verifyMsg(msg, checkMempool=true) {
    try {
        let [tx, pubKey, sig] = msg.split("||")
        pubKey = String(pubKey); sig = String(sig); tx = String(tx)
        pubKey = Buffer.from(pubKey, "hex")
        sig = Buffer.from(sig, "hex")
        let parts = tx.split("|")
        if (parts.length !== 6) {return false}
        let [kind, from, to, amount, nonce, message] = parts
        if (kind !== "MSG") {return false}
        amount = Number(amount); nonce = Number(nonce)
        message = Buffer.from(message, "hex")
        if (amount !== 1000) {return false}
        let txHash = sha256(Buffer.from(tx, "utf-8"))
        if (checkMempool && nonce < getNextNonce(from)) {return false}
        if (!secp256k1.verify(sig, txHash, pubKey, { prehash: false, format: "der" })) {return false}
        if (from !== hash160(pubKey).toString("hex")) {return false}
        if (checkMempool && amount > getSpendableBalance(from, msg)) {return false}
        return true
    }
    catch (error) {
        console.log(error)
        return false
    }
}