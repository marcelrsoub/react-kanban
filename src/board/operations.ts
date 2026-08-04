import type { KanbanBoard, KanbanCard } from "./types";

export function createCardId() {
  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function findColumnByCardId(board: KanbanBoard, cardId: string) {
  return board.columns.find((column) => column.cards.some((card) => card.id === cardId));
}

export function findColumnById(board: KanbanBoard, columnId: string) {
  return board.columns.find((column) => column.id === columnId);
}

export function findCardById(board: KanbanBoard, cardId: string): KanbanCard | null {
  for (const column of board.columns) {
    const card = column.cards.find((item) => item.id === cardId);
    if (card) {
      return card;
    }
  }
  return null;
}

export function addCard(board: KanbanBoard, columnId: string, content: string, id = createCardId()) {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.id === columnId
        ? { ...column, cards: [...column.cards, { id, content, completed: false }] }
        : column
    )
  };
}

export function renameColumn(board: KanbanBoard, columnId: string, title: string) {
  return {
    ...board,
    columns: board.columns.map((column) => (column.id === columnId ? { ...column, title } : column))
  };
}

export function moveColumn(board: KanbanBoard, columnId: string, direction: -1 | 1) {
  const index = board.columns.findIndex((column) => column.id === columnId);
  const nextIndex = index + direction;
  if (index === -1 || nextIndex < 0 || nextIndex >= board.columns.length) {
    return board;
  }

  const columns = [...board.columns];
  const [moved] = columns.splice(index, 1);
  columns.splice(nextIndex, 0, moved);
  return { ...board, columns };
}

export function moveColumnByIndex(board: KanbanBoard, fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= board.columns.length ||
    toIndex < 0 ||
    toIndex >= board.columns.length
  ) {
    return board;
  }

  const columns = [...board.columns];
  const [moved] = columns.splice(fromIndex, 1);
  columns.splice(toIndex, 0, moved);
  return { ...board, columns };
}

export function moveCard(
  board: KanbanBoard,
  cardId: string,
  targetColumnId: string,
  targetIndex: number
) {
  const sourceColumn = findColumnByCardId(board, cardId);
  const targetColumn = findColumnById(board, targetColumnId);
  if (!sourceColumn || !targetColumn) {
    return board;
  }

  const cardIndex = sourceColumn.cards.findIndex((card) => card.id === cardId);
  const card = sourceColumn.cards[cardIndex];
  if (!card) {
    return board;
  }

  const columns = board.columns.map((column) => ({ ...column, cards: [...column.cards] }));
  const nextSource = columns.find((column) => column.id === sourceColumn.id)!;
  const nextTarget = columns.find((column) => column.id === targetColumn.id)!;
  nextSource.cards.splice(cardIndex, 1);
  const boundedIndex = Math.max(0, Math.min(targetIndex, nextTarget.cards.length));
  nextTarget.cards.splice(boundedIndex, 0, card);
  return { ...board, columns };
}

export function deleteColumn(board: KanbanBoard, columnId: string) {
  return { ...board, columns: board.columns.filter((column) => column.id !== columnId) };
}

export function deleteCard(board: KanbanBoard, cardId: string) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => card.id !== cardId)
    }))
  };
}

export function updateCard(board: KanbanBoard, cardId: string, content: string) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => (card.id === cardId ? { ...card, content } : card))
    }))
  };
}

export function toggleCardCompletion(board: KanbanBoard, cardId: string) {
  const column = findColumnByCardId(board, cardId);
  if (!column) {
    return board;
  }

  const cardIndex = column.cards.findIndex((card) => card.id === cardId);
  const card = column.cards[cardIndex];
  if (!card) {
    return board;
  }

  const nextCard = { ...card, completed: !card.completed };
  const nextColumnCards = [...column.cards];
  nextColumnCards.splice(cardIndex, 1);
  const insertionIndex = nextCard.completed
    ? nextColumnCards.length
    : nextColumnCards.findIndex((item) => item.completed);
  const safeInsertionIndex = insertionIndex === -1 ? nextColumnCards.length : insertionIndex;
  nextColumnCards.splice(safeInsertionIndex, 0, nextCard);

  return {
    ...board,
    columns: board.columns.map((item) =>
      item.id === column.id ? { ...item, cards: nextColumnCards } : item
    )
  };
}
