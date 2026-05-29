const PRESET_COLORS = [
  { name: "red",    hex: "#f0a0a8", removable: false },
  { name: "orange", hex: "#f5c48a", removable: false },
  { name: "yellow", hex: "#f5e68a", removable: false },
  { name: "green",  hex: "#a8dba8", removable: false },
  { name: "blue",   hex: "#a0c4f4", removable: false },
  { name: "purple", hex: "#c8a8e8", removable: false },
];

const ICON_COLORS = ["red", "orange", "yellow", "green", "blue", "purple"];

const DEFAULTS = {
  opacity: 50,
  borderRadius: 2,
  customColors: [],
  colorShortcuts: {
    0: "Alt+1", 1: "Alt+2", 2: "Alt+3",
    3: "Alt+4", 4: "Alt+5", 5: "Alt+6",
  },
  textColors: {},
  iconColor: "yellow",
  showToolbar: true,
  showNotes: true,
};

let settings = { ...DEFAULTS };

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function colorWithOpacity(hex, opacity) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

function allColors() {
  const overrides = settings.presetOverrides || {};
  const presets = PRESET_COLORS.map((c) => ({ ...c, hex: overrides[c.name] || c.hex }));
  return [...presets, ...(settings.customColors || []).map((c) => ({ ...c, removable: true }))];
}

function markStyle(hex, textColor) {
  const bg = colorWithOpacity(hex, settings.opacity);
  const r = settings.borderRadius + "px";
  let style = "background-color:" + bg + ";border-radius:" + r + ";padding:1px 4px";
  style += ";color:" + (textColor || "inherit");
  return style;
}

function previewHTML(hex, textColor) {
  return 'The quick brown fox <mark style="' + markStyle(hex, textColor) + '">jumps over the lazy dog</mark> in the sun.';
}

function save() {
  chrome.storage.local.set({ _wh_settings: settings }, () => { toast("Settings saved"); });
}

function sanitizeShortcuts() {
  const cs = settings.colorShortcuts;
  for (const [key, combo] of Object.entries(cs)) {
    const parts = combo.split("+");
    const lastKey = parts[parts.length - 1];
    if (lastKey.length === 1 && lastKey.charCodeAt(0) > 127) {
      cs[key] = DEFAULTS.colorShortcuts[key] || "Alt+" + (parseInt(key) + 1);
    }
  }
}

function load(callback) {
  chrome.storage.local.get("_wh_settings", (result) => {
    settings = { ...DEFAULTS, ...(result._wh_settings || {}) };
    settings.colorShortcuts = { ...DEFAULTS.colorShortcuts, ...(settings.colorShortcuts || {}) };
    settings.customColors = settings.customColors || [];
    settings.textColors = settings.textColors || {};
    settings.iconColor = settings.iconColor || "yellow";
    sanitizeShortcuts();
    callback();
  });
}

// --- Theme toggle ---

function applyTheme() {
  const theme = settings.theme || "system";
  document.body.classList.remove("light", "dark");
  if (theme === "light") document.body.classList.add("light");
  else if (theme === "dark") document.body.classList.add("dark");
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  const current = settings.theme || "system";
  const isSystemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const effectiveDark = current === "dark" || (current === "system" && !isSystemLight);
  settings.theme = effectiveDark ? "light" : "dark";
  applyTheme();
  save();
});

// --- Icon picker ---

function renderIconPicker() {
  const container = document.getElementById("icon-picker");
  container.innerHTML = "";

  ICON_COLORS.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "icon-option" + (settings.iconColor === color ? " selected" : "");
    btn.title = color;
    const img = document.createElement("img");
    img.src = "../icons/options/" + color + "_128.png";
    img.alt = color;
    btn.appendChild(img);
    btn.addEventListener("click", () => {
      settings.iconColor = color;
      save();
      applyIcon(color);
      renderIconPicker();
    });
    container.appendChild(btn);
  });
}

function applyIcon(color) {
  chrome.runtime.sendMessage({ action: "set-icon", color: color });
  const favicon = document.getElementById("favicon");
  if (favicon) favicon.href = "../icons/options/" + color + "_128.png";
}

// --- Color hex update ---

function updateColorHex(index, isCustom, name, newHex) {
  const presetCount = PRESET_COLORS.length;
  if (isCustom) {
    settings.customColors[index - presetCount].hex = newHex;
  } else {
    if (!settings.presetOverrides) settings.presetOverrides = {};
    settings.presetOverrides[name] = newHex;
  }
  save();
  renderColorRows();
}

