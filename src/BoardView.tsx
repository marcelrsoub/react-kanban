import { useEffect, useMemo, useRef } from "react";
import { MarkdownRenderer, Menu, Notice, normalizePath, Platform, setIcon, type App, type Component, type TFile } from "obsidian";
import { KanbanBoard, type CardMenuActions } from "./board";
import { parseKanbanMarkdown, serializeKanbanMarkdown } from "./board/markdown";
import type { KanbanCard } from "./board/types";
import type { ReactKanbanSettings } from "./settings";

type BoardViewProps = {
  app: App;
  component: Component;
  file: TFile;
  content: string;
  getNoteCreationSettings: () => ReactKanbanSettings;
  onSave: (nextContent: string) => Promise<void>;
};

function clearElementChildren(element: HTMLElement) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
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

function getNewNoteFolder(file: TFile, settings: ReactKanbanSettings) {
  const boardFolder = file.parent?.path ?? "";
  if (settings.newNoteFolderMode === "board-subfolder") {
    const boardFolderName = sanitizeFileName(file.basename);
    return normalizePath(boardFolder ? `${boardFolder}/${boardFolderName}` : boardFolderName);
  }

  if (settings.newNoteFolderMode === "custom-folder") {
    const customFolder = settings.newNoteCustomFolder.trim().replace(/^\/+|\/+$/g, "");
    if (customFolder) {
      return normalizePath(customFolder);
    }
  }

  return boardFolder;
}

async function ensureFolderExists(app: App, folder: string) {
  if (!folder) {
    return;
  }

  let current = "";
  for (const part of folder.split("/").filter(Boolean)) {
    current = normalizePath(current ? `${current}/${part}` : part);
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

function MarkdownCardContent({
  app,
  card,
  component,
  sourcePath
}: {
  app: App;
  card: KanbanCard;
  component: Component;
  sourcePath: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    let cancelled = false;
    clearElementChildren(element);
    const handleInternalLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a.internal-link");
      const linkText = link?.dataset.href;
      if (!link || !linkText || !element.contains(link)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void app.workspace.openLinkText(linkText, sourcePath, event.metaKey || event.ctrlKey ? "tab" : false);
    };

    element.addEventListener("click", handleInternalLinkClick, true);
    void MarkdownRenderer.render(app, card.content || " ", element, sourcePath, component).then(() => {
      if (cancelled || !element.isConnected) {
        clearElementChildren(element);
      }
    });

    return () => {
      cancelled = true;
      element.removeEventListener("click", handleInternalLinkClick, true);
    };
  }, [app, card.content, component, sourcePath]);

  return <div ref={ref} />;
}

export function BoardView({ app, file, content, component, getNoteCreationSettings, onSave }: BoardViewProps) {
  const board = useMemo(() => parseKanbanMarkdown(content), [content]);

  const createLinkedNote = async (columnId: string, cardContent: string) => {
    void columnId;
    const title = getCardTitle(cardContent);
    const settings = getNoteCreationSettings();
    const baseName = sanitizeFileName(settings.newNoteNameMode === "card-only" ? title : `${file.basename} - ${title}`);
    const folder = getNewNoteFolder(file, settings);
    let notePath = normalizePath(folder ? `${folder}/${baseName}.md` : `${baseName}.md`);
    let suffix = 2;

    while (await app.vault.adapter.exists(notePath)) {
      notePath = normalizePath(folder ? `${folder}/${baseName} ${suffix}.md` : `${baseName} ${suffix}.md`);
      suffix += 1;
    }

    try {
      await ensureFolderExists(app, folder);
      const note = await app.vault.create(notePath, cardContent);
      return app.fileManager.generateMarkdownLink(note, file.path, undefined, title);
    } catch (error) {
      const message = `Could not create note: ${error instanceof Error ? error.message : "Unknown error"}`;
      new Notice(message);
      throw error;
    }
  };

  const openCardContextMenu = (card: KanbanCard, x: number, y: number, actions: CardMenuActions) => {
    const menu = new Menu();
    if (Platform.isDesktopApp) {
      menu.setUseNativeMenu(true);
    }

    menu
      .addItem((item) => item.setTitle("Edit card").setIcon("pencil").onClick(actions.edit))
      .addItem((item) => item.setTitle("Delete card").setIcon("trash").onClick(actions.remove))
      .showAtPosition({ x, y });
    void card;
  };

  const renderIcon = (name: string, element: HTMLElement) => {
    clearElementChildren(element);
    setIcon(element, name);
  };

  return (
    <KanbanBoard
      board={board}
      title={file.basename}
      onChange={(nextBoard) => onSave(serializeKanbanMarkdown(nextBoard))}
      renderCard={(card) => <MarkdownCardContent app={app} card={card} component={component} sourcePath={file.path} />}
      onCardContextMenu={openCardContextMenu}
      onCreateLinkedNote={(columnId, cardContent) => createLinkedNote(columnId, cardContent)}
      renderIcon={renderIcon}
      onNotice={(message) => new Notice(message)}
    />
  );
}
