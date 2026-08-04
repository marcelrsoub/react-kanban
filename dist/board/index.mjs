// src/board/KanbanBoard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable
} from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";

// src/board/operations.ts
function createCardId() {
  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function findColumnByCardId(board, cardId) {
  return board.columns.find((column) => column.cards.some((card) => card.id === cardId));
}
function findColumnById(board, columnId) {
  return board.columns.find((column) => column.id === columnId);
}
function findCardById(board, cardId) {
  for (const column of board.columns) {
    const card = column.cards.find((item) => item.id === cardId);
    if (card) {
      return card;
    }
  }
  return null;
}
function addCard(board, columnId, content, id = createCardId()) {
  return {
    ...board,
    columns: board.columns.map(
      (column) => column.id === columnId ? { ...column, cards: [...column.cards, { id, content, completed: false }] } : column
    )
  };
}
function renameColumn(board, columnId, title) {
  return {
    ...board,
    columns: board.columns.map((column) => column.id === columnId ? { ...column, title } : column)
  };
}
function moveColumn(board, columnId, direction) {
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
function moveColumnByIndex(board, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= board.columns.length || toIndex < 0 || toIndex >= board.columns.length) {
    return board;
  }
  const columns = [...board.columns];
  const [moved] = columns.splice(fromIndex, 1);
  columns.splice(toIndex, 0, moved);
  return { ...board, columns };
}
function moveCard(board, cardId, targetColumnId, targetIndex) {
  const sourceColumn = findColumnByCardId(board, cardId);
  const targetColumn = findColumnById(board, targetColumnId);
  if (!sourceColumn || !targetColumn) {
    return board;
  }
  const cardIndex = sourceColumn.cards.findIndex((card2) => card2.id === cardId);
  const card = sourceColumn.cards[cardIndex];
  if (!card) {
    return board;
  }
  const columns = board.columns.map((column) => ({ ...column, cards: [...column.cards] }));
  const nextSource = columns.find((column) => column.id === sourceColumn.id);
  const nextTarget = columns.find((column) => column.id === targetColumn.id);
  nextSource.cards.splice(cardIndex, 1);
  const boundedIndex = Math.max(0, Math.min(targetIndex, nextTarget.cards.length));
  nextTarget.cards.splice(boundedIndex, 0, card);
  return { ...board, columns };
}
function deleteColumn(board, columnId) {
  return { ...board, columns: board.columns.filter((column) => column.id !== columnId) };
}
function deleteCard(board, cardId) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => card.id !== cardId)
    }))
  };
}
function updateCard(board, cardId, content) {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => card.id === cardId ? { ...card, content } : card)
    }))
  };
}
function toggleCardCompletion(board, cardId) {
  const column = findColumnByCardId(board, cardId);
  if (!column) {
    return board;
  }
  const cardIndex = column.cards.findIndex((card2) => card2.id === cardId);
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
    columns: board.columns.map(
      (item) => item.id === column.id ? { ...item, cards: nextColumnCards } : item
    )
  };
}

