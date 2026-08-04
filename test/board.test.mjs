import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addCard,
  deleteCard,
  moveCard,
  moveColumnByIndex,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
  toggleCardCompletion
} from "../dist/board/index.mjs";

const markdown = `---
kanban-plugin: board
cssclasses: board
---

## To Do
- [ ] First task
- [ ] Multi-line task
  with details

## Done
- [x] Shipped task
`;

test("parses board frontmatter, columns, multiline cards, and completion", () => {
  const board = parseKanbanMarkdown(markdown);
  assert.ok(board);
  assert.deepEqual(board.frontmatter, ["---", "kanban-plugin: board", "cssclasses: board", "---"]);
  assert.deepEqual(board.columns.map((column) => column.title), ["To Do", "Done"]);
  assert.deepEqual(board.columns[0].cards.map((card) => [card.content, card.completed]), [
    ["First task", false],
    ["Multi-line task\nwith details", false]
  ]);
  assert.equal(board.columns[1].cards[0].completed, true);
});

test("serializes active and completed cards with the existing Markdown format", () => {
  const board = parseKanbanMarkdown(markdown);
  assert.ok(board);
  const serialized = serializeKanbanMarkdown(board);
  assert.match(serialized, /cssclasses: board/);
  assert.match(serialized, /- \[ \] Multi-line task\n  with details/);
  assert.match(serialized, /## Done\n\n---\n\n- \[x\] Shipped task/);
  assert.equal(parseKanbanMarkdown(serialized)?.columns[1].cards[0].completed, true);
});

test("rejects notes without the Kanban frontmatter marker", () => {
  assert.equal(parseKanbanMarkdown("## To Do\n- A task"), null);
});

test("publishes the readOnly board capability in the public declaration", () => {
  const declaration = readFileSync(new URL("../dist/board/types/KanbanBoard.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /readOnly\?: boolean/);
});

test("board operations return new board data without mutating the input", () => {
  const board = {
    frontmatter: ["---", "kanban-plugin: board", "---"],
    columns: [
      { id: "todo", title: "To Do", cards: [{ id: "a", content: "A", completed: false }] },
      { id: "done", title: "Done", cards: [{ id: "b", content: "B", completed: true }] }
    ]
  };

  const withCard = addCard(board, "todo", "C", "c");
  assert.notEqual(withCard, board);
  assert.equal(board.columns[0].cards.length, 1);
  assert.deepEqual(withCard.columns[0].cards.map((card) => card.id), ["a", "c"]);

  const moved = moveCard(withCard, "c", "done", 0);
  assert.deepEqual(moved.columns.map((column) => column.cards.map((card) => card.id)), [["a"], ["c", "b"]]);

  const reordered = moveColumnByIndex(moved, 1, 0);
  assert.deepEqual(reordered.columns.map((column) => column.id), ["done", "todo"]);

  const completed = toggleCardCompletion(reordered, "a");
  assert.equal(completed.columns[1].cards[0].completed, true);
  const removed = deleteCard(completed, "c");
  assert.deepEqual(removed.columns[0].cards.map((card) => card.id), ["b"]);
});
