chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener(() => {
  applyStoredIcon();
});

chrome.runtime.onStartup.addListener(() => {
  applyStoredIcon();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "set-icon") {
    setIcon(msg.color);
  }
});

function setIcon(color) {
  const details = {};
  [16, 48, 128].forEach((size) => {
    details[String(size)] = "icons/options/" + color + "_" + size + ".png";
  });
  chrome.action.setIcon({ path: details });
}

function applyStoredIcon() {
  chrome.storage.local.get("_wh_settings", (result) => {
    const settings = result._wh_settings || {};
    const color = settings.iconColor || "yellow";
    const details = {};
    [16, 48, 128].forEach((size) => {
      details[String(size)] = "icons/options/" + color + "_" + size + ".png";
    });
    chrome.action.setIcon({ path: details });
  });
}