function rebuildColorShortcuts() {
  const colors = allColors();
  const newMap = {};
  colors.forEach((_, i) => {
    newMap[String(i)] = settings.colorShortcuts[String(i)] || "Alt+" + (i + 1);
  });
  settings.colorShortcuts = newMap;
}

// --- Shortcut formatting ---

function formatShortcut(combo) {
  return combo.split("+").map((k) => {
    if (k === "Alt") return "⌥";
    if (k === "Meta") return "⌘";
    if (k === "Ctrl") return "Ctrl";
    if (k === "Shift") return "⇧";
    return k;
  }).join(" + ");
}

// --- Shortcut recorder ---

function recordShortcut(btn, onRecord) {
  btn.textContent = "Press keys...";
  btn.classList.add("recording");
  function onKey(e) {
    e.preventDefault();
    e.stopPropagation();
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    let keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (e.code.startsWith("Digit")) keyName = e.code.slice(5);
    else if (e.code.startsWith("Key")) keyName = e.code.slice(3);
    parts.push(keyName);
    const combo = parts.join("+");
    btn.textContent = formatShortcut(combo);
    btn.classList.remove("recording");
    document.removeEventListener("keydown", onKey, true);
    onRecord(combo);
  }
  document.addEventListener("keydown", onKey, true);
}

// --- Render color rows ---

