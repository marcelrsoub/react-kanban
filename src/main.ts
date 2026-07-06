import { App, MarkdownRenderChild, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { BoardView } from "./BoardView";
import { createStarterBoard, parseKanbanMarkdown } from "./markdown";

type BoardRenderProps = {
  app: App;
  file: TFile;
  content: string;
};

class KanbanRenderChild extends MarkdownRenderChild {
  private root: Root | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly props: BoardRenderProps
  ) {
    super(containerEl);
  }

  onload() {
    this.containerEl.replaceChildren();
    this.root = createRoot(this.containerEl);
    this.root.render(
      React.createElement(BoardView, {
        app: this.props.app,
        component: this,
        file: this.props.file,
        content: this.props.content,
        onSave: async (nextContent: string) => {
          await this.props.app.vault.modify(this.props.file, nextContent);
        }
      })
    );
  }

  onunload() {
    this.root?.unmount();
    this.root = null;
  }
}

export default class ReactKanbanPlugin extends Plugin {
  private isAutoSwitching = false;

  async onload() {
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      if (ctx.frontmatter?.["kanban-plugin"] !== "board") {
        return;
      }

      const abstract = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(abstract instanceof TFile)) {
        return;
      }

      const content = await this.app.vault.read(abstract);
      if (!parseKanbanMarkdown(content)) {
        return;
      }

      el.replaceChildren();
      const shell = document.createElement("div");
      shell.className = "react-kanban-note-shell";
      el.appendChild(shell);
      ctx.addChild(
        new KanbanRenderChild(shell, {
          app: this.app,
          file: abstract,
          content
        })
      );
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
      this.app.workspace.on("file-open", (file) => {
        if (!file || file.extension !== "md") {
          return;
        }

        void this.tryAutoOpen(file);
      })
    );

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
    if (!recentLeaf) {
      return;
    }

    await this.openBoard(file, recentLeaf);
  }

  private async openBoard(file: TFile, leaf = this.app.workspace.getMostRecentLeaf()) {
    const targetLeaf = leaf ?? this.app.workspace.getLeaf(true);
    this.isAutoSwitching = true;
    try {
      await targetLeaf.setViewState({
        active: true,
        type: "markdown",
        state: {
          file: file.path,
          mode: "preview"
        }
      } as any);
    } finally {
      this.isAutoSwitching = false;
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
