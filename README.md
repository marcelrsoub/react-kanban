# React Kanban for Obsidian

React Kanban is an Obsidian plugin that opens markdown-based kanban notes in a modern React board UI. It uses the same `kanban-plugin: board` frontmatter marker as the existing Obsidian kanban format, so the same notes can be viewed here without changing their structure.

## Features

- Auto-opens kanban notes in a dedicated board view
- Drag cards within and between columns
- Reorder columns from the column menu
- Rename columns inline
- Add cards with a dialog
- Render markdown inside cards
- Mark cards complete and keep completed cards grouped at the bottom of each column
- Delete cards from the right-click menu

## Markdown Format

The plugin understands standard heading-based kanban notes:

```md
---
kanban-plugin: board
---

## To Do
- First task
- Second task

## Doing
- Work in progress

## Done
- Shipped item
```

## Installation

This plugin is intended to be installed from the Obsidian community plugin browser once published.

For local development, copy the built files into your vault plugin folder:

```bash
npm install
npm run build
```

## Development

- `npm run typecheck`
- `npm run build`

## Privacy

This plugin does not send analytics, telemetry, or network requests of its own. It reads and writes the current note through Obsidian’s local vault APIs only.

## License

MIT
