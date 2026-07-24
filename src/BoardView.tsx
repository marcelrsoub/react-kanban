import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { arrayMove, move } from "@dnd-kit/helpers";
import { MarkdownRenderer, Notice, normalizePath, setIcon, type App, type Component, type TFile } from "obsidian";
import { KanbanBoard as KanbanBoardModel, KanbanCard, KanbanColumn } from "./types";
import { parseKanbanMarkdown, serializeKanbanMarkdown } from "./markdown";

type CardComposerState = {
  columnId: string;
  title: string;
  content: string;
  cardId?: string;
};

type CardMenuState = {
  cardId: string;
  x: number;
  y: number;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
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
    const child = element.firstChild;
    if (child.parentNode !== element) {
      break;
    }
    element.removeChild(child);
  }
}

function getCardTitle(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.replace(/^#{1,6}\s+/, "").trim() || "Untitled card";
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim() || "Untitled";
}

type BoardViewProps = {
  app: App;
  component: Component;
  file: TFile;
  content: string;
  onSave: (nextContent: string) => Promise<void>;
};

function findColumnByCardId(board: KanbanBoardModel, cardId: string) {
  return board.columns.find((column) => column.cards.some((card) => card.id === cardId));
}

function findColumnById(board: KanbanBoardModel, columnId: string) {
  return board.columns.find((column) => column.id === columnId);
}

function findCardById(board: KanbanBoardModel, cardId: string) {
  for (const column of board.columns) {
    const card = column.cards.find((item) => item.id === cardId);
    if (card) {
      return card;
    }
  }
  return null;
}

function moveColumn(board: KanbanBoardModel, columnId: string, direction: -1 | 1) {
  const index = board.columns.findIndex((column) => column.id === columnId);
  if (index === -1) {
    return board;
  }

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= board.columns.length) {
    return board;
  }

  const columns = [...board.columns];
  const [moved] = columns.splice(index, 1);
  columns.splice(nextIndex, 0, moved);
  return { ...board, columns };
}

function moveColumnByIndex(board: KanbanBoardModel, fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return board;
  }

  if (fromIndex < 0 || fromIndex >= board.columns.length || toIndex < 0 || toIndex >= board.columns.length) {
    return board;
  }

  return {
    ...board,
    columns: arrayMove(board.columns, fromIndex, toIndex)
  };
}

function moveCards(board: KanbanBoardModel, event: DragOverEvent | DragEndEvent) {
  const groups = Object.fromEntries(
    board.columns.map((column) => [cardGroupId(column.id), column.cards])
  );
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

function deleteColumn(board: KanbanBoardModel, columnId: string) {
  return {
    ...board,
    columns: board.columns.filter((column) => column.id !== columnId)
  };
}

function deleteCard(board: KanbanBoardModel, cardId: string) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => card.id !== cardId)
    }))
  };
}

function updateCard(board: KanbanBoardModel, cardId: string, content: string) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => (card.id === cardId ? { ...card, content } : card))
    }))
  };
}

function toggleCardCompletion(board: KanbanBoardModel, cardId: string) {
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

  const insertionIndex = nextCard.completed ? nextColumnCards.length : nextColumnCards.findIndex((item) => item.completed);
  const safeInsertionIndex = insertionIndex === -1 ? nextColumnCards.length : insertionIndex;
  nextColumnCards.splice(safeInsertionIndex, 0, nextCard);

  return {
    ...board,
    columns: board.columns.map((item) => (item.id === column.id ? { ...item, cards: nextColumnCards } : item))
  };
}

function SortableCard({
  columnId,
  index,
  card,
  app,
  component,
  sourcePath,
  onOpen,
  onToggleComplete,
  onOpenMenu
}: {
  columnId: string;
  index: number;
  card: KanbanCard;
  app: App;
  component: Component;
  sourcePath: string;
  onOpen: (card: KanbanCard) => void;
  onToggleComplete: (cardId: string) => void;
  onOpenMenu: (cardId: string, x: number, y: number) => void;
}) {
  const sortable = useSortable({
    id: card.id,
    index,
    group: cardGroupId(columnId),
    type: "card",
    accept: "card"
  });
  const checkboxRef = React.useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = checkboxRef.current;
    if (!el) {
      return;
    }

    clearElementChildren(el);
    if (card.completed) {
      setIcon(el, "check");
    }
  }, [card.completed]);

  return (
    <div
      ref={sortable.ref}
      className={`react-kanban-card ${card.completed ? "is-completed" : ""} ${sortable.isDragging ? "is-dragging" : ""}`}
      onDoubleClick={() => onOpen(card)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const cardEl = event.currentTarget as HTMLElement;
        const boardEl = cardEl.closest(".react-kanban-view");
        const cardRect = cardEl.getBoundingClientRect();
        const boardRect = boardEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
        onOpenMenu(card.id, cardRect.left - boardRect.left + 12, cardRect.bottom - boardRect.top + 8);
      }}
    >
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
      >
      </button>
      <MarkdownCardContent app={app} markdown={card.content} component={component} sourcePath={sourcePath} />
    </div>
  );
}

