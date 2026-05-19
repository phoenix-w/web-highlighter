# Web Highlighter - Future Ideas

## Quick Wins
- **Highlight count badge** - Show the number of highlights on the current page as a badge on the toolbar icon. Gives a visual cue that the extension is active.
- **Onboarding tooltip** - First-time users won't know about ⌥+1-6. Show a one-time tooltip when the extension is installed: "Select text and press ⌥+1 through ⌥+6 to highlight."
- **Keyboard shortcut to remove** - A shortcut like ⌥+0 to clear the highlight under the cursor (or the most recently clicked one).
- **Page-level toggle** - Let users disable the extension on specific sites (e.g., Google Docs, where it might interfere).

## Medium Effort
- **Sync via `chrome.storage.sync`** - Highlights sync across devices automatically via the user's browser account. The 100KB limit means it only works for light usage, so you'd need a "sync enabled" toggle and graceful handling when the limit is hit.
- **Highlight sidebar on any page** - A small floating panel (toggled by clicking the extension icon) that shows all highlights on the current page, similar to the Saved Highlights tab but contextual.
- **Tags/folders** - Let users organize highlights by topic instead of just by page URL. Could be as simple as color-coded categories or free-form tags.
- **Bulk export highlights** - Export all highlights as a formatted document (Markdown, PDF, or plain text), grouped by page.

## Bigger Bets
- **Share a highlighted page** - Generate a link that, when opened by someone else with the extension, shows your highlights. Useful for collaborative reading.
- **AI summary** - Use an LLM API to summarize all highlights on a page or across pages. "What did I highlight this week?"
- **Highlight images/regions** - Let users draw a rectangle over part of a page (not just text) to highlight a visual area.
- **Browser history integration** - Show a timeline of highlights across all pages, sorted by date. "What was I reading on Tuesday?"