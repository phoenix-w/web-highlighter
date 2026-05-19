(() => {
  const PRESET_COLORS = [
    { name: "red",    hex: "#f0a0a8" },
    { name: "orange", hex: "#f5c48a" },
    { name: "yellow", hex: "#f5e68a" },
    { name: "green",  hex: "#a8dba8" },
    { name: "blue",   hex: "#a0c4f4" },
    { name: "purple", hex: "#c8a8e8" },
  ];

  const DEFAULTS = {
    opacity: 50,
    borderRadius: 2,
    showToolbar: true,
    customColors: [],
    colorShortcuts: {
      0: "Alt+1", 1: "Alt+2", 2: "Alt+3",
      3: "Alt+4", 4: "Alt+5", 5: "Alt+6",
    },
    textColors: {},
  };

  let settings = { ...DEFAULTS };
  let toolbar = null;
  let storageQueue = Promise.resolve();

  function withPageHighlights(fn) {
    storageQueue = storageQueue.then(() => new Promise((resolve) => {
      chrome.storage.local.get(pageKey(), (result) => {
        const highlights = result[pageKey()] || [];
        const updated = fn(highlights);
        if (updated !== undefined) {
          chrome.storage.local.set({ [pageKey()]: updated }, resolve);
        } else {
          resolve();
        }
      });
    }));
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
    return [...presets, ...(settings.customColors || [])];
  }

  function allColorValues() {
    return allColors().map((c) => ({ name: c.name, bg: colorWithOpacity(c.hex, settings.opacity) }));
  }

  function colorValueByIndex(index) {
    const colors = allColors();
    if (index < 0 || index >= colors.length) return null;
    const textColors = settings.textColors || {};
    return { bg: colorWithOpacity(colors[index].hex, settings.opacity), textColor: textColors[String(index)] || null };
  }

  function pageKey() {
    return location.origin + location.pathname;
  }

  function loadSettings(callback) {
    chrome.storage.local.get("_wh_settings", (result) => {
      settings = { ...DEFAULTS, ...(result._wh_settings || {}) };
      settings.colorShortcuts = { ...DEFAULTS.colorShortcuts, ...(settings.colorShortcuts || {}) };
      settings.customColors = settings.customColors || [];
      settings.textColors = settings.textColors || {};
      callback();
    });
  }

  // --- Range serialization ---

  function getXPath(node) {
    if (node.nodeType === Node.TEXT_NODE) return getXPath(node.parentNode) + "/text()[" + textNodeIndex(node) + "]";
    if (node === document.body) return "/html/body";
    if (!node.parentNode) return "";
    const siblings = Array.from(node.parentNode.children).filter((s) => s.nodeName === node.nodeName);
    const idx = siblings.indexOf(node) + 1;
    return getXPath(node.parentNode) + "/" + node.nodeName.toLowerCase() + (siblings.length > 1 ? "[" + idx + "]" : "");
  }

  function textNodeIndex(textNode) {
    let idx = 0;
    let node = textNode.parentNode.firstChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) idx++;
      if (node === textNode) return idx;
      node = node.nextSibling;
    }
    return idx;
  }

  function resolveXPath(xpath) {
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch { return null; }
  }

  function serializeRange(range) {
    return {
      startXPath: getXPath(range.startContainer), startOffset: range.startOffset,
      endXPath: getXPath(range.endContainer), endOffset: range.endOffset,
    };
  }

  function deserializeRange(data) {
    const startNode = resolveXPath(data.startXPath);
    const endNode = resolveXPath(data.endXPath);
    if (!startNode || !endNode) return null;
    try {
      const range = document.createRange();
      range.setStart(startNode, Math.min(data.startOffset, startNode.length || 0));
      range.setEnd(endNode, Math.min(data.endOffset, endNode.length || 0));
      return range;
    } catch { return null; }
  }

  // --- Highlight application ---

  function getTextNodesInRange(range) {
    const nodes = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const r = document.createRange();
        r.selectNodeContents(node);
        if (r.compareBoundaryPoints(Range.END_TO_START, range) >= 0) return NodeFilter.FILTER_REJECT;
        if (r.compareBoundaryPoints(Range.START_TO_END, range) <= 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (range.startContainer.nodeType === Node.TEXT_NODE && !nodes.includes(range.startContainer)) nodes.unshift(range.startContainer);
    if (range.endContainer.nodeType === Node.TEXT_NODE && !nodes.includes(range.endContainer)) nodes.push(range.endContainer);
    return nodes;
  }

  function wrapTextNode(textNode, range, bg, id, textColor) {
    const mark = document.createElement("mark");
    mark.className = "web-highlighter";
    mark.dataset.highlightId = id;
    mark.style.setProperty("--wh-bg", bg);
    if (textColor) mark.style.setProperty("--wh-color", textColor);
    mark.style.borderRadius = settings.borderRadius + "px";
    const nodeRange = document.createRange();
    nodeRange.setStart(textNode, textNode === range.startContainer ? range.startOffset : 0);
    nodeRange.setEnd(textNode, textNode === range.endContainer ? range.endOffset : textNode.length);
    nodeRange.surroundContents(mark);
    mark.addEventListener("click", (e) => { e.stopPropagation(); showToolbar(e.clientX, e.clientY, mark); });
    return mark;
  }

  function applyHighlight(range, bg, id, textColor) {
    const textNodes = getTextNodesInRange(range);
    if (textNodes.length <= 1) {
      const mark = document.createElement("mark");
      mark.className = "web-highlighter";
      mark.dataset.highlightId = id;
      mark.style.setProperty("--wh-bg", bg);
      if (textColor) mark.style.setProperty("--wh-color", textColor);
      mark.style.borderRadius = settings.borderRadius + "px";
      try { range.surroundContents(mark); } catch { return null; }
      mark.addEventListener("click", (e) => { e.stopPropagation(); showToolbar(e.clientX, e.clientY, mark); });
      return mark;
    }
    textNodes.forEach((node) => { if (node.textContent.trim()) wrapTextNode(node, range, bg, id, textColor); });
    return true;
  }

  function removeHighlight(mark) {
    const id = mark.dataset.highlightId;
    document.querySelectorAll(`mark.web-highlighter[data-highlight-id="${id}"]`).forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    withPageHighlights((highlights) => highlights.filter((h) => h.id !== id));
  }

  function undoLastHighlight() {
    withPageHighlights((highlights) => {
      if (highlights.length === 0) return;
      const last = highlights[highlights.length - 1];
      document.querySelectorAll(`mark.web-highlighter[data-highlight-id="${last.id}"]`).forEach((m) => {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
      return highlights.filter((h) => h.id !== last.id);
    });
  }

  // --- Floating toolbar ---

  function removeToolbar() {
    if (toolbar) { toolbar.remove(); toolbar = null; }
  }

  function showToolbar(x, y, existingMark) {
    removeToolbar();
    toolbar = document.createElement("div");
    toolbar.className = "web-highlighter-toolbar";

    const colorsRow = document.createElement("div");
    colorsRow.className = "wh-toolbar-colors";

    allColorValues().forEach((c) => {
      const btn = document.createElement("button");
      btn.style.background = c.bg;
      btn.title = c.name;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (existingMark) {
          const id = existingMark.dataset.highlightId;
          document.querySelectorAll(`mark.web-highlighter[data-highlight-id="${id}"]`).forEach((m) => {
            m.style.setProperty("--wh-bg", c.bg);
          });
          updateStoredColor(id, c.bg);
        } else {
          highlightSelection(c.bg);
        }
        removeToolbar();
      });
      colorsRow.appendChild(btn);
    });

    if (existingMark) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "wh-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove highlight";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeHighlight(existingMark);
        removeToolbar();
      });
      colorsRow.appendChild(removeBtn);
    }

    toolbar.appendChild(colorsRow);

    // Note input for existing highlights
    if (existingMark) {
      const noteRow = document.createElement("div");
      noteRow.className = "wh-toolbar-note";
      const noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.className = "wh-note-input";
      noteInput.placeholder = "Add a note...";
      noteInput.addEventListener("click", (e) => e.stopPropagation());
      noteInput.addEventListener("mousedown", (e) => e.stopPropagation());

      const id = existingMark.dataset.highlightId;
      chrome.storage.local.get(pageKey(), (result) => {
        const h = (result[pageKey()] || []).find((h) => h.id === id);
        if (h && h.note && toolbar && toolbar.contains(noteInput)) noteInput.value = h.note;
      });

      noteInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          updateStoredNote(id, noteInput.value.trim());
          removeToolbar();
        }
      });

      noteInput.addEventListener("blur", () => {
        updateStoredNote(id, noteInput.value.trim());
      });

      noteRow.appendChild(noteInput);
      toolbar.appendChild(noteRow);
    }

    toolbar.style.left = Math.min(x, window.innerWidth - 220) + "px";
    toolbar.style.top = Math.max(y - (existingMark ? 74 : 44), 4) + "px";
    document.body.appendChild(toolbar);

    if (existingMark) {
      const noteInput = toolbar.querySelector(".wh-note-input");
      if (noteInput) setTimeout(() => noteInput.focus(), 50);
    }
  }

  function updateStoredColor(id, bg) {
    withPageHighlights((highlights) => {
      const h = highlights.find((h) => h.id === id);
      if (h) { h.color = bg; return highlights; }
    });
  }

  function updateStoredNote(id, note) {
    withPageHighlights((highlights) => {
      const h = highlights.find((h) => h.id === id);
      if (h) {
        if (note) h.note = note;
        else delete h.note;
        return highlights;
      }
    });
  }

  // --- Core highlight flow ---

  function highlightSelection(colorInput) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const serialized = serializeRange(range);

    let bg, textColor;
    if (typeof colorInput === "object" && colorInput !== null) {
      bg = colorInput.bg;
      textColor = colorInput.textColor || null;
    } else {
      bg = colorInput || colorValueByIndex(0).bg;
      textColor = null;
    }

    applyHighlight(range, bg, id, textColor);
    selection.removeAllRanges();

    const entry = { id, text, color: bg, textColor, range: serialized, createdAt: Date.now() };
    withPageHighlights((highlights) => { highlights.push(entry); return highlights; });
  }

  // --- Restore ---

  function restoreHighlights() {
    chrome.storage.local.get(pageKey(), (result) => {
      (result[pageKey()] || []).forEach((h) => {
        const range = deserializeRange(h.range);
        if (range) applyHighlight(range, h.color, h.id, h.textColor);
      });
    });
  }

  // --- Keyboard shortcuts ---

  function codeToKey(code) {
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Key")) return code.slice(3);
    return null;
  }

  function matchesShortcut(e, combo) {
    const parts = combo.split("+");
    const key = parts[parts.length - 1];
    const eventKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const codeKey = codeToKey(e.code);
    return (
      (eventKey === key || (codeKey && codeKey === key)) &&
      e.ctrlKey === parts.includes("Ctrl") &&
      e.altKey === parts.includes("Alt") &&
      e.shiftKey === parts.includes("Shift") &&
      e.metaKey === parts.includes("Meta")
    );
  }

  document.addEventListener("keydown", (e) => {
    // Undo: Option + Z
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      const codeKey = codeToKey(e.code);
      if (codeKey === "Z" || e.key.toUpperCase() === "Z") {
        e.preventDefault();
        undoLastHighlight();
        return;
      }
    }

    const colorShortcuts = settings.colorShortcuts;
    for (const [indexStr, combo] of Object.entries(colorShortcuts)) {
      if (matchesShortcut(e, combo)) {
        e.preventDefault();
        const color = colorValueByIndex(parseInt(indexStr));
        if (color) highlightSelection(color);
        return;
      }
    }
  });

  // --- Event listeners ---

  document.addEventListener("mouseup", (e) => {
    if (toolbar && !toolbar.contains(e.target)) removeToolbar();
    if (!settings.showToolbar) return;
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        showToolbar(rect.left + rect.width / 2 - 70, rect.top + window.scrollY, null);
      }
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (toolbar && !toolbar.contains(e.target)) removeToolbar();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "highlight") highlightSelection(null);
    if (msg.action === "remove-highlight") {
      const mark = document.querySelector(`mark.web-highlighter[data-highlight-id="${msg.id}"]`);
      if (mark) removeHighlight(mark);
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes._wh_settings) {
      settings = { ...DEFAULTS, ...(changes._wh_settings.newValue || {}) };
      settings.colorShortcuts = { ...DEFAULTS.colorShortcuts, ...(settings.colorShortcuts || {}) };
      settings.customColors = settings.customColors || [];
      settings.textColors = settings.textColors || {};
    }
  });

  function scrollToHighlight() {
    const hash = location.hash;
    if (!hash.startsWith("#wh-scroll=")) return;
    const id = hash.slice("#wh-scroll=".length);
    const mark = document.querySelector(`mark.web-highlighter[data-highlight-id="${id}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    mark.style.outline = "2px solid #66b3ff";
    mark.style.outlineOffset = "2px";
    setTimeout(() => { mark.style.outline = ""; mark.style.outlineOffset = ""; }, 2000);
    history.replaceState(null, "", location.pathname + location.search);
  }

  loadSettings(() => {
    restoreHighlights();
    setTimeout(scrollToHighlight, 300);
  });
})();
