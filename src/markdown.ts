import { KanbanBoard, KanbanColumn } from "./types";

const FRONTMATTER_DELIMITER = "---";

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTitle(text: string) {
  return text.replace(/^#+\s*/, "").trim();
}

function isListItem(line: string) {
  return /^\s*[-*+]\s+/.test(line);
}

function stripListMarker(line: string) {
  return line.replace(/^\s*[-*+]\s+/, "").trimEnd();
}

function parseCardMarker(line: string) {
  const match = /^\s*[-*+]\s+\[( |x|X)\]\s*(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    completed: match[1].toLowerCase() === "x",
    content: match[2]
  };
}

function indentCardContent(content: string) {
  const lines = content.split(/\r?\n/);
  return lines
    .map((line, index) => {
      if (index === 0) {
        return line;
      }
      return line.length === 0 ? "  " : `  ${line}`;
    })
    .join("\n")
    .trimEnd();
}

export function parseKanbanMarkdown(content: string): KanbanBoard | null {
  const lines = content.split(/\r?\n/);
  let index = 0;
  const frontmatter: string[] = [];

  if (lines[0]?.trim() === FRONTMATTER_DELIMITER) {
    frontmatter.push(lines[0]);
    index = 1;
    while (index < lines.length && lines[index].trim() !== FRONTMATTER_DELIMITER) {
      frontmatter.push(lines[index]);
      index += 1;
    }
    if (lines[index]?.trim() === FRONTMATTER_DELIMITER) {
      frontmatter.push(lines[index]);
      index += 1;
    }
  }

  if (!frontmatter.some((line) => line.trim() === "kanban-plugin: board")) {
    return null;
  }

  const columns: KanbanColumn[] = [];
  let currentColumn: KanbanColumn | null = null;
  let inCompletedSection = false;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = /^(#{2,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      currentColumn = {
        id: createId("column"),
        title: normalizeTitle(headingMatch[2]),
        cards: []
      };
      columns.push(currentColumn);
      inCompletedSection = false;
      continue;
    }

    if (currentColumn && /^-{3,}\s*$/.test(line.trim())) {
      inCompletedSection = true;
      continue;
    }

    if (!currentColumn || !isListItem(line)) {
      continue;
    }

    const contentLines = [stripListMarker(line)];
    const marker = parseCardMarker(line);
    if (marker) {
      contentLines[0] = marker.content;
    }

    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex];
      if (nextLine.trim() === "") {
        const following = lines[nextIndex + 1];
        if (!following || isListItem(following) || /^(#{2,6})\s+/.test(following)) {
          break;
        }
        contentLines.push("");
        nextIndex += 1;
        continue;
      }

      const continuationMatch = /^(?: {2}|\t)(.*)$/.exec(nextLine);
      if (!continuationMatch) {
        break;
      }

      contentLines.push(continuationMatch[1]);
      nextIndex += 1;
    }

    currentColumn.cards.push({
      id: createId("card"),
      content: contentLines.join("\n").trimEnd(),
      completed: marker ? marker.completed || inCompletedSection : inCompletedSection
    });
    index = nextIndex - 1;
  }

  if (columns.length === 0) {
    return null;
  }

  return { frontmatter, columns };
}

export function serializeKanbanMarkdown(board: KanbanBoard): string {
  const parts: string[] = [];
  parts.push(...board.frontmatter);
  if (parts.length === 0) {
    parts.push("---", "kanban-plugin: board", "---");
  }
  parts.push("");

  board.columns.forEach((column) => {
    parts.push(`## ${column.title}`);
    const activeCards = column.cards.filter((card) => !card.completed);
    const completedCards = column.cards.filter((card) => card.completed);

    if (activeCards.length === 0 && completedCards.length === 0) {
      parts.push("");
      return;
    }

    activeCards.forEach((card) => {
      const content = indentCardContent(card.content);
      parts.push(`- [ ] ${content}`);
    });

    if (completedCards.length > 0) {
      parts.push("");
      parts.push("---");
      parts.push("");
      completedCards.forEach((card) => {
        const content = indentCardContent(card.content);
        parts.push(`- [x] ${content}`);
      });
    }

    parts.push("");
  });

  return parts.join("\n").replace(/\n{3,}$/g, "\n\n").trimEnd() + "\n";
}

export function createStarterBoard(): string {
  return serializeKanbanMarkdown({
    frontmatter: ["---", "kanban-plugin: board", "---"],
    columns: [
      {
        id: createId("column"),
        title: "To Do",
        cards: [{ id: createId("card"), content: "Capture the first task", completed: false }]
      },
      {
        id: createId("column"),
        title: "Doing",
        cards: []
      },
      {
        id: createId("column"),
        title: "Done",
        cards: []
      }
    ]
  });
}
