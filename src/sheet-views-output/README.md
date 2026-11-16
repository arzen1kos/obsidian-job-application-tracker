# Sheet Views

A simple Excel-like sheet for Obsidian. Each sheet is a `.osheet` file (plain JSON) in your vault.

## Install (manual)

1. Copy this folder into `<your vault>/.obsidian/plugins/sheet-views/`. It needs `main.js`, `manifest.json` and `styles.css`.
2. In Obsidian: Settings, Community plugins, turn off Restricted mode, then enable **Sheet Views**.
3. Create a sheet with the table icon in the left ribbon, the command **Create new sheet**, or right-click a folder and choose **New sheet**.

There is no build step. The plugin is plain JavaScript.

## Column types

| Type | Behaviour |
| --- | --- |
| Text | Free text. |
| Obsidian link | Pick a note or canvas from the vault. Click to open in a new tab, Ctrl/Cmd-click to open in a split. |
| List (multiple) | Several values chosen from the column's options. New options can be added while picking. |
| List (single) | One value from a dropdown. Choose "+ New option…" to add one. |
| Date | Date picker, stored as `YYYY-MM-DD`. |

Click a column header to rename it, change its type, sort, filter, edit options, move it or delete it. Changing a type converts the existing values where it can. Values that cannot be converted are cleared and you get a notice.

## Views

All four views share the same filters and sorting. The view, filters and sort are saved in the file.

- **Table**: the default. Edit cells in place. Hover a row number for open and delete buttons.
- **Gallery**: one card per row. Click a card to edit it. The first column is the card title.
- **Kanban**: grouped by a List (single) column. Drag cards between groups (desktop). On any device you can click a card and change its value instead.
- **Calendar**: rows placed by a Date column. Use the `+` on a day to add a row on that date. Rows with no date are listed under the grid. The first day of the week is a setting.

## Obsidian links and renames

Link cells store the note's **vault path** (for example `Projects/Plan.md`), not just its name. Two notes with the same name in different folders therefore never get mixed up. When you rename or move a note, the plugin updates link cells in every `.osheet` file in the vault.

## File format

```json
{
  "version": 1,
  "columns": [{ "id": "a1", "name": "Status", "type": "select", "options": ["To do", "Done"] }],
  "rows": [{ "id": "r1", "cells": { "a1": "To do" } }],
  "view": { "type": "table", "filters": [], "sort": null, "kanbanCol": "a1", "calendarCol": null }
}
```

## Not included yet

Formulas, column resizing, multi-column sorting, OR filters, and links that jump to a specific spot on a canvas.
