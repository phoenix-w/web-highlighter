# Web Highlighter - Tech Debt

## Known Issues

### XPath fragility on dynamic pages
Highlights are stored as XPath + character offsets. If the page DOM changes between saving and restoring (SPAs, lazy-loaded content, A/B tests), XPaths become invalid and highlights silently fail to restore. A more resilient approach would be text-based matching with surrounding context as a fallback.

### Duplicated color definitions
`PRESET_COLORS` is defined identically in both `content/content.js` and `options/options.js`. If one is updated without the other (e.g., changing a default hex), they'll go out of sync. Could be solved by putting shared constants in a separate file imported by both scripts.

### No error handling on storage operations
`chrome.storage.local` calls can fail (quota exceeded, corrupt data). Currently all operations assume success. Should add `.catch()` or check `chrome.runtime.lastError` for robustness.

### Content script loads on all pages
The content script runs on every page (`<all_urls>`) even if the user has zero highlights. For most pages this is a no-op (loads settings, queries storage, finds nothing), but it's unnecessary work. Could use `chrome.scripting.executeScript` on demand, or at minimum skip restore if the page has no stored highlights.

### Toolbar note input edge case
If the user opens the toolbar, starts typing a note, then the toolbar is dismissed by clicking elsewhere, the `blur` event fires and saves the note. But if the toolbar DOM is already removed before `blur` fires, the save still works (storage is independent of DOM), so this is safe - just slightly inelegant.

### No migration for stored data
When settings shape changes (e.g., adding `textColors`, `iconColor`), old stored data missing those fields relies on `|| {}` fallbacks. This works but is fragile. A versioned migration system would be cleaner for future changes.