function renderColorRows() {
  const container = document.getElementById("color-rows");
  container.innerHTML = "";

  allColors().forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "color-row";

    // Highlighter swatch
    const swatchWrap = document.createElement("label");
    swatchWrap.className = "color-swatch-wrap";
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    swatch.style.background = c.hex;
    swatch.title = "Click to change color";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "color-swatch-picker";
    picker.value = c.hex;
    picker.addEventListener("input", () => { swatch.style.background = picker.value; });
    picker.addEventListener("change", () => { updateColorHex(i, c.removable, c.name, picker.value); });
    swatchWrap.appendChild(swatch);
    swatchWrap.appendChild(picker);

    // Text color swatch
    const textSwatchWrap = document.createElement("label");
    textSwatchWrap.className = "color-swatch-wrap text-swatch-wrap";
    const textSwatch = document.createElement("div");
    textSwatch.className = "color-swatch text-swatch";
    const currentTextColor = settings.textColors[String(i)] || "";
    if (currentTextColor) {
      textSwatch.style.background = currentTextColor;
      textSwatch.classList.remove("empty");
    } else {
      textSwatch.classList.add("empty");
    }
    textSwatch.title = currentTextColor ? "Text color: " + currentTextColor + " (click to change, right-click to clear)" : "No text color (click to set)";
    const textPicker = document.createElement("input");
    textPicker.type = "color";
    textPicker.className = "color-swatch-picker";
    textPicker.value = currentTextColor || "#333333";
    textPicker.addEventListener("change", () => {
      settings.textColors[String(i)] = textPicker.value;
      save();
      renderColorRows();
    });
    textSwatchWrap.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      delete settings.textColors[String(i)];
      save();
      renderColorRows();
    });
    textSwatchWrap.appendChild(textSwatch);
    textSwatchWrap.appendChild(textPicker);

    // Light preview
    const textColor = settings.textColors[String(i)] || "";
    const lightPrev = document.createElement("div");
    lightPrev.className = "row-preview row-preview-light";
    lightPrev.innerHTML = previewHTML(c.hex, textColor);

    // Dark preview
    const darkPrev = document.createElement("div");
    darkPrev.className = "row-preview row-preview-dark";
    darkPrev.innerHTML = previewHTML(c.hex, textColor);

    // Shortcut button
    const btn = document.createElement("button");
    btn.className = "shortcut-key";
    btn.title = "Click to change shortcut";
    const combo = settings.colorShortcuts[String(i)] || "";
    btn.textContent = combo ? formatShortcut(combo) : "Not set";
    btn.addEventListener("click", () => {
      recordShortcut(btn, (newCombo) => {
        settings.colorShortcuts[String(i)] = newCombo;
        save();
      });
    });

    row.appendChild(swatchWrap);
    row.appendChild(textSwatchWrap);
    row.appendChild(lightPrev);
    row.appendChild(darkPrev);
    row.appendChild(btn);

    if (c.removable) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "color-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove color";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settings.customColors = settings.customColors.filter((cc) => cc.name !== c.name);
        rebuildColorShortcuts();
        save();
        renderColorRows();
      });
      row.appendChild(removeBtn);
    }

    container.appendChild(row);
  });

  // Add color row
  const addRow = document.createElement("div");
  addRow.className = "color-row add-color-row";

  const addSwatchWrap = document.createElement("label");
  addSwatchWrap.className = "color-swatch-wrap";
  const addSwatch = document.createElement("div");
  addSwatch.className = "color-swatch";
  const addPicker = document.createElement("input");
  addPicker.type = "color";
  addPicker.id = "new-color-input";
  addPicker.className = "color-swatch-picker";
  addPicker.value = "#999999";
  addSwatch.style.background = addPicker.value;
  addSwatch.title = "Pick a color";
  addPicker.addEventListener("input", () => { addSwatch.style.background = addPicker.value; });
  addSwatchWrap.appendChild(addSwatch);
  addSwatchWrap.appendChild(addPicker);

  // Text color swatch for new color
  let addTextColor = "";
  const addTextSwatchWrap = document.createElement("label");
  addTextSwatchWrap.className = "color-swatch-wrap text-swatch-wrap";
  const addTextSwatch = document.createElement("div");
  addTextSwatch.className = "color-swatch text-swatch empty";
  addTextSwatch.title = "No text color (click to set)";
  const addTextPicker = document.createElement("input");
  addTextPicker.type = "color";
  addTextPicker.className = "color-swatch-picker";
  addTextPicker.value = "#333333";
  addTextPicker.addEventListener("change", () => {
    addTextColor = addTextPicker.value;
    addTextSwatch.style.background = addTextColor;
    addTextSwatch.classList.remove("empty");
    addLightPrev.innerHTML = previewHTML(addPicker.value, addTextColor);
    addDarkPrev.innerHTML = previewHTML(addPicker.value, addTextColor);
  });
  addTextSwatchWrap.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    addTextColor = "";
    addTextSwatch.style.background = "";
    addTextSwatch.classList.add("empty");
    addLightPrev.innerHTML = previewHTML(addPicker.value, "");
    addDarkPrev.innerHTML = previewHTML(addPicker.value, "");
  });
  addTextSwatchWrap.appendChild(addTextSwatch);
  addTextSwatchWrap.appendChild(addTextPicker);

  const addLightPrev = document.createElement("div");
  addLightPrev.className = "row-preview row-preview-light";
  addLightPrev.innerHTML = previewHTML("#999999", "");

  const addDarkPrev = document.createElement("div");
  addDarkPrev.className = "row-preview row-preview-dark";
  addDarkPrev.innerHTML = previewHTML("#999999", "");

  addPicker.addEventListener("input", () => {
    addLightPrev.innerHTML = previewHTML(addPicker.value, addTextColor);
    addDarkPrev.innerHTML = previewHTML(addPicker.value, addTextColor);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-small add-color-btn";
  addBtn.textContent = "Add Color";
  addBtn.addEventListener("click", () => {
    const hex = addPicker.value;
    const name = hex;
    const existing = allColors().find((c) => c.name === name);
    if (existing) { toast("A color with that name already exists"); return; }
    settings.customColors.push({ name, hex });
    const newIndex = allColors().length - 1;
    settings.colorShortcuts[String(newIndex)] = "Alt+" + (newIndex + 1);
    if (addTextColor) settings.textColors[String(newIndex)] = addTextColor;
    save();
    renderColorRows();
  });

  addRow.appendChild(addSwatchWrap);
  addRow.appendChild(addTextSwatchWrap);
  addRow.appendChild(addLightPrev);
  addRow.appendChild(addDarkPrev);
  addRow.appendChild(addBtn);
  container.appendChild(addRow);
}

// --- Style controls ---

function updatePreviews() {
  const previews = document.querySelectorAll(".row-preview");
  const colors = allColors();
  let colorIndex = 0;
  for (let i = 0; i < previews.length; i += 2) {
    const c = colors[colorIndex] || { hex: document.getElementById("new-color-input")?.value || "#999999" };
    const textColor = settings.textColors[String(colorIndex)] || "";
    previews[i].innerHTML = previewHTML(c.hex, textColor);
    if (i + 1 < previews.length) previews[i + 1].innerHTML = previewHTML(c.hex, textColor);
    colorIndex++;
  }
}

function bindStyleControls() {
  const opacityInput = document.getElementById("opacity");
  const opacityLabel = document.getElementById("opacity-value");
  opacityInput.value = settings.opacity;
  opacityLabel.textContent = settings.opacity + "%";
  opacityInput.addEventListener("input", () => {
    settings.opacity = parseInt(opacityInput.value);
    opacityLabel.textContent = settings.opacity + "%";
    updatePreviews();
  });
  opacityInput.addEventListener("change", save);

  const radiusInput = document.getElementById("border-radius");
  const radiusLabel = document.getElementById("border-radius-value");
  radiusInput.value = settings.borderRadius;
  radiusLabel.textContent = settings.borderRadius + "px";
  radiusInput.addEventListener("input", () => {
    settings.borderRadius = parseInt(radiusInput.value);
    radiusLabel.textContent = settings.borderRadius + "px";
    updatePreviews();
  });
  radiusInput.addEventListener("change", save);
}

// --- Reset to default ---

document.getElementById("reset-colors-btn").addEventListener("click", () => {
  if (!confirm("Reset all colors, text colors, and shortcuts to defaults?")) return;
  settings.customColors = [];
  settings.presetOverrides = {};
  settings.colorShortcuts = { ...DEFAULTS.colorShortcuts };
  settings.textColors = {};
  save();
  renderColorRows();
});

// --- Export/Import settings ---

document.getElementById("export-settings-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "web-highlighter-settings.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Settings exported");
});

