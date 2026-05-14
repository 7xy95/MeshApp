async function send(message, nodeId) {
    while (true) {
        try {
            console.log("sending")
            await fetch(url + "sendMessage", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    toId: nodeId,
                    fromId: id,
                    message: message
                })
            })
            break
        }
        catch (error) {console.log(error); await sleep(100)}
    }
}
async function getLatestVersion() {
    let response = await fetch("https://api.github.com/repos/7xy95/MeshApp/releases/latest")
    response = await response.json()
    return response.tag_name
}
async function deleteMsg(rowId) {
    try {
        await fetch(url + "deleteMessageRow", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({rowId: rowId})
        })
    }
    catch (error) {console.log(error)}
}
async function read(timeout=5) {
    const controller = new AbortController()
    const timer = setTimeout(() => {controller.abort()}, timeout*3000)
    try {
        let response = await fetch(url + `nextMessage?id=${id}&timeout=${timeout}`, {signal: controller.signal})
        response = await response.json()
        return [response.message, response.senderId, response.rowId, true]
    }
    catch (error) {console.log(error); return ["noResponse", -1, null, false]}
    finally {clearTimeout(timer)}
}
async function getIds() {
    while (true) {
        try {
            let response = await fetch(url + "allIds")
            let data = await response.json()
            return data.ids
        }
        catch (error) {await sleep(1500)}
    }
}
async function newId() {
    let response = await fetch(url + "newId")
    let data = await response.json()
    return data.id
}