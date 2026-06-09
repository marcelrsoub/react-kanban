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
