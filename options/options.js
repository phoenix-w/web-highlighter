const PRESET_COLORS = [
  { name: "red",    hex: "#f4a0a0", removable: false },
  { name: "orange", hex: "#f5c48a", removable: false },
  { name: "yellow", hex: "#f5e68a", removable: false },
  { name: "green",  hex: "#a8dba8", removable: false },
  { name: "blue",   hex: "#a0c4f4", removable: false },
  { name: "purple", hex: "#c8a8e8", removable: false },
];

const DEFAULTS = {
  opacity: 50,
  borderRadius: 2,
  customColors: [],
  colorShortcuts: {
    0: "Alt+1",
    1: "Alt+2",
    2: "Alt+3",
    3: "Alt+4",
    4: "Alt+5",
    5: "Alt+6",
  },
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
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function colorWithOpacity(hex, opacity) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

function allColors() {
  const overrides = settings.presetOverrides || {};
  const presets = PRESET_COLORS.map((c) => ({
    ...c,
    hex: overrides[c.name] || c.hex,
  }));
  return [
    ...presets,
    ...(settings.customColors || []).map((c) => ({ ...c, removable: true })),
  ];
}

function markStyle(hex) {
  const bg = colorWithOpacity(hex, settings.opacity);
  const r = settings.borderRadius + "px";
  return "background-color:" + bg + ";border-radius:" + r + ";padding:1px 4px";
}

function previewHTML(hex) {
  return 'The quick brown fox <mark style="' + markStyle(hex) + '">jumps over the lazy dog</mark> in the sun.';
}

function save() {
  chrome.storage.local.set({ _wh_settings: settings }, () => {
    toast("Settings saved");
  });
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
  return combo
    .split("+")
    .map((k) => {
      if (k === "Alt") return "⌥";
      if (k === "Meta") return "⌘";
      if (k === "Ctrl") return "Ctrl";
      if (k === "Shift") return "⇧";
      return k;
    })
    .join(" + ");
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

// --- Render all color rows + add row ---

function renderColorRows() {
  const container = document.getElementById("color-rows");
  container.innerHTML = "";

  allColors().forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "color-row";

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

    const lightPrev = document.createElement("div");
    lightPrev.className = "row-preview row-preview-light";
    lightPrev.innerHTML = previewHTML(c.hex);

    const darkPrev = document.createElement("div");
    darkPrev.className = "row-preview row-preview-dark";
    darkPrev.innerHTML = previewHTML(c.hex);

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

  const addLightPrev = document.createElement("div");
  addLightPrev.className = "row-preview row-preview-light";
  addLightPrev.innerHTML = previewHTML("#999999");

  const addDarkPrev = document.createElement("div");
  addDarkPrev.className = "row-preview row-preview-dark";
  addDarkPrev.innerHTML = previewHTML("#999999");

  addPicker.addEventListener("input", () => {
    addLightPrev.innerHTML = previewHTML(addPicker.value);
    addDarkPrev.innerHTML = previewHTML(addPicker.value);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-small add-color-btn";
  addBtn.textContent = "Add Color";
  addBtn.addEventListener("click", () => {
    const hex = addPicker.value;
    const name = hex;
    const existing = allColors().find((c) => c.name === name);
    if (existing) {
      toast("A color with that name already exists");
      return;
    }
    settings.customColors.push({ name, hex });
    const newIndex = allColors().length - 1;
    settings.colorShortcuts[String(newIndex)] = "Alt+" + (newIndex + 1);
    save();
    renderColorRows();
  });

  addRow.appendChild(addSwatchWrap);
  addRow.appendChild(addLightPrev);
  addRow.appendChild(addDarkPrev);
  addRow.appendChild(addBtn);
  container.appendChild(addRow);
}

// --- Style controls ---

function bindStyleControls() {
  const opacityInput = document.getElementById("opacity");
  const opacityLabel = document.getElementById("opacity-value");
  opacityInput.value = settings.opacity;
  opacityLabel.textContent = settings.opacity + "%";
  opacityInput.addEventListener("input", () => {
    settings.opacity = parseInt(opacityInput.value);
    opacityLabel.textContent = settings.opacity + "%";
    renderColorRows();
  });
  opacityInput.addEventListener("change", save);

  const radiusInput = document.getElementById("border-radius");
  const radiusLabel = document.getElementById("border-radius-value");
  radiusInput.value = settings.borderRadius;
  radiusLabel.textContent = settings.borderRadius + "px";
  radiusInput.addEventListener("input", () => {
    settings.borderRadius = parseInt(radiusInput.value);
    radiusLabel.textContent = settings.borderRadius + "px";
    renderColorRows();
  });
  radiusInput.addEventListener("change", save);
}

// --- Reset to default ---

document.getElementById("reset-colors-btn").addEventListener("click", () => {
  if (!confirm("Reset all colors and shortcuts to defaults?")) return;
  settings.customColors = [];
  settings.presetOverrides = {};
  settings.colorShortcuts = { ...DEFAULTS.colorShortcuts };
  save();
  renderColorRows();
});

// --- Tab navigation ---

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    item.classList.add("active");
    document.getElementById("tab-" + item.dataset.tab).classList.add("active");
    if (item.dataset.tab === "highlights") renderHighlights();
  });
});

// --- Highlights tab ---

function renderHighlights() {
  chrome.storage.local.get(null, (data) => {
    const listEl = document.getElementById("highlights-list");
    const emptyEl = document.getElementById("highlights-empty");
    const statsEl = document.getElementById("highlights-stats");
    listEl.innerHTML = "";

    const pages = {};
    let totalHighlights = 0;

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_wh_")) continue;
      if (Array.isArray(value) && value.length > 0) {
        pages[key] = value;
        totalHighlights += value.length;
      }
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

    for (const [url, highlights] of Object.entries(pages)) {
      const group = document.createElement("div");
      group.className = "page-group";

      const header = document.createElement("div");
      header.className = "page-group-header";
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.textContent = url;
      header.appendChild(link);
      group.appendChild(header);

      highlights.forEach((h) => {
        const item = document.createElement("div");
        item.className = "highlight-item";

        const dot = document.createElement("div");
        dot.className = "highlight-color-dot";
        const rgbaMatch = h.color && h.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        dot.style.background = rgbaMatch
          ? "rgb(" + rgbaMatch[1] + "," + rgbaMatch[2] + "," + rgbaMatch[3] + ")"
          : h.color;

        const text = document.createElement("div");
        text.className = "highlight-text";
        text.textContent = h.text;

        const removeBtn = document.createElement("button");
        removeBtn.className = "highlight-remove";
        removeBtn.textContent = "×";
        removeBtn.title = "Remove highlight";
        removeBtn.addEventListener("click", () => {
          const updated = highlights.filter((x) => x.id !== h.id);
          if (updated.length === 0) {
            chrome.storage.local.remove(url, () => renderHighlights());
          } else {
            chrome.storage.local.set({ [url]: updated }, () => renderHighlights());
          }
          toast("Highlight removed");
        });

        item.appendChild(dot);
        item.appendChild(text);
        item.appendChild(removeBtn);
        group.appendChild(item);
      });

      listEl.appendChild(group);
    }
  });
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

load(() => {
  applyTheme();
  renderColorRows();
  bindStyleControls();
});
