const sessionStarted = sessionStorage.getItem("sessionStarted") === "true"
if (!sessionStarted) {
    localStorage.removeItem("privateKey")
    sessionStorage.setItem("sessionStarted", "true")
    console.log("yes")
}
else {console.log("no")}