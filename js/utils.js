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
function truncateAddress(address) {
    if (address.length > 10) {return address.slice(0, 10) + "..."}
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
