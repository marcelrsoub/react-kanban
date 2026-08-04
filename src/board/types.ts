export interface KanbanCard {
  id: string;
  content: string;
  completed: boolean;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  frontmatter: string[];
  columns: KanbanColumn[];
}

/** Alias retained for consumers that prefer to make the model distinction explicit. */
export type KanbanBoardModel = KanbanBoard;
