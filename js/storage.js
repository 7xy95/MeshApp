function initContacts() {
    if (getContacts() === null) {saveContacts([])}
    else {
        let contacts = getContacts()
        for (let contact of contacts) {
            document.getElementById("contactList").innerHTML += `
                    <div class="contactItem">
                        <span>${contact[0]}: ${contact[1]}</span>
                        <button class="btn smallBtn" onclick="removeContact('${contact[0]}')">×</button>
                    </div>
                `
        }
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
function saveSession() {
    localStorage.setItem("privateKey", Buffer.from(privateKey).toString("hex"))
    localStorage.setItem("publicKey", Buffer.from(publicKey).toString("hex"))
    localStorage.setItem("address", address)
    localStorage.setItem("mine", JSON.stringify(mine))
    localStorage.setItem("useGPU", JSON.stringify(useGPU))
}
async function loadSession() {
    if (localStorage.getItem("privateKey") == null) {return}
    privateKey = Buffer.from(localStorage.getItem("privateKey"), "hex")
    publicKey = Buffer.from(localStorage.getItem("publicKey"), "hex")
    address = localStorage.getItem("address")
    mine = JSON.parse(localStorage.getItem("mine"))
    useGPU = JSON.parse(localStorage.getItem("useGPU"))
    document.getElementById("logInPanel").style.display = "none"
    document.getElementById("mainPanel").style.display = "flex"
    document.getElementById("useGPUCheckbox").checked = useGPU
    void start()
}