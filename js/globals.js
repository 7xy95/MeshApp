const APP_VERSION = "v1.2.8"
const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000|935a313db940e4e3950a4e28bd0df6175aa03dcf29dfadc20efda2638c01b0e3|1774694716|13484619,[SYSTEM|0000000000000000000000000000000000000000|10000|0,SYSTEM|0a74dc9a74505d0d0c3467768d8bfee675c55617|4000|0,SYSTEM|0bf1d6199ab6273a9b320a4a891b040bc8858396|4000|0,SYSTEM|0d581e9c6d3276be90af893e24dc719a7cc72262|10000|0,SYSTEM|0dca1379707a0d60b103d958404d8a7a5eae880b|4000|0,SYSTEM|1a42c30482a50a469cec63bdb62158f0efaf97c4|4000|0,SYSTEM|2155e2425d076a2de830251920c9603791596af8|3000|0,SYSTEM|2442c616fd7c91a03c01eeb47e487555d180a984|1830000|0,SYSTEM|2d2e0aedd0850213ab0a71b2ff8e5ed47f4effe7|13000|0,SYSTEM|35ec9347fb781fe55b2995218bd544783231d86f|4000|0,SYSTEM|384be4f6f91c805e21b1bd32dbb68a73583dae56|25000|0,SYSTEM|3a01e4d633cee7fc9a34cb034b92608502c409bc|20000|0,SYSTEM|3ae637d7353bd8d7ccdd705fa020d958370b94b8|13000|0,SYSTEM|469706da92206dc2a45c9efa34b8809c8216bc34|4000|0,SYSTEM|4b525cf93bf84e322f69c59ad44ccfaa0fc7df75|4000|0,SYSTEM|50fd1abcb005e65f351caeec1eefcd73afe12d70|25000|0,SYSTEM|68e09039506c053f1b995d963ef897caf985f7ab|10000|0,SYSTEM|6d7a3f726f558f480e357ccbd1b8d8a80956eeb7|4000|0,SYSTEM|8288a9ac11d3e033a293659d5cbec991677c4c7c|15000|0,SYSTEM|8c92a4003a6b0950a7735d8c48ac9a1b8202eaac|104000|0,SYSTEM|906dbe3def97d809c27c4cfc9019a11ee0822dc7|19000|0,SYSTEM|98c24d2dd4058f8c9df1edb428f3ad0ac3be181a|921000|0,SYSTEM|a7ca91134370a73e687edb0388f348467262fb83|1000|0,SYSTEM|ad9eb264a8a69b2e994f8e99923fc8d447c912a4|4000|0,SYSTEM|adfbe0fc6884d51ad3ce054823493f900a33ed10|77000|0,SYSTEM|b195b7bb196f967ae57b1cccd0bc6bb0b7bb2961|4000|0,SYSTEM|b2f7f2016dacd0129ebcf7c1692964a0254ec525|3000|0,SYSTEM|bfe2a86f33e265d941caaf38f10aca4fd98e322f|4000|0,SYSTEM|c09cdc089d4100295711955f2457ef9fcc28030f|4000|0,SYSTEM|cb07dbe8de4a0a69c740b06c4b1f53fbeaf9e182|4000|0,SYSTEM|ccccd37dfe8ffcaa44787e07410c0bf29dcb4bfe|4000|0,SYSTEM|d7017b1d017ba24675769b4729219acb55bb43b9|4000|0,SYSTEM|e116e296e531bb0abbb2bad896e168d4cf998dbb|25000|0,SYSTEM|ed311963c66a41024a0c66b65d1e2674789c5224|4000|0,SYSTEM|f0f6f53682e90e5475a46fa589f57811830c8e79|100000|0,SYSTEM|f56ac4ea514c2f5f93b2d4300d980ef9492ae8e2|2000|0]"
const MAX_GET_REQUESTS = 10
const C1 = 16384

let privateKey = ""
let publicKey = ""
let address = ""
let miningAddress = ""

let difficultyCache = [230]
let balancesCache = {}
let nonceCache = new Set()
function cacheBlock(block) {
    let index = block.indexOf(",")
    let txs = split_(block.slice(index+1))
    let i = -1
    for (let tx of txs) {
        i++
        if (tx.startsWith("SYSTEM|")) {
            let [, to, amount,] = tx.split("|")
            amount = Number(amount)
            if (i === 0) {balancesCache[to] = (balancesCache[to]||0) + amount + getMinerRewards(txs)}
            else {balancesCache[to] = (balancesCache[to]||0) + amount}
        }
        else {
            tx = tx.split("||")[0]
            if (tx.startsWith("MSG|")) {
                let [, from, , amount, nonce] = tx.split("|")
                amount = Number(amount)
                balancesCache[from] = (balancesCache[from]||0) - amount
                nonceCache.add(`${from}|${nonce}`)
            }
            else {
                let [from, to, amount, nonce] = tx.split("|")
                amount = Number(amount)
                balancesCache[from] = (balancesCache[from]||0) - amount
                balancesCache[to] = (balancesCache[to]||0) + amount - getFee(amount)
                nonceCache.add(`${from}|${nonce}`)
            }
        }
    }
}

const fs = require("fs")
const path = require("path")
const os = require("os")
const crypto = require("crypto")
const { secp256k1 } = require("@noble/curves/secp256k1.js")

const dataDir = process.env.userPath

const contacts = path.join(dataDir, "contacts.json")
const blocksPath = path.join(dataDir, "blocks.json")

let allIds = []

let batteryLevel = 1
let isCharging = null
let batteryThreshold = 0.61

let forkCase = false
let mine = false
let stop = false
let useGPU = false
let hideSystemMined = true

let totalHashes = 0
let totalHashesFound = 0
let lastSeen = Date.now()
let id = 0
let secret = 0

let latestVersion = ""
let mempool = []
let blocks = []
let url = ""

let noStart = false
let idRequestCount = {}
let blacklistedIds = []

let popup = -1
let page = 0