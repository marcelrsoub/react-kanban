import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import {
  addCard,
  deleteCard,
  deleteColumn,
  findCardById,
  findColumnByCardId,
  findColumnById,
  moveColumn,
  moveColumnByIndex,
  renameColumn,
  toggleCardCompletion,
  updateCard
} from "./operations";
import type { KanbanBoardModel, KanbanCard, KanbanColumn } from "./types";

type CardComposerState = {
  columnId: string;
  title: string;
  content: string;
  cardId?: string;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

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

const CARD_GROUP_PREFIX = "cards:";

const touchScrollPointerSensor = PointerSensor.configure({
  preventActivation(event, source) {
    if (event.pointerType === "touch") {
      const target = event.target;
      if (!(target instanceof Element) || !source.handle?.contains(target)) {
        return true;
      }
    }

    return PointerSensor.defaults.preventActivation?.(event, source) ?? false;
  }
});

const dragSensors = [touchScrollPointerSensor, KeyboardSensor];

function cardGroupId(columnId: string) {
  return `${CARD_GROUP_PREFIX}${columnId}`;
}

function clearElementChildren(element: HTMLElement) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function fallbackIcon(name: string) {
  return {
    plus: "+",
    "more-vertical": "⋮",
    "grip-vertical": "⋮⋮",
    check: "✓"
  }[name] ?? "•";
}

function useHorizontalTouchScroll(viewRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let axis: "horizontal" | "vertical" | null = null;

    const begin = (clientX: number, clientY: number) => {
      startX = clientX;
      startY = clientY;
      startScrollLeft = view.scrollLeft;
      axis = null;
    };

    const move = (clientX: number, clientY: number, event: TouchEvent | PointerEvent) => {
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      if (axis === null) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) {
          return;
        }
        axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
      }
      if (axis === "horizontal") {
        event.preventDefault();
        view.scrollLeft = startScrollLeft - deltaX;
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        begin(event.touches[0].clientX, event.touches[0].clientY);
      } else {
        axis = null;
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        move(event.touches[0].clientX, event.touches[0].clientY, event);
      }
    };
    const onPointerStart = (event: PointerEvent) => {
      if (event.pointerType === "touch" && event.isPrimary) {
        begin(event.clientX, event.clientY);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" && event.isPrimary && axis !== "vertical") {
        move(event.clientX, event.clientY, event);
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey) {
        return;
      }

      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      if (delta === 0) {
        return;
      }

      // Shift+wheel is the desktop equivalent of horizontal board dragging.
      // Capture it at the board root so nested column/card-list scrollers do
      // not consume the gesture before it can reach the board.
      event.preventDefault();
      view.scrollLeft += delta;
    };
    const reset = () => {
      axis = null;
    };

    view.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    view.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    view.addEventListener("touchend", reset, { capture: true });
    view.addEventListener("touchcancel", reset, { capture: true });
    view.addEventListener("pointerdown", onPointerStart, { capture: true, passive: true });
    view.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    view.addEventListener("pointerup", reset, { capture: true });
    view.addEventListener("pointercancel", reset, { capture: true });
    view.addEventListener("wheel", onWheel, { capture: true, passive: false });

    return () => {
      view.removeEventListener("touchstart", onTouchStart, true);
      view.removeEventListener("touchmove", onTouchMove, true);
      view.removeEventListener("touchend", reset, true);
      view.removeEventListener("touchcancel", reset, true);
      view.removeEventListener("pointerdown", onPointerStart, true);
      view.removeEventListener("pointermove", onPointerMove, true);
      view.removeEventListener("pointerup", reset, true);
      view.removeEventListener("pointercancel", reset, true);
      view.removeEventListener("wheel", onWheel, true);
    };
  }, [viewRef]);
}

function moveCards(board: KanbanBoardModel, event: DragOverEvent | DragEndEvent) {
  const groups = Object.fromEntries(board.columns.map((column) => [cardGroupId(column.id), column.cards]));
  const nextGroups = move(groups, event);
  if (nextGroups === groups) {
    return board;
  }

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: nextGroups[cardGroupId(column.id)] ?? column.cards
    }))
  };
}

