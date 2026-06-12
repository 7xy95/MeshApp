function getNextNonce(address) {
    let nonce = 0
    let [from, n] = ["", ""]
    for (let block of blocks) {
        let index = block.indexOf(",")
        let txs = block.slice(index+1)
        txs = split_(txs)
        for (let tx of txs) {
            if (!tx.startsWith("SYSTEM|")) {
                if (tx.startsWith("MSG|")) {[, from, , ,n] = tx.split("||")[0].split("|")}
                else {[from, , ,n] = tx.split("||")[0].split("|")}
                if (from === address) {nonce = Math.max(nonce, Number(n))}
            }
        }
    }
    for (let tx of mempool) {
        if (tx.startsWith("SYSTEM|")) {continue}
        if (tx.startsWith("MSG|")) {[, from, , ,n] = tx.split("||")[0].split("|")}
        else {[from, , ,n] = tx.split("||")[0].split("|")}
        if (from === address) {nonce = Math.max(nonce, Number(n))}
    }
    return nonce + 1
}
function getMinerRewards(txs) {
    let total = 0
    for (let tx of txs) {
        if (tx.startsWith("MSG|") || tx.startsWith("SYSTEM|")) {continue}
        total += getFee(Number(tx.split("||")[0].split("|")[2]))
    }
    return total
}
function getSpendableBalance(address, ignoreTx="") {
    let vBalance = 0
    for (let block of blocks) {
        let index = block.indexOf(",")
        block = block.slice(index+1)
        let txs = split_(block)
        let i = -1
        for (let tx of txs) {
            i++
            if (tx.startsWith("SYSTEM|")) {
                let parts = tx.split("|")
                if (parts[1] === address) {
                    vBalance += Number(parts[2])
                    if (i === 0) {vBalance += getMinerRewards(txs)}
                }
            }
            else {
                tx = tx.split("||")[0]
                if (tx.startsWith("MSG|")) {
                    let [, from, , amount, ,] = tx.split("|")
                    if (from === address) {vBalance -= Number(amount)}
                    continue
                }
                let [from, to, amount,] = tx.split("|")
                if (from === address) {vBalance -= Number(amount)}
                if (to === address) {vBalance += Number(amount) - getFee(Number(amount))}
            }
        }
    }
    for (let tx of mempool) {
        if (tx === ignoreTx) {continue}
        let from = ""; let amount = 0
        tx = tx.split("||")[0]
        if (tx.startsWith("MSG|")) {[, from, , amount, ,] = tx.split("|")}
        else {[from, , amount,] = tx.split("|")}
        amount = Number(amount)
        if (from === address) {vBalance -= amount}
    }
    return vBalance
}
function getBalance(address) {
    let vBalance = 0
    let bIndex = -1
    for (let block of blocks) {
        bIndex++
        let index = block.indexOf(",")
        block = block.slice(index+1)
        let txs = split_(block)
        let i = -1
        for (let tx of txs) {
            i++
            if (tx.startsWith("SYSTEM|")) {
                let parts = tx.split("|")
                if (parts[1] === address) {
                    // if (bIndex < C1) vBalance += Number(parts[2])
                    // else vBalance += Number(parts[2])
                    vBalance += Number(parts[2])
                    if (i === 0) {vBalance += getMinerRewards(txs)}
                }
            }
            else {
                tx = tx.split("||")[0]
                if (tx.startsWith("MSG|")) {
                    let [, from, , amount, ,] = tx.split("|")
                    if (from === address) {vBalance -= Number(amount)}
                    continue
                }
                let [from, to, amount,] = tx.split("|")
                if (from === address) {vBalance -= Number(amount)}
                if (to === address) {vBalance += Number(amount) - getFee(Number(amount))}
            }
        }
    }
    let balance = vBalance
    for (let tx of mempool) {
        tx = tx.split("||")[0]
        if (tx.startsWith("MSG|")) {
            let [, from, , amount, ,] = tx.split("|")
            if (from === address) {balance -= Number(amount)}
            continue
        }
        let [from, to, amount,] = tx.split("|")
        if (from === address) {balance -= Number(amount)}
        if (to === address) {balance += Number(amount) - getFee(Number(amount))}
    }
    return [vBalance, balance]
}
function getDifficultyFromTs(prevTs, nextTs) {
    const TARGET = 300
    let gap = nextTs - prevTs
    let diff = (gap-TARGET)/TARGET
    diff = Math.max(Math.min(diff, 0.3), -0.3)
    return Math.round(diff*100)/100
}
function getDifficultyFromTs2(prevTs, nextTs) {
    const TARGET = 300
    let avg = (nextTs - prevTs)/5
    let diff = (avg-TARGET)/TARGET
    diff = Math.max(Math.min(diff, 0.3), -0.3)
    return Math.round(diff*100)/100
}
function getDifficultyFromTs3(prevTs, nextTs) {
    const TARGET = 300
    let avg = (nextTs - prevTs)/25
    let diff = Math.log2(avg/TARGET)
    diff = Math.max(Math.min(diff, 0.5), -0.5)
    return Math.round(diff*100)/100
}
function getDifficultyFromTs4(prevTs, nextTs, window=10, accurate=false) {
    const TARGET = 300
    let avg = (nextTs - prevTs)/window
    let diff = Math.log2(avg/TARGET)
    let diff_ = Math.max(Math.min(diff, 1), -1)
    if (Math.abs(diff_) === 1) {diff_ += (diff - diff_)/4}
    if (!accurate) {return Math.round(diff_*100)/100}
    return diff_
}
function getDifficulty(blockIndex) {
    const bits = getDifficultyBits(blockIndex)
    const int = Math.floor(bits)
    const frac = bits - int
    const precision = 52
    const scaled = BigInt(Math.floor(Math.pow(2, frac) * Math.pow(2, precision)))

    return scaled << BigInt(int - precision);
}
function getTs(block) {
    let header = block.split(",")[0]
    return Number(header.split("|")[2])
}
function getDifficultyBits(blockIndex) {
    if (difficultyCache[blockIndex] !== undefined) {return difficultyCache[blockIndex]}
    for (let i=difficultyCache.length; i<=blockIndex; i++) {
        if (i === 1) {difficultyCache[1] = 230; continue}
        const j = i-1
        let change = 0
        if (j <= 155) {change = getDifficultyFromTs(getTs(blocks[j - 1]), getTs(blocks[j]))}
        else if (j <= 7680) {change = getDifficultyFromTs2(getTs(blocks[j - 5]), getTs(blocks[j]))}
        else if (j <= 7950) {change = getDifficultyFromTs3(getTs(blocks[j - 25]), getTs(blocks[j]))}
        else if (i % 10 === 0) {change = getDifficultyFromTs4(getTs(blocks[j - 10]), getTs(blocks[j]))}
        difficultyCache[i] = difficultyCache[i-1] + change
    }
    return difficultyCache[blockIndex]
}
function getBlockReward(blockIndex) {
    if (blockIndex < 5_000) return 10000
    if (blockIndex < 15_000) return 5000
    if (blockIndex < 35_000) return 2500
    if (blockIndex < 75_000) return 1250
    if (blockIndex < 155_000) return 625
    if (blockIndex < 315_000) return 313
    if (blockIndex < 635_000) return 156
    if (blockIndex < 1_275_000) return 78
    if (blockIndex < 2_555_000) return 39
    if (blockIndex < 5_115_000) return 20
    if (blockIndex < 10_235_000) return 10
    if (blockIndex < 20_475_000) return 5
    if (blockIndex < 40_955_000) return 2
    else return 1
}
function getNextHalving() {
    let blockIndex = blocks.length
    if (blockIndex < 35_000) return 35_000
    if (blockIndex < 75_000) return 75_000
    if (blockIndex < 155_000) return 155_000
    if (blockIndex < 315_000) return 315_000
    if (blockIndex < 635_000) return 635_000
    if (blockIndex < 1_275_000) return 1_275_000
    if (blockIndex < 2_555_000) return 2_555_000
    if (blockIndex < 5_115_000) return 5_115_000
    if (blockIndex < 10_235_000) return 10_235_000
    if (blockIndex < 20_475_000) return 20_475_000
    if (blockIndex < 40_955_000) return 40_955_000
    else return -1
}
function getFee(amount) {
    if (amount > 10) {return Math.max(10, Math.ceil(amount*0.01))}
    else {return amount}
}