import { KanbanBoard as KanbanBoardComponent, Board } from "./KanbanBoard";
import type { KanbanBoard as KanbanBoardType, KanbanBoardModel as KanbanBoardModelType, KanbanCard, KanbanColumn } from "./types";
export declare const KanbanBoard: typeof KanbanBoardComponent;
export { Board };
export type { KanbanCard, KanbanColumn };
export type KanbanBoard = KanbanBoardType;
export type KanbanBoardModel = KanbanBoardModelType;
export type { CardMenuActions, KanbanBoardProps } from "./KanbanBoard";
export { createStarterBoard, parseKanbanMarkdown, serializeKanbanMarkdown } from "./markdown";
export { addCard, createCardId, deleteCard, deleteColumn, findCardById, findColumnByCardId, findColumnById, moveCard, moveColumn, moveColumnByIndex, renameColumn, toggleCardCompletion, updateCard } from "./operations";
//# sourceMappingURL=index.d.ts.map