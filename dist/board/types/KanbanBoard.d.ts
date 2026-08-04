import { type ReactNode } from "react";
import type { KanbanBoardModel, KanbanCard } from "./types";
export type CardMenuActions = {
    edit: () => void;
    remove: () => void;
};
export type KanbanBoardProps = {
    board: KanbanBoardModel | null;
    onChange: (nextBoard: KanbanBoardModel) => void | Promise<void>;
    renderCard: (card: KanbanCard, content: string) => ReactNode;
    readOnly?: boolean;
    title?: ReactNode;
    emptyMessage?: ReactNode;
    onOpenCard?: (card: KanbanCard) => void;
    onCardContextMenu?: (card: KanbanCard, x: number, y: number, actions: CardMenuActions) => void;
    onCreateLinkedNote?: (columnId: string, content: string) => string | Promise<string>;
    renderIcon?: (name: string, element: HTMLElement) => void;
    onNotice?: (message: string) => void;
    className?: string;
};
export declare function KanbanBoard({ board, onChange, renderCard, readOnly, title, emptyMessage, onOpenCard, onCardContextMenu, onCreateLinkedNote, renderIcon, onNotice, className }: KanbanBoardProps): import("react").JSX.Element;
export { KanbanBoard as Board };
//# sourceMappingURL=KanbanBoard.d.ts.map