const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const clearBtn = document.getElementById("clear-all");

function render(highlights) {
  listEl.innerHTML = "";
  countEl.textContent = highlights.length;

  if (highlights.length === 0) {
    emptyEl.classList.remove("hidden");
    clearBtn.classList.add("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  clearBtn.classList.remove("hidden");

  highlights.forEach((h) => {
    const li = document.createElement("li");

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = h.color;

    const text = document.createElement("span");
    text.className = "highlight-text";
    text.textContent = h.text;

    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.textContent = "×";
    btn.title = "Remove";
    btn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "remove-highlight",
          id: h.id,
        });
        loadHighlights();
      });
    });

    li.appendChild(dot);
    li.appendChild(text);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function loadHighlights() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const key = new URL(tabs[0].url).origin + new URL(tabs[0].url).pathname;
    chrome.storage.local.get(key, (result) => {
      render(result[key] || []);
    });
  });
}

clearBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const key = new URL(tabs[0].url).origin + new URL(tabs[0].url).pathname;
    chrome.storage.local.remove(key, () => {
      chrome.tabs.reload(tabs[0].id);
      render([]);
    });
  });
});

document.getElementById("settings-link").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadHighlights();
