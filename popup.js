document.querySelector("#open").addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "OPEN_APP" }); window.close(); });
