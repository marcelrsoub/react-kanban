import { ItemView, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { BoardView } from "./BoardView";
import { createStarterBoard, parseKanbanMarkdown } from "./markdown";

const VIEW_TYPE = "react-kanban-view";

class ReactKanbanItemView extends ItemView {
  private root: Root | null = null;
  private currentFile: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ReactKanbanPlugin) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Kanban";
  }

  getIcon() {
    return "layout-board";
  }

  async onOpen() {
    this.root = createRoot(this.contentEl);
    this.containerEl.addClass("react-kanban-view-root");
    await this.render();
  }

  getState() {
    return {
      path: this.currentFile?.path ?? null
    };
  }

  async setState(state: { path?: string | null }, _result?: unknown) {
    const candidate = state.path ? this.app.vault.getAbstractFileByPath(state.path) : null;
    this.currentFile = candidate instanceof TFile ? candidate : null;
    await this.render();
  }

  async render() {
    if (!this.root) {
      return;
    }

    const file = this.currentFile ?? this.app.workspace.getActiveFile();
    if (!file) {
      this.root.render(React.createElement("div", { className: "react-kanban-empty" }, "Open a Kanban markdown file to get started."));
      return;
    }

    const content = await this.app.vault.read(file);
    this.root.render(
      React.createElement(BoardView, {
        app: this.app,
        component: this,
        file,
        content,
        onSave: async (nextContent: string) => {
          await this.app.vault.modify(file, nextContent);
        }
      })
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}

export default class ReactKanbanPlugin extends Plugin {
  private isAutoSwitching = false;

  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new ReactKanbanItemView(leaf, this));

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file || file.extension !== "md") {
          return;
        }

        void this.tryAutoOpen(file);
      })
    );

    this.app.workspace.onLayoutReady(() => {
      const file = this.app.workspace.getActiveFile();
      if (file?.extension === "md") {
        void this.tryAutoOpen(file);
      }
    });

    this.addCommand({
      id: "open-current-as-kanban",
      name: "Open current note as kanban",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          return false;
        }

        if (!this.isBoardFile(file)) {
          return false;
        }

        if (!checking) {
          void this.openBoard(file);
        }

        return true;
      }
    });

    this.addCommand({
      id: "create-new-kanban-board",
      name: "Create new kanban board",
      callback: async () => {
        const folder = this.app.workspace.getActiveFile()?.parent?.path ?? "";
        const targetPath = await this.getUniqueBoardPath(folder);
        const file = await this.app.vault.create(targetPath, createStarterBoard());
        await this.openBoard(file);
      }
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        menu.addItem((item) =>
          item
            .setTitle("Open as Kanban board")
            .setIcon("layout-board")
            .onClick(async () => {
              if (!this.isBoardFile(file)) {
                const content = await this.app.vault.read(file);
                if (!parseKanbanMarkdown(content)) {
                  new Notice("This note does not look like a Kanban board yet.");
                  return;
                }
              }
              await this.openBoard(file);
            })
        );
      })
    );
  }

  private isBoardFile(file: TFile) {
    return file.extension === "md";
  }

  private async tryAutoOpen(file: TFile) {
    if (this.isAutoSwitching) {
      return;
    }

    const content = await this.app.vault.read(file);
    if (!parseKanbanMarkdown(content)) {
      return;
    }

    const recentLeaf = this.app.workspace.getMostRecentLeaf();
    if (!recentLeaf || recentLeaf.view.getViewType?.() === VIEW_TYPE) {
      return;
    }

    this.isAutoSwitching = true;
    try {
      await this.openBoard(file, recentLeaf);
    } finally {
      this.isAutoSwitching = false;
    }
  }

  private async openBoard(file: TFile, leaf = this.app.workspace.getMostRecentLeaf()) {
    const targetLeaf = leaf ?? this.app.workspace.getLeaf(true);
    await targetLeaf.setViewState({ type: VIEW_TYPE, active: true, state: { path: file.path } });
    const view = targetLeaf.view;
    if (view instanceof ReactKanbanItemView) {
      await view.setState({ path: file.path });
    }
  }

  private async getUniqueBoardPath(folder: string) {
    const base = folder ? `${folder}/Kanban board` : "Kanban board";
    let candidate = `${base}.md`;
    let suffix = 2;
    while (await this.app.vault.adapter.exists(candidate)) {
      candidate = `${base} ${suffix}.md`;
      suffix += 1;
    }
    return candidate;
  }
}