function IconButton({
  icon,
  label,
  onClick,
  className,
  externalRef,
  renderIcon
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  externalRef?: (element: HTMLButtonElement | null) => void;
  renderIcon?: (name: string, element: HTMLElement) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    externalRef?.(ref.current);
    return () => externalRef?.(null);
  }, [externalRef]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    clearElementChildren(element);
    if (renderIcon) {
      renderIcon(icon, element);
    } else {
      element.textContent = fallbackIcon(icon);
    }
  }, [icon, renderIcon]);

  return (
    <button
      ref={ref}
      type="button"
      className={`clickable-icon react-kanban-icon-button ${className ?? ""}`.trim()}
      aria-label={label}
      onClick={onClick}
    />
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel
}: ConfirmDialogState & { onCancel: () => void }) {
  return (
    <div className="react-kanban-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="react-kanban-dialog react-kanban-confirm-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="react-kanban-dialog-header">
          <div>
            <h3>{title}</h3>
            <p>{message}</p>
          </div>
          <button type="button" className="clickable-icon react-kanban-icon-button" aria-label="Close dialog" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="react-kanban-dialog-footer">
          <button type="button" className="react-kanban-secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="react-kanban-danger-button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ComposerDialog({
  title,
  label,
  submitLabel,
  initialValue,
  placeholder,
  allowCreateNote,
  onCancel,
  onSubmit
}: {
  title: string;
  label: string;
  submitLabel: string;
  initialValue: string;
  placeholder: string;
  allowCreateNote: boolean;
  onCancel: () => void;
  onSubmit: (value: string, createNote: boolean) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [createNote, setCreateNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function submitCurrentValue() {
    const nextValue = value.trim();
    if (!nextValue || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(nextValue, allowCreateNote && createNote);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="react-kanban-dialog-backdrop" role="presentation" onMouseDown={() => !isSubmitting && onCancel()}>
      <form
        className="react-kanban-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void submitCurrentValue();
        }}
      >
        <div className="react-kanban-dialog-header">
          <div><h3>{title}</h3><p>{label}</p></div>
          <button type="button" className="clickable-icon react-kanban-icon-button" aria-label="Close dialog" disabled={isSubmitting} onClick={onCancel}>×</button>
        </div>
        <textarea
          ref={textareaRef}
          className="react-kanban-dialog-textarea"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDownCapture={(event) => {
            const isShortcut = event.key === "Enter" && (event.metaKey || event.ctrlKey || event.getModifierState("Meta") || event.getModifierState("Control"));
            if (isShortcut) {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.form?.requestSubmit();
            }
            if (event.key === "Escape" && !isSubmitting) {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
        />
        {allowCreateNote ? (
          <label className="react-kanban-note-option">
            <input type="checkbox" checked={createNote} disabled={isSubmitting} onChange={(event) => setCreateNote(event.target.checked)} />
            <span><strong>Create as a new note</strong><small>Save it beside this board and add a linked card.</small></span>
          </label>
        ) : null}
        <div className="react-kanban-dialog-footer">
          <button type="button" className="react-kanban-secondary-button" disabled={isSubmitting} onClick={onCancel}>Cancel</button>
          <button type="submit" className="react-kanban-primary-button" disabled={isSubmitting}>
            {isSubmitting ? (allowCreateNote && createNote ? "Creating..." : "Saving...") : allowCreateNote && createNote ? "Create note" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function CardMenu({
  x,
  y,
  onEdit,
  onDelete,
  onClose
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="react-kanban-card-menu-backdrop" role="presentation" onMouseDown={onClose} />
      <div className="react-kanban-card-menu" role="menu" style={{ left: x, top: y }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={onEdit}>Edit card</button>
        <button type="button" role="menuitem" className="danger" onClick={onDelete}>Delete card</button>
      </div>
    </>
  );
}

function ColumnMenu({
  column,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onDelete,
  onClose
}: {
  column: KanbanColumn;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="react-kanban-column-menu-backdrop" role="presentation" onMouseDown={onClose} />
      <div className="react-kanban-column-menu" role="menu" aria-label={`${column.title} menu`} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" disabled={!canMoveLeft} onClick={onMoveLeft}>Move column left</button>
        <button type="button" role="menuitem" disabled={!canMoveRight} onClick={onMoveRight}>Move column right</button>
        <button type="button" role="menuitem" className="danger" onClick={onDelete}>Delete column</button>
      </div>
    </>
  );
}

function SortableCard({
  columnId,
  index,
  card,
  readOnly,
  renderCard,
  renderIcon,
  onOpen,
  onToggleComplete,
  onContextMenu
}: {
  columnId: string;
  index: number;
  card: KanbanCard;
  readOnly: boolean;
  renderCard: KanbanBoardProps["renderCard"];
  renderIcon?: KanbanBoardProps["renderIcon"];
  onOpen: (card: KanbanCard) => void;
  onToggleComplete: (cardId: string) => void;
  onContextMenu: (card: KanbanCard, x: number, y: number) => void;
}) {
  const sortable = useSortable({ id: card.id, index, group: cardGroupId(columnId), type: "card", accept: "card", disabled: readOnly });
  const checkboxRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const element = checkboxRef.current;
    if (!element) {
      return;
    }
    clearElementChildren(element);
    if (card.completed) {
      if (renderIcon) {
        renderIcon("check", element);
      } else {
        element.textContent = fallbackIcon("check");
      }
    }
  }, [card.completed, renderIcon]);

  return (
    <div
      ref={sortable.ref}
      className={`react-kanban-card ${card.completed ? "is-completed" : ""} ${sortable.isDragging ? "is-dragging" : ""}`}
      onDoubleClick={readOnly ? undefined : () => onOpen(card)}
      onContextMenu={(event) => {
        if (readOnly) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(card, event.clientX + 8, event.clientY + 8);
      }}
    >
      {!readOnly ? (
        <button
          ref={checkboxRef}
          type="button"
          className="react-kanban-card-checkbox"
          aria-label={card.completed ? "Mark card incomplete" : "Mark card complete"}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleComplete(card.id);
          }}
        />
      ) : null}
      <div className="react-kanban-card-markdown">{renderCard(card, card.content)}</div>
    </div>
  );
}

function ColumnView({
  index,
  column,
  readOnly,
  renderCard,
  renderIcon,
  onRenameColumn,
  onOpenCard,
  onToggleComplete,
  onOpenCardMenu,
  onStartAddCard,
  menuOpen,
  onToggleMenu,
  onMoveColumnLeft,
  onMoveColumnRight,
  onDeleteColumn,
  canMoveLeft,
  canMoveRight
}: {
  index: number;
  column: KanbanColumn;
  readOnly: boolean;
  renderCard: KanbanBoardProps["renderCard"];
  renderIcon?: KanbanBoardProps["renderIcon"];
  onRenameColumn: (columnId: string, title: string) => void;
  onOpenCard: (card: KanbanCard) => void;
  onToggleComplete: (cardId: string) => void;
  onOpenCardMenu: (card: KanbanCard, x: number, y: number) => void;
  onStartAddCard: (columnId: string) => void;
  menuOpen: boolean;
  onToggleMenu: (columnId: string | null) => void;
  onMoveColumnLeft: (columnId: string) => void;
  onMoveColumnRight: (columnId: string) => void;
  onDeleteColumn: (columnId: string) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const activeCards = useMemo(() => column.cards.filter((card) => !card.completed), [column.cards]);
  const completedCards = useMemo(() => column.cards.filter((card) => card.completed), [column.cards]);
  const sortable = useSortable({ id: column.id, index, group: "board", type: "column", accept: "column", disabled: readOnly });
  const cardDropZone = useDroppable({ id: cardGroupId(column.id), type: "card-container", accept: "card", collisionPriority: 1, disabled: readOnly });

  useEffect(() => {
    setTitleDraft(column.title);
    if (readOnly) {
      setIsEditingTitle(false);
    }
  }, [column.title, readOnly]);

  const commitTitle = () => {
    if (readOnly) {
      setIsEditingTitle(false);
      setTitleDraft(column.title);
      return;
    }
    const nextTitle = titleDraft.trim();
    setIsEditingTitle(false);
    if (nextTitle && nextTitle !== column.title) {
      onToggleMenu(null);
      onRenameColumn(column.id, nextTitle);
    } else {
      setTitleDraft(column.title);
    }
  };

  return (
    <section ref={sortable.ref} className={`react-kanban-column ${sortable.isDropTarget ? "is-drop-target" : ""} ${sortable.isDragging ? "is-dragging" : ""}`}>
      <header className="react-kanban-column-header">
        <div className="react-kanban-column-title-wrap">
          {!readOnly ? <IconButton icon="grip-vertical" label={`Drag ${column.title}`} className="react-kanban-column-handle" externalRef={sortable.handleRef} onClick={() => undefined} renderIcon={renderIcon} /> : null}
          {isEditingTitle ? (
            <input
              className="react-kanban-column-title-input"
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsEditingTitle(false);
                  setTitleDraft(column.title);
                }
              }}
            />
          ) : (
            <h3 className="react-kanban-column-title" onDoubleClick={readOnly ? undefined : () => setIsEditingTitle(true)}>{column.title}</h3>
          )}
        </div>
        <div className="react-kanban-column-actions">
          <span className="react-kanban-card-count">{column.cards.length}</span>
          {!readOnly ? <IconButton icon="plus" label={`Add card to ${column.title}`} onClick={() => onStartAddCard(column.id)} renderIcon={renderIcon} /> : null}
          {!readOnly ? <IconButton icon="more-vertical" label={`${column.title} menu`} onClick={() => onToggleMenu(menuOpen ? null : column.id)} renderIcon={renderIcon} /> : null}
        </div>
      </header>
      {!readOnly && menuOpen ? <ColumnMenu column={column} canMoveLeft={canMoveLeft} canMoveRight={canMoveRight} onMoveLeft={() => onMoveColumnLeft(column.id)} onMoveRight={() => onMoveColumnRight(column.id)} onDelete={() => onDeleteColumn(column.id)} onClose={() => onToggleMenu(null)} /> : null}
      <div ref={cardDropZone.ref} className={`react-kanban-card-list ${cardDropZone.isDropTarget ? "is-drop-target" : ""}`}>
        {column.cards.length === 0 ? <div className="react-kanban-empty">Drop a card here</div> : null}
        {activeCards.map((card) => <SortableCard key={card.id} columnId={column.id} index={column.cards.findIndex((item) => item.id === card.id)} card={card} readOnly={readOnly} renderCard={renderCard} renderIcon={renderIcon} onOpen={onOpenCard} onToggleComplete={onToggleComplete} onContextMenu={onOpenCardMenu} />)}
        {completedCards.length > 0 ? <div className="react-kanban-completed-spacer" aria-hidden="true" /> : null}
        {completedCards.length > 0 ? <div className="react-kanban-completed-divider" aria-hidden="true" /> : null}
        {completedCards.length > 0 ? <div className="react-kanban-completed-label">Completed</div> : null}
        {completedCards.map((card) => <SortableCard key={card.id} columnId={column.id} index={column.cards.findIndex((item) => item.id === card.id)} card={card} readOnly={readOnly} renderCard={renderCard} renderIcon={renderIcon} onOpen={onOpenCard} onToggleComplete={onToggleComplete} onContextMenu={onOpenCardMenu} />)}
      </div>
    </section>
  );
}

export function KanbanBoard({
  board,
  onChange,
  renderCard,
  readOnly = false,
  title,
  emptyMessage = "Add `kanban-plugin: board` to the frontmatter to open it here.",
  onOpenCard,
  onCardContextMenu,
  onCreateLinkedNote,
  renderIcon,
  onNotice,
  className
}: KanbanBoardProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [workingBoard, setWorkingBoard] = useState<KanbanBoardModel | null>(board);
  const boardRef = useRef<KanbanBoardModel | null>(board);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [composer, setComposer] = useState<CardComposerState | null>(null);
  const [openMenuColumnId, setOpenMenuColumnId] = useState<string | null>(null);
  const [cardMenu, setCardMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const isDragging = useRef(false);
  const boardSnapshot = useRef<KanbanBoardModel | null>(board);

  useEffect(() => {
    if (readOnly) {
      setActiveCardId(null);
      setComposer(null);
      setOpenMenuColumnId(null);
      setCardMenu(null);
      setConfirmDialog(null);
    }
  }, [readOnly]);

  useHorizontalTouchScroll(viewRef);

  useEffect(() => {
    if (!isDragging.current) {
      boardRef.current = board;
      setWorkingBoard(board);
    }
  }, [board]);

  const commit = (mutator: (current: KanbanBoardModel) => KanbanBoardModel) => {
    if (readOnly) {
      return;
    }
    const current = boardRef.current;
    if (!current) {
      return;
    }
    const next = mutator(current);
    if (next === current) {
      return;
    }
    boardRef.current = next;
    setWorkingBoard(next);
    void Promise.resolve(onChange(next)).catch((error: unknown) => {
      onNotice?.(`Could not save board: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
  };

  const onDragStart = (event: DragStartEvent) => {
    if (readOnly) {
      return;
    }
    const source = event.operation.source;
    isDragging.current = true;
    boardSnapshot.current = boardRef.current;
    setActiveCardId(source?.id != null && source.type === "card" ? String(source.id) : null);
  };

  const onDragOver = (event: DragOverEvent) => {
    if (readOnly || event.operation.source?.type !== "card") {
      return;
    }
    setWorkingBoard((current) => {
      const next = current ? moveCards(current, event) : current;
      boardRef.current = next;
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (readOnly) {
      return;
    }
    const source = event.operation.source;
    isDragging.current = false;
    setActiveCardId(null);
    if (!source) {
      return;
    }
    if (event.canceled) {
      if (source.type === "card") {
        boardRef.current = boardSnapshot.current;
        setWorkingBoard(boardSnapshot.current);
      }
      return;
    }
    if (source.type === "column" && isSortable(source)) {
      if (source.initialIndex !== source.index) {
        commit((current) => moveColumnByIndex(current, source.initialIndex, source.index));
      }
      return;
    }
    if (source.type === "card") {
      const current = boardRef.current;
      if (current) {
        void Promise.resolve(onChange(current)).catch((error: unknown) => onNotice?.(`Could not save board: ${error instanceof Error ? error.message : "Unknown error"}`));
      }
    }
  };

  if (!workingBoard) {
    return <div ref={viewRef} className={`react-kanban-view ${className ?? ""}`.trim()}><div className="react-kanban-toolbar"><h2>{title}</h2><span className="status">This file is not a Kanban board yet</span></div><div className="react-kanban-empty">{emptyMessage}</div></div>;
  }

  const openCard = (card: KanbanCard) => {
    if (readOnly) {
      return;
    }
    if (onOpenCard) {
      onOpenCard(card);
      return;
    }
    const column = findColumnByCardId(workingBoard, card.id);
    if (column) {
      setComposer({ cardId: card.id, columnId: column.id, title: `Edit card in ${column.title}`, content: card.content });
    }
  };

  const requestDeleteCard = (cardId: string) => {
    setConfirmDialog({
      title: "Delete card?",
      message: "This will permanently remove the card from the board.",
      confirmLabel: "Delete card",
      onConfirm: () => {
        commit((current) => deleteCard(current, cardId));
        setConfirmDialog(null);
      }
    });
  };

  const openCardMenu = (card: KanbanCard, x: number, y: number) => {
    if (readOnly) {
      return;
    }
    const actions: CardMenuActions = {
      edit: () => {
        setCardMenu(null);
        openCard(card);
      },
      remove: () => {
        setCardMenu(null);
        requestDeleteCard(card.id);
      }
    };
    if (onCardContextMenu) {
      onCardContextMenu(card, x, y, actions);
    } else {
      setCardMenu({ cardId: card.id, x, y });
    }
  };

  const addCardFromComposer = async (value: string, createNote: boolean) => {
    if (readOnly || !composer) {
      return;
    }
    if (composer.cardId) {
      commit((current) => updateCard(current, composer.cardId!, value));
    } else if (createNote && onCreateLinkedNote) {
      const linkedContent = await onCreateLinkedNote(composer.columnId, value);
      commit((current) => addCard(current, composer!.columnId, linkedContent));
    } else {
      commit((current) => addCard(current, composer!.columnId, value));
    }
    setComposer(null);
  };

  const deleteColumnFromBoard = (columnId: string) => {
    if (readOnly) {
      return;
    }
    const column = findColumnById(workingBoard, columnId);
    if (!column) {
      return;
    }
    setOpenMenuColumnId(null);
    setConfirmDialog({
      title: `Delete "${column.title}"?`,
      message: "This will remove the column and all of its cards.",
      confirmLabel: "Delete column",
      onConfirm: () => {
        commit((current) => deleteColumn(current, columnId));
        setConfirmDialog(null);
      }
    });
  };

  return (
    <div ref={viewRef} className={`react-kanban-view ${className ?? ""}`.trim()}>
      <div className="react-kanban-toolbar"><h2>{title}</h2><span className="status">{workingBoard.columns.reduce((sum, column) => sum + column.cards.length, 0)} cards</span></div>
      <DragDropProvider sensors={dragSensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="react-kanban-board">
          {workingBoard.columns.map((column, index) => (
            <ColumnView
              key={column.id}
              index={index}
              column={column}
              readOnly={readOnly}
              renderCard={renderCard}
              renderIcon={renderIcon}
              onRenameColumn={(columnId, title) => commit((current) => renameColumn(current, columnId, title))}
              onOpenCard={openCard}
              onToggleComplete={(cardId) => commit((current) => toggleCardCompletion(current, cardId))}
              onOpenCardMenu={openCardMenu}
              onStartAddCard={(columnId) => {
                const target = findColumnById(workingBoard, columnId);
                if (target) {
                  setComposer({ columnId, title: `Add card to ${target.title}`, content: "" });
                }
              }}
              menuOpen={openMenuColumnId === column.id}
              onToggleMenu={setOpenMenuColumnId}
              onMoveColumnLeft={(columnId) => {
                commit((current) => moveColumn(current, columnId, -1));
                setOpenMenuColumnId(null);
              }}
              onMoveColumnRight={(columnId) => {
                commit((current) => moveColumn(current, columnId, 1));
                setOpenMenuColumnId(null);
              }}
              onDeleteColumn={deleteColumnFromBoard}
              canMoveLeft={index > 0}
              canMoveRight={index < workingBoard.columns.length - 1}
            />
          ))}
        </div>
        <DragOverlay>
          {(source) => {
            const cardId = source?.id != null ? String(source.id) : activeCardId;
            const card = cardId ? findCardById(workingBoard, cardId) : null;
            return card ? <div className={`react-kanban-card ${card.completed ? "is-completed" : ""} is-dragging`}><div className="react-kanban-card-markdown">{renderCard(card, card.content)}</div></div> : null;
          }}
        </DragOverlay>
      </DragDropProvider>
      {!readOnly && cardMenu ? <CardMenu x={cardMenu.x} y={cardMenu.y} onEdit={() => { const card = findCardById(workingBoard, cardMenu.cardId); setCardMenu(null); if (card) openCard(card); }} onDelete={() => { const card = findCardById(workingBoard, cardMenu.cardId); setCardMenu(null); if (card) requestDeleteCard(card.id); }} onClose={() => setCardMenu(null)} /> : null}
      {!readOnly && composer ? <ComposerDialog title={composer.title} label="Use markdown, links, and line breaks. Cmd/Ctrl+Enter saves." submitLabel={composer.cardId ? "Save card" : "Add card"} initialValue={composer.content} placeholder={composer.cardId ? "Edit the card content..." : "Write the card content..."} allowCreateNote={!composer.cardId && Boolean(onCreateLinkedNote)} onCancel={() => setComposer(null)} onSubmit={addCardFromComposer} /> : null}
      {!readOnly && confirmDialog ? <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} /> : null}
    </div>
  );
}

export { KanbanBoard as Board };