function CardPreview({
  card,
  app,
  component,
  sourcePath
}: {
  card: KanbanCard;
  app: App;
  component: Component;
  sourcePath: string;
}) {
  return (
    <div className={`react-kanban-card ${card.completed ? "is-completed" : ""} is-dragging`}>
      <MarkdownCardContent app={app} markdown={card.content} component={component} sourcePath={sourcePath} />
    </div>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  className,
  externalRef
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  externalRef?: (element: HTMLButtonElement | null) => void;
}) {
  const ref = React.useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    externalRef?.(ref.current);
    return () => {
      externalRef?.(null);
    };
  }, [externalRef]);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    clearElementChildren(el);
    setIcon(el, icon);
  }, [icon]);

  return (
    <button ref={ref} type="button" className={`clickable-icon react-kanban-icon-button ${className ?? ""}`.trim()} aria-label={label} onClick={onClick} />
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
        <button type="button" role="menuitem" disabled={!canMoveLeft} onClick={onMoveLeft}>
          Move column left
        </button>
        <button type="button" role="menuitem" disabled={!canMoveRight} onClick={onMoveRight}>
          Move column right
        </button>
        <button type="button" role="menuitem" className="danger" onClick={onDelete}>
          Delete column
        </button>
      </div>
    </>
  );
}

