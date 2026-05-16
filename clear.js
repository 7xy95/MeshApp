const sessionStarted = sessionStorage.getItem("sessionStarted") === "true"
if (!sessionStarted) {
    // localStorage.removeItem("privateKey")
    sessionStorage.setItem("sessionStarted", "true")
}