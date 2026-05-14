function verifyTx(tx_, checkMempool=true) {
    try {
        let [tx, pubKey, sig] = tx_.split("||")
        pubKey = String(pubKey); sig = String(sig); tx = String(tx)
        pubKey = new Uint8Array(Buffer.from(pubKey, "hex"))
        sig = new Uint8Array(Buffer.from(sig, "hex"))
        let parts = tx.split("|")
        if (parts.length !== 4) {return false}
        let [from, to, amount, nonce] = parts
        amount = Number(amount); nonce = Number(nonce)
        if (amount < 1) {return false}
        if (checkMempool && nonce < getNextNonce(from)) {return false}
        let txHash = sha256(Buffer.from(tx, "utf-8"))
        if (!secp256k1.verify(sig, txHash, pubKey, {prehash: false, format: "der"})) {return false}
        if (from !== hash160(pubKey).toString("hex")) {return false}
        if (checkMempool && amount > getSpendableBalance(from, tx_)) {return false}
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
function verifyBlock(block) {
    try {
        let index = block.indexOf(",")
        let header = block.slice(0, index)
        let txs = block.slice(index+1)
        txs = split_(txs)
        let parts = header.split("|")
        if (parts.length !== 4) {return false}
        let [priorHash, merkleRoot, ts, nonce] = parts
        ts = Number(ts)
        if (ts >= Math.round(Date.now()/1000)+60) {return false}
        nonce = Number(nonce)
        if (txs.length === 0) {return false}
        let combined = ""
        for (let i=0; i<txs.length; i++) {
            combined += txs[i]
        }
        if (sha256(Buffer.from(combined, "utf-8")).toString("hex") !== merkleRoot) {return false}
        let t = []
        let from = ""; let txNonce = ""
        for (const tx of txs.slice(1)) {
            let tx_ = tx.split("||")[0]
            if (tx_.startsWith("MSG|")) {
                [, from, , , txNonce,] = tx_.split("|")
                if (!verifyMsg(tx, false) || nonceCache.has(`${from}|${txNonce}`)) {return false}
            }
            else {
                [from, , , txNonce] = tx_.split("|")
                if (!verifyTx(tx, false) || nonceCache.has(`${from}|${txNonce}`)) {return false}
            }
            for (const [f, n] of t) {
                if (f === from && n === txNonce) {return false}
            }
            t.push([from, txNonce])
        }
        let tempBalances = {...balancesCache}
        let to = ""; let amount = 0; from = ""
        for (let tx of txs.slice(1)) {
            tx = tx.split("||")[0]
            if (tx.startsWith("MSG|")) {
                [, from, to, amount, ,] = tx.split("|")
                amount = 1000
            }
            else {
                [from, to, amount, ] = tx.split("|")
                amount = Number(amount)
            }
            if ((tempBalances[from] || 0) < amount) {return false}
            tempBalances[from] = (tempBalances[from] || 0) - amount
            tempBalances[to] = (tempBalances[to] || 0) + amount - getFee(amount)
        }
        let result = BigInt("0x" + sha256(sha256(Buffer.from(`${priorHash}|${merkleRoot}|${ts}|${nonce}`, "utf-8"))).toString("hex"))
        let blockIndex = blocks.length
        if (!txs[0].startsWith("SYSTEM|") || !txs[0].endsWith(`|${getBlockReward(blockIndex)}|0`)) {return false}
        if (blockIndex === 0) {
            if (priorHash !== "0".repeat(64)) {return false}
        }
        else {
            index = blocks[blocks.length-1].indexOf(",")
            let lastHeader = blocks[blocks.length-1].slice(0, index)
            let [lHash, lRoot, lTs, lNonce] = lastHeader.split("|")
            if (Number(lTs) > ts) {return false}
            let expected = BigInt("0x" + sha256(sha256(Buffer.from(`${lHash}|${lRoot}|${Number(lTs)}|${Number(lNonce)}`, "utf-8"))).toString("hex")).toString(16)
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