function CardMenu({
  x,
  y,
  onEdit,
  onDelete,
}: {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="react-kanban-card-menu"
      role="menu"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onEdit}>
        Edit card
      </button>
      <button type="button" role="menuitem" className="danger" onClick={onDelete}>
        Delete card
      </button>
    </div>
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
          <button type="button" className="react-kanban-secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="react-kanban-danger-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkdownCardContent({
  app,
  markdown,
  component,
  sourcePath
}: {
  app: App;
  markdown: string;
  component: Component;
  sourcePath: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    let cancelled = false;
    clearElementChildren(el);
    const handleInternalLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a.internal-link");
      const linkText = link?.dataset.href;
      if (!link || !linkText || !el.contains(link)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const newLeaf = event.metaKey || event.ctrlKey ? "tab" : false;
      void app.workspace.openLinkText(linkText, sourcePath, newLeaf);
    };

    el.addEventListener("click", handleInternalLinkClick, true);
    void MarkdownRenderer.render(app, markdown || " ", el, sourcePath, component).then(() => {
      if (cancelled || !el.isConnected) {
        clearElementChildren(el);
      }
    });

    return () => {
      cancelled = true;
      el.removeEventListener("click", handleInternalLinkClick, true);
    };
  }, [app, component, markdown, sourcePath]);

  return <div ref={ref} className="react-kanban-card-markdown" />;
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
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function submitCurrentValue() {
    const nextValue = value.trim();
    if (nextValue && !isSubmitting) {
      setIsSubmitting(true);
      try {
        await onSubmit(nextValue, allowCreateNote && createNote);
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <div className="react-kanban-dialog-backdrop" role="presentation" onMouseDown={() => {
      if (!isSubmitting) {
        onCancel();
      }
    }}>
      <form
        className="react-kanban-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="react-kanban-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          submitCurrentValue();
        }}
      >
        <div className="react-kanban-dialog-header">
          <div>
            <h3 id="react-kanban-dialog-title">{title}</h3>
            <p>{label}</p>
          </div>
          <button type="button" className="clickable-icon react-kanban-icon-button" aria-label="Close dialog" disabled={isSubmitting} onClick={onCancel}>
            ×
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="react-kanban-dialog-textarea"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDownCapture={(event) => {
            const isShortcut =
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey || event.getModifierState("Meta") || event.getModifierState("Control"));
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
            <input
              type="checkbox"
              checked={createNote}
              disabled={isSubmitting}
              onChange={(event) => setCreateNote(event.target.checked)}
            />
            <span>
              <strong>Create as a new note</strong>
              <small>Save it beside this board and add a linked card.</small>
            </span>
          </label>
        ) : null}
        <div className="react-kanban-dialog-footer">
          <button type="button" className="react-kanban-secondary-button" disabled={isSubmitting} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="react-kanban-primary-button" disabled={isSubmitting}>
            {isSubmitting ? (allowCreateNote && createNote ? "Creating..." : "Saving...") : allowCreateNote && createNote ? "Create note" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColumnView({
  index,
  column,
  app,
  component,
  sourcePath,
  onAddCard,
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
  app: App;
  component: Component;
  sourcePath: string;
  onAddCard: (columnId: string, text: string) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onOpenCard: (card: KanbanCard) => void;
  onToggleComplete: (cardId: string) => void;
  onOpenCardMenu: (cardId: string, x: number, y: number) => void;
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
  const sortable = useSortable({
    id: column.id,
    index,
    group: "board",
    type: "column",
    accept: "column"
  });
  const cardDropZone = useDroppable({
    id: cardGroupId(column.id),
    type: "card-container",
    accept: "card",
    collisionPriority: 1
  });

  useEffect(() => {
    setTitleDraft(column.title);
  }, [column.title]);

  function commitTitle() {
    const nextTitle = titleDraft.trim();
    setIsEditingTitle(false);
    if (nextTitle && nextTitle !== column.title) {
      onRenameColumn(column.id, nextTitle);
    } else {
      setTitleDraft(column.title);
    }
  }

  return (
    <section ref={sortable.ref} className={`react-kanban-column ${sortable.isDropTarget ? "is-drop-target" : ""} ${sortable.isDragging ? "is-dragging" : ""}`}>
      <header className="react-kanban-column-header">
        <div className="react-kanban-column-title-wrap">
          <IconButton
            icon="grip-vertical"
            label={`Drag ${column.title}`}
            className="react-kanban-column-handle"
            externalRef={sortable.handleRef}
            onClick={() => void 0}
          />
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
            <h3
              className="react-kanban-column-title"
              onDoubleClick={() => setIsEditingTitle(true)}
            >
              {column.title}
            </h3>
          )}
        </div>
        <div className="react-kanban-column-actions">
          <span className="react-kanban-card-count">{column.cards.length}</span>
          <IconButton icon="plus" label={`Add card to ${column.title}`} onClick={() => onStartAddCard(column.id)} />
          <IconButton icon="more-vertical" label={`${column.title} menu`} onClick={() => onToggleMenu(menuOpen ? null : column.id)} />
        </div>
      </header>
      {menuOpen ? (
        <ColumnMenu
          column={column}
          canMoveLeft={canMoveLeft}
          canMoveRight={canMoveRight}
          onMoveLeft={() => onMoveColumnLeft(column.id)}
          onMoveRight={() => onMoveColumnRight(column.id)}
          onDelete={() => onDeleteColumn(column.id)}
          onClose={() => onToggleMenu(null)}
        />
      ) : null}
      <div
        ref={cardDropZone.ref}
        className={`react-kanban-card-list ${cardDropZone.isDropTarget ? "is-drop-target" : ""}`}
      >
        {column.cards.length === 0 ? <div className="react-kanban-empty">Drop a card here</div> : null}
        {activeCards.map((card) => (
          <SortableCard
            key={card.id}
            columnId={column.id}
            index={column.cards.findIndex((item) => item.id === card.id)}
            card={card}
            app={app}
            component={component}
            sourcePath={sourcePath}
            onOpen={onOpenCard}
            onToggleComplete={onToggleComplete}
            onOpenMenu={onOpenCardMenu}
          />
        ))}
        {completedCards.length > 0 ? <div className="react-kanban-completed-spacer" aria-hidden="true" /> : null}
        {completedCards.length > 0 ? <div className="react-kanban-completed-divider" aria-hidden="true" /> : null}
        {completedCards.length > 0 ? <div className="react-kanban-completed-label">Completed</div> : null}
        {completedCards.map((card) => (
          <SortableCard
            key={card.id}
            columnId={column.id}
            index={column.cards.findIndex((item) => item.id === card.id)}
            card={card}
            app={app}
            component={component}
            sourcePath={sourcePath}
            onOpen={onOpenCard}
            onToggleComplete={onToggleComplete}
            onOpenMenu={onOpenCardMenu}
          />
        ))}
      </div>
    </section>
  );
}

export function BoardView({ app, file, content, component, onSave }: BoardViewProps) {
  const parsed = useMemo(() => parseKanbanMarkdown(content), [content]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [composer, setComposer] = useState<CardComposerState | null>(null);
  const [openMenuColumnId, setOpenMenuColumnId] = useState<string | null>(null);
  const [openCardMenu, setOpenCardMenu] = useState<CardMenuState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [board, setBoard] = useState<KanbanBoardModel | null>(parsed);
  const boardSnapshot = useRef<KanbanBoardModel | null>(parsed);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) {
      setBoard(parsed);
    }
  }, [parsed]);

  async function persist(nextBoard: KanbanBoardModel) {
    const nextContent = serializeKanbanMarkdown(nextBoard);
    await onSave(nextContent);
  }

  function updateBoard(mutator: (current: KanbanBoardModel) => KanbanBoardModel) {
    setBoard((current) => {
      if (!current) {
        return current;
      }
      const next = mutator(current);
      void persist(next);
      return next;
    });
  }

  if (!board) {
    return (
      <div className="react-kanban-view">
        <div className="react-kanban-toolbar">
          <h2>{file.basename}</h2>
          <span className="status">This file is not a Kanban board yet</span>
        </div>
        <div className="react-kanban-empty">Add `kanban-plugin: board` to the frontmatter to open it here.</div>
      </div>
    );
  }

  const onDragStart = (event: DragStartEvent) => {
    const source = event.operation.source;
    isDragging.current = true;
    boardSnapshot.current = board;

    if (source?.id != null && source.type === "card") {
      setActiveCardId(String(source.id));
    } else {
      setActiveCardId(null);
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    if (event.operation.source?.type !== "card") {
      return;
    }

    setBoard((current) => current ? moveCards(current, event) : current);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const source = event.operation.source;
    isDragging.current = false;
    setActiveCardId(null);

    if (!source) {
      return;
    }

    if (event.canceled) {
      if (source.type === "card") {
        setBoard(boardSnapshot.current);
      }
      return;
    }

    if (source.type === "column" && isSortable(source)) {
      if (source.initialIndex !== source.index) {
        updateBoard((current) => moveColumnByIndex(current, source.initialIndex, source.index));
      }
      return;
    }

    if (source.type === "card") {
      setBoard((current) => {
        if (!current) {
          return current;
        }

        void persist(current);
        return current;
      });
    }
  };

  const addCard = (columnId: string, text: string) => {
    updateBoard((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [...column.cards, { id: `card-${Date.now()}-${Math.random().toString(16).slice(2)}`, content: text, completed: false }]
            }
          : column
      )
    }));
  };

  const addNoteCard = async (columnId: string, text: string) => {
    const title = getCardTitle(text);
    const baseName = sanitizeFileName(`${file.basename} - ${title}`);
    const folder = file.parent?.path ?? "";
    let notePath = normalizePath(folder ? `${folder}/${baseName}.md` : `${baseName}.md`);
    let suffix = 2;

    while (await app.vault.adapter.exists(notePath)) {
      notePath = normalizePath(folder ? `${folder}/${baseName} ${suffix}.md` : `${baseName} ${suffix}.md`);
      suffix += 1;
    }

    try {
      const note = await app.vault.create(notePath, text);
      const link = app.fileManager.generateMarkdownLink(note, file.path, undefined, title);
      addCard(columnId, link);
    } catch (error) {
      new Notice(`Could not create note: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  };

  const renameColumn = (columnId: string, title: string) => {
    updateBoard((current) => ({
      ...current,
      columns: current.columns.map((column) => (column.id === columnId ? { ...column, title } : column))
    }));
  };

  const moveColumnLeft = (columnId: string) => {
    updateBoard((current) => moveColumn(current, columnId, -1));
    setOpenMenuColumnId(null);
  };

  const moveColumnRight = (columnId: string) => {
    updateBoard((current) => moveColumn(current, columnId, 1));
    setOpenMenuColumnId(null);
  };

  const deleteColumnFromBoard = (columnId: string) => {
    const column = findColumnById(board, columnId);
    if (!column) {
      return;
    }

    setOpenMenuColumnId(null);
    setConfirmDialog({
      title: `Delete "${column.title}"?`,
      message: "This will remove the column and all of its cards.",
      confirmLabel: "Delete column",
      onConfirm: () => {
        updateBoard((current) => deleteColumn(current, columnId));
        setConfirmDialog(null);
      }
    });
  };

  const toggleComplete = (cardId: string) => {
    updateBoard((current) => toggleCardCompletion(current, cardId));
  };

  const openCardContextMenu = (cardId: string, x: number, y: number) => {
    setOpenCardMenu({ cardId, x, y });
  };

  const editCard = (cardOrId: KanbanCard | string) => {
    const cardId = typeof cardOrId === "string" ? cardOrId : cardOrId.id;
    const column = findColumnByCardId(board, cardId);
    const card = findCardById(board, cardId);
    if (!column || !card) {
      return;
    }

    setOpenCardMenu(null);
    setComposer({
      cardId,
      columnId: column.id,
      title: `Edit card in ${column.title}`,
      content: card.content
    });
  };

  const deleteCardFromBoard = (cardId: string) => {
    const card = board.columns.flatMap((column) => column.cards).find((item) => item.id === cardId);
    if (!card) {
      return;
    }

    setOpenCardMenu(null);
    setConfirmDialog({
      title: "Delete card?",
      message: "This will permanently remove the card from the board.",
      confirmLabel: "Delete card",
      onConfirm: () => {
        updateBoard((current) => deleteCard(current, cardId));
        setConfirmDialog(null);
      }
    });
  };

  const startAddCard = (columnId: string) => {
    const column = findColumnById(board, columnId);
    if (!column) {
      return;
    }

    setComposer({
      columnId,
      title: `Add card to ${column.title}`,
      content: ""
    });
  };

  return (
    <div className="react-kanban-view">
      <div className="react-kanban-toolbar">
        <h2>{file.basename}</h2>
        <span className="status">{board.columns.reduce((sum, column) => sum + column.cards.length, 0)} cards</span>
      </div>
      <DragDropProvider sensors={dragSensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="react-kanban-board">
          {board.columns.map((column, index) => (
            <ColumnView
              key={column.id}
              index={index}
              column={column}
              app={app}
              component={component}
              sourcePath={file.path}
              onAddCard={addCard}
              onRenameColumn={renameColumn}
              onOpenCard={editCard}
              onToggleComplete={toggleComplete}
              onStartAddCard={startAddCard}
              menuOpen={openMenuColumnId === column.id}
              onToggleMenu={setOpenMenuColumnId}
              onMoveColumnLeft={moveColumnLeft}
              onMoveColumnRight={moveColumnRight}
              onDeleteColumn={deleteColumnFromBoard}
              canMoveLeft={index > 0}
              canMoveRight={index < board.columns.length - 1}
              onOpenCardMenu={openCardContextMenu}
            />
          ))}
        </div>
        <DragOverlay>
          {(source) => {
            const cardId = source?.id != null ? String(source.id) : activeCardId;
            if (!cardId) {
              return null;
            }

            const card = findCardById(board, cardId);
            if (!card) {
              return null;
            }

            return <CardPreview card={card} app={app} component={component} sourcePath={file.path} />;
          }}
        </DragOverlay>
      </DragDropProvider>
      {openCardMenu ? (
        <div className="react-kanban-card-menu-backdrop" onMouseDown={() => setOpenCardMenu(null)}>
          <CardMenu
            x={openCardMenu.x}
            y={openCardMenu.y}
            onEdit={() => editCard(openCardMenu.cardId)}
            onDelete={() => deleteCardFromBoard(openCardMenu.cardId)}
          />
        </div>
      ) : null}
      {composer ? (
        <ComposerDialog
          title={composer.title}
          label="Use markdown, links, and line breaks. Cmd/Ctrl+Enter saves."
          submitLabel={composer.cardId ? "Save card" : "Add card"}
          initialValue={composer.content}
          placeholder={composer.cardId ? "Edit the card content..." : "Write the card content..."}
          allowCreateNote={!composer.cardId}
          onCancel={() => setComposer(null)}
          onSubmit={async (value, createNote) => {
            if (composer.cardId) {
              updateBoard((current) => updateCard(current, composer.cardId!, value));
            } else if (createNote) {
              await addNoteCard(composer.columnId, value);
            } else {
              addCard(composer.columnId, value);
            }
            setComposer(null);
          }}
        />
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          {...confirmDialog}
          onCancel={() => setConfirmDialog(null)}
        />
      ) : null}
    </div>
  );
}