// src/board/KanbanBoard.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CARD_GROUP_PREFIX = "cards:";
var touchScrollPointerSensor = PointerSensor.configure({
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
var dragSensors = [touchScrollPointerSensor, KeyboardSensor];
function cardGroupId(columnId) {
  return `${CARD_GROUP_PREFIX}${columnId}`;
}
function clearElementChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}
function fallbackIcon(name) {
  return {
    plus: "+",
    "more-vertical": "\u22EE",
    "grip-vertical": "\u22EE\u22EE",
    check: "\u2713"
  }[name] ?? "\u2022";
}
function useHorizontalTouchScroll(viewRef) {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let axis = null;
    const begin = (clientX, clientY) => {
      startX = clientX;
      startY = clientY;
      startScrollLeft = view.scrollLeft;
      axis = null;
    };
    const move2 = (clientX, clientY, event) => {
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
    const onTouchStart = (event) => {
      if (event.touches.length === 1) {
        begin(event.touches[0].clientX, event.touches[0].clientY);
      } else {
        axis = null;
      }
    };
    const onTouchMove = (event) => {
      if (event.touches.length === 1) {
        move2(event.touches[0].clientX, event.touches[0].clientY, event);
      }
    };
    const onPointerStart = (event) => {
      if (event.pointerType === "touch" && event.isPrimary) {
        begin(event.clientX, event.clientY);
      }
    };
    const onPointerMove = (event) => {
      if (event.pointerType === "touch" && event.isPrimary && axis !== "vertical") {
        move2(event.clientX, event.clientY, event);
      }
    };
    const onWheel = (event) => {
      if (!event.shiftKey) {
        return;
      }
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      if (delta === 0) {
        return;
      }
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
function moveCards(board, event) {
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
}) {
  const ref = useRef(null);
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
  return /* @__PURE__ */ jsx(
    "button",
    {
      ref,
      type: "button",
      className: `clickable-icon react-kanban-icon-button ${className ?? ""}`.trim(),
      "aria-label": label,
      onClick
    }
  );
}
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel
}) {
  return /* @__PURE__ */ jsx("div", { className: "react-kanban-dialog-backdrop", role: "presentation", onMouseDown: onCancel, children: /* @__PURE__ */ jsxs("div", { className: "react-kanban-dialog react-kanban-confirm-dialog", role: "dialog", "aria-modal": "true", onMouseDown: (event) => event.stopPropagation(), children: [
    /* @__PURE__ */ jsxs("div", { className: "react-kanban-dialog-header", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { children: title }),
        /* @__PURE__ */ jsx("p", { children: message })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "clickable-icon react-kanban-icon-button", "aria-label": "Close dialog", onClick: onCancel, children: "\xD7" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "react-kanban-dialog-footer", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "react-kanban-secondary-button", onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "react-kanban-danger-button", onClick: onConfirm, children: confirmLabel })
    ] })
  ] }) });
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
}) {
  const [value, setValue] = useState(initialValue);
  const [createNote, setCreateNote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef(null);
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
  return /* @__PURE__ */ jsx("div", { className: "react-kanban-dialog-backdrop", role: "presentation", onMouseDown: () => !isSubmitting && onCancel(), children: /* @__PURE__ */ jsxs(
    "form",
    {
      className: "react-kanban-dialog",
      role: "dialog",
      "aria-modal": "true",
      onMouseDown: (event) => event.stopPropagation(),
      onSubmit: (event) => {
        event.preventDefault();
        void submitCurrentValue();
      },
      children: [
        /* @__PURE__ */ jsxs("div", { className: "react-kanban-dialog-header", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { children: title }),
            /* @__PURE__ */ jsx("p", { children: label })
          ] }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "clickable-icon react-kanban-icon-button", "aria-label": "Close dialog", disabled: isSubmitting, onClick: onCancel, children: "\xD7" })
        ] }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            ref: textareaRef,
            className: "react-kanban-dialog-textarea",
            value,
            placeholder,
            onChange: (event) => setValue(event.target.value),
            onKeyDownCapture: (event) => {
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
            }
          }
        ),
        allowCreateNote ? /* @__PURE__ */ jsxs("label", { className: "react-kanban-note-option", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: createNote, disabled: isSubmitting, onChange: (event) => setCreateNote(event.target.checked) }),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Create as a new note" }),
            /* @__PURE__ */ jsx("small", { children: "Save it beside this board and add a linked card." })
          ] })
        ] }) : null,
        /* @__PURE__ */ jsxs("div", { className: "react-kanban-dialog-footer", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "react-kanban-secondary-button", disabled: isSubmitting, onClick: onCancel, children: "Cancel" }),
          /* @__PURE__ */ jsx("button", { type: "submit", className: "react-kanban-primary-button", disabled: isSubmitting, children: isSubmitting ? allowCreateNote && createNote ? "Creating..." : "Saving..." : allowCreateNote && createNote ? "Create note" : submitLabel })
        ] })
      ]
    }
  ) });
}
function CardMenu({
  x,
  y,
  onEdit,
  onDelete,
  onClose
}) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "react-kanban-card-menu-backdrop", role: "presentation", onMouseDown: onClose }),
    /* @__PURE__ */ jsxs("div", { className: "react-kanban-card-menu", role: "menu", style: { left: x, top: y }, onMouseDown: (event) => event.stopPropagation(), children: [
      /* @__PURE__ */ jsx("button", { type: "button", role: "menuitem", onClick: onEdit, children: "Edit card" }),
      /* @__PURE__ */ jsx("button", { type: "button", role: "menuitem", className: "danger", onClick: onDelete, children: "Delete card" })
    ] })
  ] });
}
function ColumnMenu({
  column,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onDelete,
  onClose
}) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "react-kanban-column-menu-backdrop", role: "presentation", onMouseDown: onClose }),
    /* @__PURE__ */ jsxs("div", { className: "react-kanban-column-menu", role: "menu", "aria-label": `${column.title} menu`, onMouseDown: (event) => event.stopPropagation(), children: [
      /* @__PURE__ */ jsx("button", { type: "button", role: "menuitem", disabled: !canMoveLeft, onClick: onMoveLeft, children: "Move column left" }),
      /* @__PURE__ */ jsx("button", { type: "button", role: "menuitem", disabled: !canMoveRight, onClick: onMoveRight, children: "Move column right" }),
      /* @__PURE__ */ jsx("button", { type: "button", role: "menuitem", className: "danger", onClick: onDelete, children: "Delete column" })
    ] })
  ] });
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
}) {
  const sortable = useSortable({ id: card.id, index, group: cardGroupId(columnId), type: "card", accept: "card", disabled: readOnly });
  const checkboxRef = useRef(null);
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
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: sortable.ref,
      className: `react-kanban-card ${card.completed ? "is-completed" : ""} ${sortable.isDragging ? "is-dragging" : ""}`,
      onDoubleClick: readOnly ? void 0 : () => onOpen(card),
      onContextMenu: (event) => {
        if (readOnly) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(card, event.clientX + 8, event.clientY + 8);
      },
      children: [
        !readOnly ? /* @__PURE__ */ jsx(
          "button",
          {
            ref: checkboxRef,
            type: "button",
            className: "react-kanban-card-checkbox",
            "aria-label": card.completed ? "Mark card incomplete" : "Mark card complete",
            onPointerDown: (event) => event.stopPropagation(),
            onMouseDown: (event) => event.stopPropagation(),
            onClick: (event) => {
              event.stopPropagation();
              onToggleComplete(card.id);
            }
          }
        ) : null,
        /* @__PURE__ */ jsx("div", { className: "react-kanban-card-markdown", children: renderCard(card, card.content) })
      ]
    }
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
  return /* @__PURE__ */ jsxs("section", { ref: sortable.ref, className: `react-kanban-column ${sortable.isDropTarget ? "is-drop-target" : ""} ${sortable.isDragging ? "is-dragging" : ""}`, children: [
    /* @__PURE__ */ jsxs("header", { className: "react-kanban-column-header", children: [
      /* @__PURE__ */ jsxs("div", { className: "react-kanban-column-title-wrap", children: [
        !readOnly ? /* @__PURE__ */ jsx(IconButton, { icon: "grip-vertical", label: `Drag ${column.title}`, className: "react-kanban-column-handle", externalRef: sortable.handleRef, onClick: () => void 0, renderIcon }) : null,
        isEditingTitle ? /* @__PURE__ */ jsx(
          "input",
          {
            className: "react-kanban-column-title-input",
            value: titleDraft,
            autoFocus: true,
            onChange: (event) => setTitleDraft(event.target.value),
            onBlur: commitTitle,
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTitle();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setIsEditingTitle(false);
                setTitleDraft(column.title);
              }
            }
          }
        ) : /* @__PURE__ */ jsx("h3", { className: "react-kanban-column-title", onDoubleClick: readOnly ? void 0 : () => setIsEditingTitle(true), children: column.title })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "react-kanban-column-actions", children: [
        /* @__PURE__ */ jsx("span", { className: "react-kanban-card-count", children: column.cards.length }),
        !readOnly ? /* @__PURE__ */ jsx(IconButton, { icon: "plus", label: `Add card to ${column.title}`, onClick: () => onStartAddCard(column.id), renderIcon }) : null,
        !readOnly ? /* @__PURE__ */ jsx(IconButton, { icon: "more-vertical", label: `${column.title} menu`, onClick: () => onToggleMenu(menuOpen ? null : column.id), renderIcon }) : null
      ] })
    ] }),
    !readOnly && menuOpen ? /* @__PURE__ */ jsx(ColumnMenu, { column, canMoveLeft, canMoveRight, onMoveLeft: () => onMoveColumnLeft(column.id), onMoveRight: () => onMoveColumnRight(column.id), onDelete: () => onDeleteColumn(column.id), onClose: () => onToggleMenu(null) }) : null,
    /* @__PURE__ */ jsxs("div", { ref: cardDropZone.ref, className: `react-kanban-card-list ${cardDropZone.isDropTarget ? "is-drop-target" : ""}`, children: [
      column.cards.length === 0 ? /* @__PURE__ */ jsx("div", { className: "react-kanban-empty", children: "Drop a card here" }) : null,
      activeCards.map((card) => /* @__PURE__ */ jsx(SortableCard, { columnId: column.id, index: column.cards.findIndex((item) => item.id === card.id), card, readOnly, renderCard, renderIcon, onOpen: onOpenCard, onToggleComplete, onContextMenu: onOpenCardMenu }, card.id)),
      completedCards.length > 0 ? /* @__PURE__ */ jsx("div", { className: "react-kanban-completed-spacer", "aria-hidden": "true" }) : null,
      completedCards.length > 0 ? /* @__PURE__ */ jsx("div", { className: "react-kanban-completed-divider", "aria-hidden": "true" }) : null,
      completedCards.length > 0 ? /* @__PURE__ */ jsx("div", { className: "react-kanban-completed-label", children: "Completed" }) : null,
      completedCards.map((card) => /* @__PURE__ */ jsx(SortableCard, { columnId: column.id, index: column.cards.findIndex((item) => item.id === card.id), card, readOnly, renderCard, renderIcon, onOpen: onOpenCard, onToggleComplete, onContextMenu: onOpenCardMenu }, card.id))
    ] })
  ] });
}
function KanbanBoard({
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
}) {
  const viewRef = useRef(null);
  const [workingBoard, setWorkingBoard] = useState(board);
  const boardRef = useRef(board);
  const [activeCardId, setActiveCardId] = useState(null);
  const [composer, setComposer] = useState(null);
  const [openMenuColumnId, setOpenMenuColumnId] = useState(null);
  const [cardMenu, setCardMenu] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const isDragging = useRef(false);
  const boardSnapshot = useRef(board);
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
  const commit = (mutator) => {
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
    void Promise.resolve(onChange(next)).catch((error) => {
      onNotice?.(`Could not save board: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
  };
  const onDragStart = (event) => {
    if (readOnly) {
      return;
    }
    const source = event.operation.source;
    isDragging.current = true;
    boardSnapshot.current = boardRef.current;
    setActiveCardId(source?.id != null && source.type === "card" ? String(source.id) : null);
  };
  const onDragOver = (event) => {
    if (readOnly || event.operation.source?.type !== "card") {
      return;
    }
    setWorkingBoard((current) => {
      const next = current ? moveCards(current, event) : current;
      boardRef.current = next;
      return next;
    });
  };
  const onDragEnd = (event) => {
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
        void Promise.resolve(onChange(current)).catch((error) => onNotice?.(`Could not save board: ${error instanceof Error ? error.message : "Unknown error"}`));
      }
    }
  };
  if (!workingBoard) {
    return /* @__PURE__ */ jsxs("div", { ref: viewRef, className: `react-kanban-view ${className ?? ""}`.trim(), children: [
      /* @__PURE__ */ jsxs("div", { className: "react-kanban-toolbar", children: [
        /* @__PURE__ */ jsx("h2", { children: title }),
        /* @__PURE__ */ jsx("span", { className: "status", children: "This file is not a Kanban board yet" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "react-kanban-empty", children: emptyMessage })
    ] });
  }
  const openCard = (card) => {
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
  const requestDeleteCard = (cardId) => {
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
  const openCardMenu = (card, x, y) => {
    if (readOnly) {
      return;
    }
    const actions = {
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
  const addCardFromComposer = async (value, createNote) => {
    if (readOnly || !composer) {
      return;
    }
    if (composer.cardId) {
      commit((current) => updateCard(current, composer.cardId, value));
    } else if (createNote && onCreateLinkedNote) {
      const linkedContent = await onCreateLinkedNote(composer.columnId, value);
      commit((current) => addCard(current, composer.columnId, linkedContent));
    } else {
      commit((current) => addCard(current, composer.columnId, value));
    }
    setComposer(null);
  };
  const deleteColumnFromBoard = (columnId) => {
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
  return /* @__PURE__ */ jsxs("div", { ref: viewRef, className: `react-kanban-view ${className ?? ""}`.trim(), children: [
    /* @__PURE__ */ jsxs("div", { className: "react-kanban-toolbar", children: [
      /* @__PURE__ */ jsx("h2", { children: title }),
      /* @__PURE__ */ jsxs("span", { className: "status", children: [
        workingBoard.columns.reduce((sum, column) => sum + column.cards.length, 0),
        " cards"
      ] })
    ] }),
    /* @__PURE__ */ jsxs(DragDropProvider, { sensors: dragSensors, onDragStart, onDragOver, onDragEnd, children: [
      /* @__PURE__ */ jsx("div", { className: "react-kanban-board", children: workingBoard.columns.map((column, index) => /* @__PURE__ */ jsx(
        ColumnView,
        {
          index,
          column,
          readOnly,
          renderCard,
          renderIcon,
          onRenameColumn: (columnId, title2) => commit((current) => renameColumn(current, columnId, title2)),
          onOpenCard: openCard,
          onToggleComplete: (cardId) => commit((current) => toggleCardCompletion(current, cardId)),
          onOpenCardMenu: openCardMenu,
          onStartAddCard: (columnId) => {
            const target = findColumnById(workingBoard, columnId);
            if (target) {
              setComposer({ columnId, title: `Add card to ${target.title}`, content: "" });
            }
          },
          menuOpen: openMenuColumnId === column.id,
          onToggleMenu: setOpenMenuColumnId,
          onMoveColumnLeft: (columnId) => {
            commit((current) => moveColumn(current, columnId, -1));
            setOpenMenuColumnId(null);
          },
          onMoveColumnRight: (columnId) => {
            commit((current) => moveColumn(current, columnId, 1));
            setOpenMenuColumnId(null);
          },
          onDeleteColumn: deleteColumnFromBoard,
          canMoveLeft: index > 0,
          canMoveRight: index < workingBoard.columns.length - 1
        },
        column.id
      )) }),
      /* @__PURE__ */ jsx(DragOverlay, { children: (source) => {
        const cardId = source?.id != null ? String(source.id) : activeCardId;
        const card = cardId ? findCardById(workingBoard, cardId) : null;
        return card ? /* @__PURE__ */ jsx("div", { className: `react-kanban-card ${card.completed ? "is-completed" : ""} is-dragging`, children: /* @__PURE__ */ jsx("div", { className: "react-kanban-card-markdown", children: renderCard(card, card.content) }) }) : null;
      } })
    ] }),
    !readOnly && cardMenu ? /* @__PURE__ */ jsx(CardMenu, { x: cardMenu.x, y: cardMenu.y, onEdit: () => {
      const card = findCardById(workingBoard, cardMenu.cardId);
      setCardMenu(null);
      if (card) openCard(card);
    }, onDelete: () => {
      const card = findCardById(workingBoard, cardMenu.cardId);
      setCardMenu(null);
      if (card) requestDeleteCard(card.id);
    }, onClose: () => setCardMenu(null) }) : null,
    !readOnly && composer ? /* @__PURE__ */ jsx(ComposerDialog, { title: composer.title, label: "Use markdown, links, and line breaks. Cmd/Ctrl+Enter saves.", submitLabel: composer.cardId ? "Save card" : "Add card", initialValue: composer.content, placeholder: composer.cardId ? "Edit the card content..." : "Write the card content...", allowCreateNote: !composer.cardId && Boolean(onCreateLinkedNote), onCancel: () => setComposer(null), onSubmit: addCardFromComposer }) : null,
    !readOnly && confirmDialog ? /* @__PURE__ */ jsx(ConfirmDialog, { ...confirmDialog, onCancel: () => setConfirmDialog(null) }) : null
  ] });
}

// src/board/markdown.ts
var FRONTMATTER_DELIMITER = "---";
function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function normalizeTitle(text) {
  return text.replace(/^#+\s*/, "").trim();
}
function isListItem(line) {
  return /^\s*[-*+]\s+/.test(line);
}
function stripListMarker(line) {
  return line.replace(/^\s*[-*+]\s+/, "").trimEnd();
}
function parseCardMarker(line) {
  const match = /^\s*[-*+]\s+\[( |x|X)\]\s*(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  return {
    completed: match[1].toLowerCase() === "x",
    content: match[2]
  };
}
function indentCardContent(content) {
  const lines = content.split(/\r?\n/);
  return lines.map((line, index) => {
    if (index === 0) {
      return line;
    }
    return line.length === 0 ? "  " : `  ${line}`;
  }).join("\n").trimEnd();
}
function parseKanbanMarkdown(content) {
  const lines = content.split(/\r?\n/);
  let index = 0;
  const frontmatter = [];
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
  const columns = [];
  let currentColumn = null;
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
function serializeKanbanMarkdown(board) {
  const parts = [];
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
      parts.push(`- [ ] ${indentCardContent(card.content)}`);
    });
    if (completedCards.length > 0) {
      parts.push("", "---", "");
      completedCards.forEach((card) => {
        parts.push(`- [x] ${indentCardContent(card.content)}`);
      });
    }
    parts.push("");
  });
  return parts.join("\n").replace(/\n{3,}$/g, "\n\n").trimEnd() + "\n";
}
function createStarterBoard() {
  return serializeKanbanMarkdown({
    frontmatter: ["---", "kanban-plugin: board", "---"],
    columns: [
      {
        id: createId("column"),
        title: "To Do",
        cards: [{ id: createId("card"), content: "Capture the first task", completed: false }]
      },
      { id: createId("column"), title: "Doing", cards: [] },
      { id: createId("column"), title: "Done", cards: [] }
    ]
  });
}

// src/board/index.ts
var KanbanBoard2 = KanbanBoard;
export {
  KanbanBoard as Board,
  KanbanBoard2 as KanbanBoard,
  addCard,
  createCardId,
  createStarterBoard,
  deleteCard,
  deleteColumn,
  findCardById,
  findColumnByCardId,
  findColumnById,
  moveCard,
  moveColumn,
  moveColumnByIndex,
  parseKanbanMarkdown,
  renameColumn,
  serializeKanbanMarkdown,
  toggleCardCompletion,
  updateCard
};
//# sourceMappingURL=index.mjs.map