const importSettingsFile = document.getElementById("import-settings-file");
document.getElementById("import-settings-btn").addEventListener("click", () => { importSettingsFile.click(); });
importSettingsFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      settings = { ...DEFAULTS, ...imported };
      settings.colorShortcuts = { ...DEFAULTS.colorShortcuts, ...(settings.colorShortcuts || {}) };
      settings.customColors = settings.customColors || [];
      settings.textColors = settings.textColors || {};
      save();
      renderColorRows();
      renderIconPicker();
      applyIcon(settings.iconColor);
      bindStyleControls();
      toast("Settings imported");
    } catch {
      toast("Invalid settings file");
    }
  };
  reader.readAsText(file);
  importSettingsFile.value = "";
});

// --- Tab navigation ---

function switchTab(tabName) {
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const navItem = document.querySelector('.nav-item[data-tab="' + tabName + '"]');
  if (navItem) navItem.classList.add("active");
  document.getElementById("tab-" + tabName).classList.add("active");
  if (tabName === "highlights") renderHighlights();
  location.hash = tabName;
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => switchTab(item.dataset.tab));
});

// --- Highlights tab ---

let highlightsCache = null;

function loadHighlightsCache(callback) {
  chrome.storage.local.get(null, (data) => {
    highlightsCache = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_wh_")) continue;
      if (Array.isArray(value) && value.length > 0) {
        highlightsCache[key] = value;
      }
    }
    callback();
  });
}

