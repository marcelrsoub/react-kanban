import type { KanbanBoard, KanbanCard } from "./types";
export declare function createCardId(): string;
export declare function findColumnByCardId(board: KanbanBoard, cardId: string): import("./types").KanbanColumn | undefined;
export declare function findColumnById(board: KanbanBoard, columnId: string): import("./types").KanbanColumn | undefined;
export declare function findCardById(board: KanbanBoard, cardId: string): KanbanCard | null;
export declare function addCard(board: KanbanBoard, columnId: string, content: string, id?: string): {
    columns: import("./types").KanbanColumn[];
    frontmatter: string[];
};
export declare function renameColumn(board: KanbanBoard, columnId: string, title: string): {
    columns: import("./types").KanbanColumn[];
    frontmatter: string[];
};
export declare function moveColumn(board: KanbanBoard, columnId: string, direction: -1 | 1): KanbanBoard;
export declare function moveColumnByIndex(board: KanbanBoard, fromIndex: number, toIndex: number): KanbanBoard;
export declare function moveCard(board: KanbanBoard, cardId: string, targetColumnId: string, targetIndex: number): KanbanBoard;
export declare function deleteColumn(board: KanbanBoard, columnId: string): {
    columns: import("./types").KanbanColumn[];
    frontmatter: string[];
};
export declare function deleteCard(board: KanbanBoard, cardId: string): {
    columns: {
        cards: KanbanCard[];
        id: string;
        title: string;
    }[];
    frontmatter: string[];
};
export declare function updateCard(board: KanbanBoard, cardId: string, content: string): {
    columns: {
        cards: KanbanCard[];
        id: string;
        title: string;
    }[];
    frontmatter: string[];
};
export declare function toggleCardCompletion(board: KanbanBoard, cardId: string): KanbanBoard;
//# sourceMappingURL=operations.d.ts.map