function renderHighlights(forceReload) {
  const doRender = () => {
    const listEl = document.getElementById("highlights-list");
    const emptyEl = document.getElementById("highlights-empty");
    const statsEl = document.getElementById("highlights-stats");
    const searchQuery = (document.getElementById("highlights-search").value || "").toLowerCase().trim();
    listEl.innerHTML = "";

    const pages = highlightsCache || {};
    let totalHighlights = 0;

    for (const value of Object.values(pages)) {
      totalHighlights += value.length;
    }

    const pageCount = Object.keys(pages).length;
    statsEl.innerHTML =
      "<span>" + pageCount + "</span> page" + (pageCount !== 1 ? "s" : "") +
      " &middot; <span>" + totalHighlights + "</span> highlight" + (totalHighlights !== 1 ? "s" : "");

    if (totalHighlights === 0) {
      emptyEl.classList.remove("hidden");
      document.getElementById("clear-all-btn").style.display = "none";
      return;
    }

    emptyEl.classList.add("hidden");
    document.getElementById("clear-all-btn").style.display = "";

    let anyVisible = false;

    for (const [url, highlights] of Object.entries(pages)) {
      const filtered = searchQuery
        ? highlights.filter((h) =>
            h.text.toLowerCase().includes(searchQuery) ||
            (h.note && h.note.toLowerCase().includes(searchQuery)) ||
            url.toLowerCase().includes(searchQuery)
          )
        : highlights;

      if (filtered.length === 0) continue;
      anyVisible = true;

      const group = document.createElement("div");
      group.className = "page-group";

      const header = document.createElement("div");
      header.className = "page-group-header";
      const link = document.createElement("a");
      link.href = url;
      const pageTitle = filtered.find((h) => h.title)?.title;
      link.textContent = pageTitle || url;
      if (pageTitle) link.title = url;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: url });
      });
      header.appendChild(link);

      const removePageBtn = document.createElement("button");
      removePageBtn.className = "highlight-remove page-remove";
      removePageBtn.textContent = "×";
      removePageBtn.title = "Remove all highlights on this page";
      removePageBtn.addEventListener("click", () => {
        chrome.storage.local.remove(url, () => {
          toast("All highlights removed for this page");
          renderHighlights();
        });
      });
      header.appendChild(removePageBtn);
      group.appendChild(header);

      filtered.forEach((h) => {
        const item = document.createElement("div");
        item.className = "highlight-item";

        const dot = document.createElement("div");
        dot.className = "highlight-color-dot";
        const rgbaMatch = h.color && h.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        dot.style.background = rgbaMatch
          ? "rgb(" + rgbaMatch[1] + "," + rgbaMatch[2] + "," + rgbaMatch[3] + ")"
          : h.color;

        const textCol = document.createElement("div");
        textCol.className = "highlight-text-col";

        const textLink = document.createElement("a");
        textLink.className = "highlight-text";
        textLink.href = url + "#wh-scroll=" + h.id;
        textLink.textContent = h.text;
        textLink.addEventListener("click", (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: url + "#wh-scroll=" + h.id });
        });
        textCol.appendChild(textLink);

        if (h.note) {
          const noteEl = document.createElement("div");
          noteEl.className = "highlight-note";
          noteEl.textContent = h.note;
          textCol.appendChild(noteEl);
        }

        const removeBtn = document.createElement("button");
        removeBtn.className = "highlight-remove";
        removeBtn.textContent = "×";
        removeBtn.title = "Remove highlight";
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const updated = highlights.filter((x) => x.id !== h.id);
          if (updated.length === 0) {
            chrome.storage.local.remove(url, () => renderHighlights());
          } else {
            chrome.storage.local.set({ [url]: updated }, () => renderHighlights());
          }
          toast("Highlight removed");
        });

        item.appendChild(dot);
        item.appendChild(textCol);
        item.appendChild(removeBtn);
        group.appendChild(item);
      });

      listEl.appendChild(group);
    }

    if (!anyVisible && searchQuery) {
      emptyEl.textContent = "No highlights match your search.";
      emptyEl.classList.remove("hidden");
    } else if (!anyVisible) {
      emptyEl.textContent = "No highlights saved yet.";
      emptyEl.classList.remove("hidden");
    }
  };

  if (forceReload !== false || !highlightsCache) {
    loadHighlightsCache(doRender);
  } else {
    doRender();
  }
}

document.getElementById("clear-all-btn").addEventListener("click", () => {
  if (!confirm("Delete all highlights from every page? This cannot be undone.")) return;
  chrome.storage.local.get(null, (data) => {
    const keysToRemove = Object.keys(data).filter((k) => !k.startsWith("_wh_"));
    chrome.storage.local.remove(keysToRemove, () => {
      toast("All highlights cleared");
      renderHighlights();
    });
  });
});

// --- Init ---

function bindToggles() {
  const toolbarToggle = document.getElementById("toggle-toolbar");
  toolbarToggle.checked = settings.showToolbar !== false;
  toolbarToggle.addEventListener("change", () => {
    settings.showToolbar = toolbarToggle.checked;
    save();
  });

  const notesToggle = document.getElementById("toggle-notes");
  notesToggle.checked = settings.showNotes !== false;
  notesToggle.addEventListener("change", () => {
    settings.showNotes = notesToggle.checked;
    save();
  });
}

load(() => {
  applyTheme();
  renderIconPicker();
  applyIcon(settings.iconColor);
  renderColorRows();
  bindStyleControls();
  bindToggles();
  document.getElementById("highlights-search").addEventListener("input", () => { renderHighlights(false); });
  const hashTab = location.hash.slice(1);
  if (hashTab && document.getElementById("tab-" + hashTab)) switchTab(hashTab);
});
