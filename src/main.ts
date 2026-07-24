import { App, MarkdownRenderChild, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, type SettingDefinitionItem } from "obsidian";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { BoardView } from "./BoardView";
import { createStarterBoard, parseKanbanMarkdown } from "./markdown";
import {
  DEFAULT_SETTINGS,
  isNewNoteFolderMode,
  isNewNoteNameMode,
  type NewNoteFolderMode,
  type NewNoteNameMode,
  type ReactKanbanSettings
} from "./settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type BoardRenderProps = {
  app: App;
  file: TFile;
  content: string;
  getNoteCreationSettings: () => ReactKanbanSettings;
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
        getNoteCreationSettings: this.props.getNoteCreationSettings,
        onSave: async (nextContent: string) => {
          await this.props.app.vault.modify(this.props.file, nextContent);
        }
      })
    );
  }

  onunload() {
    this.root?.unmount();
    this.root = null;

    const viewEl = this.containerEl.closest<HTMLElement>(".markdown-preview-view, .markdown-reading-view");
    const sourcePath = this.containerEl.dataset.sourcePath;
    this.containerEl.remove();
    if (viewEl && !viewEl.querySelector(".react-kanban-note-shell")) {
      viewEl.classList.remove("react-kanban-embedded");
      if (viewEl.dataset.reactKanbanSourcePath === sourcePath) {
        delete viewEl.dataset.reactKanbanSourcePath;
      }
    }
  }
}

export default class ReactKanbanPlugin extends Plugin {
  settings: ReactKanbanSettings = { ...DEFAULT_SETTINGS };
  private isAutoSwitching = false;
  private activeFilePath: string | null = null;
  private mountedBoardChildren = new Set<KanbanRenderChild>();
  private renderingViews = new WeakMap<HTMLElement, string>();
  private renderGeneration = 0;

  async onload() {
    const loadedData: unknown = await this.loadData();
    const savedSettings = isRecord(loadedData) ? loadedData : {};
    this.settings = {
      newNoteFolderMode: isNewNoteFolderMode(savedSettings.newNoteFolderMode)
        ? savedSettings.newNoteFolderMode
        : DEFAULT_SETTINGS.newNoteFolderMode,
      newNoteCustomFolder: typeof savedSettings.newNoteCustomFolder === "string"
        ? savedSettings.newNoteCustomFolder
        : DEFAULT_SETTINGS.newNoteCustomFolder,
      newNoteNameMode: isNewNoteNameMode(savedSettings.newNoteNameMode)
        ? savedSettings.newNoteNameMode
        : DEFAULT_SETTINGS.newNoteNameMode
    };
    this.addSettingTab(new ReactKanbanSettingTab(this.app, this));
    this.clearKanbanViewState();
    this.activeFilePath = this.app.workspace.getActiveFile()?.path ?? null;

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      const viewEl = el.closest<HTMLElement>(".markdown-preview-view, .markdown-reading-view");
      if (!viewEl) {
        return;
      }

      const existingShells = Array.from(viewEl.querySelectorAll<HTMLElement>(".react-kanban-note-shell"));
      if (viewEl.dataset.reactKanbanSourcePath === ctx.sourcePath && existingShells.length === 1) {
        return;
      }

      if (this.renderingViews.get(viewEl) === ctx.sourcePath) {
        return;
      }

      existingShells.forEach((shell) => shell.remove());
      viewEl.classList.remove("react-kanban-embedded");
      delete viewEl.dataset.reactKanbanSourcePath;
      this.renderingViews.delete(viewEl);

      const abstract = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(abstract instanceof TFile)) {
        return;
      }

      const generation = this.renderGeneration;
      this.renderingViews.set(viewEl, ctx.sourcePath);
      viewEl.dataset.reactKanbanSourcePath = ctx.sourcePath;
      try {
        const content = await this.app.vault.read(abstract);
        if (!parseKanbanMarkdown(content)) {
          return;
        }

        if (generation !== this.renderGeneration || this.renderingViews.get(viewEl) !== ctx.sourcePath) {
          return;
        }

        viewEl.classList.add("react-kanban-embedded");

        const shell = viewEl.createDiv({ cls: "react-kanban-note-shell" });
        shell.dataset.sourcePath = ctx.sourcePath;
        ctx.addChild(
          new KanbanRenderChild(shell, {
            app: this.app,
            file: abstract,
            content,
            getNoteCreationSettings: () => this.settings
          })
        );
      } finally {
        if (this.renderingViews.get(viewEl) === ctx.sourcePath) {
          this.renderingViews.delete(viewEl);
        }
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
      this.app.workspace.on("file-open", (file) => {
        const nextPath = file?.path ?? null;
        if (nextPath !== this.activeFilePath) {
          this.clearKanbanViewState();
        }
        this.activeFilePath = nextPath;

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

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile?.extension === "md") {
      void this.tryAutoOpen(activeFile);
    }
  }

  private clearKanbanViewState() {
    this.renderGeneration += 1;
    this.mountedBoardChildren.forEach((child) => child.unload());
    this.mountedBoardChildren.clear();
    document.querySelectorAll<HTMLElement>(".react-kanban-note-shell").forEach((shell) => shell.remove());
    document.querySelectorAll<HTMLElement>(".react-kanban-embedded").forEach((viewEl) => {
      viewEl.classList.remove("react-kanban-embedded");
      delete viewEl.dataset.reactKanbanSourcePath;
    });
    this.renderingViews = new WeakMap<HTMLElement, string>();
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

    await this.openBoard(file, recentLeaf, content);
  }

  private async openBoard(
    file: TFile,
    leaf = this.app.workspace.getMostRecentLeaf(),
    content?: string
  ) {
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
      });
      const boardContent = content ?? (await this.app.vault.read(file));
      if (parseKanbanMarkdown(boardContent)) {
        await this.mountBoardInLeaf(file, targetLeaf, boardContent);
      }
    } finally {
      this.isAutoSwitching = false;
    }
  }

  private async mountBoardInLeaf(file: TFile, leaf: WorkspaceLeaf, content: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      const containerEl = leaf.view.containerEl;
      const viewEl = containerEl.matches(".markdown-preview-view, .markdown-reading-view")
        ? containerEl
        : containerEl.querySelector<HTMLElement>(".markdown-preview-view, .markdown-reading-view");
      if (!viewEl) {
        continue;
      }

      const existingShells = Array.from(viewEl.querySelectorAll<HTMLElement>(".react-kanban-note-shell"));
      if (viewEl.dataset.reactKanbanSourcePath === file.path && existingShells.length === 1) {
        return;
      }

      existingShells.forEach((shell) => shell.remove());
      viewEl.classList.remove("react-kanban-embedded");
      delete viewEl.dataset.reactKanbanSourcePath;

      const shell = viewEl.createDiv({ cls: "react-kanban-note-shell" });
      shell.dataset.sourcePath = file.path;
      viewEl.classList.add("react-kanban-embedded");
      viewEl.dataset.reactKanbanSourcePath = file.path;

      const child = new KanbanRenderChild(shell, {
        app: this.app,
        file,
        content,
        getNoteCreationSettings: () => this.settings
      });
      this.mountedBoardChildren.add(child);
      this.addChild(child);
      return;
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

class ReactKanbanSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ReactKanbanPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<keyof ReactKanbanSettings>[] {
    return [
      {
        type: "group",
        heading: "New card notes",
        items: [
          {
            name: "New card note location",
            desc: "Choose where notes created from the Add card dialog should be stored.",
            control: {
              type: "dropdown",
              key: "newNoteFolderMode",
              defaultValue: DEFAULT_SETTINGS.newNoteFolderMode,
              options: {
                "board-folder": "Same folder as the board",
                "board-subfolder": "Subfolder named after the board",
                "custom-folder": "Custom vault folder"
              }
            }
          },
          {
            name: "Custom note folder",
            desc: "Vault-relative path, for example Projects/Kanban cards.",
            visible: () => this.plugin.settings.newNoteFolderMode === "custom-folder",
            control: {
              type: "folder",
              key: "newNoteCustomFolder",
              defaultValue: DEFAULT_SETTINGS.newNoteCustomFolder,
              placeholder: "Projects/Kanban cards",
              includeRoot: true
            }
          },
          {
            name: "New card note filename",
            desc: "Choose how the Markdown note filename is generated.",
            control: {
              type: "dropdown",
              key: "newNoteNameMode",
              defaultValue: DEFAULT_SETTINGS.newNoteNameMode,
              options: {
                "board-and-card": "Board name - card title",
                "card-only": "Card title only"
              }
            }
          },
          {
            name: "About new card notes",
            desc: "These options apply to new notes created from the Add card dialog. Existing linked cards are unchanged."
          }
        ]
      }
    ];
  }

  async setControlValue(key: string, value: unknown) {
    if (key === "newNoteFolderMode" && isNewNoteFolderMode(value)) {
      this.plugin.settings.newNoteFolderMode = value;
    } else if (key === "newNoteCustomFolder" && typeof value === "string") {
      this.plugin.settings.newNoteCustomFolder = value.trim();
    } else if (key === "newNoteNameMode" && isNewNoteNameMode(value)) {
      this.plugin.settings.newNoteNameMode = value;
    } else {
      return;
    }

    await this.plugin.saveData(this.plugin.settings);
    this.update();
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("React Kanban").setHeading();

    new Setting(containerEl)
      .setName("New card note location")
      .setDesc("Choose where notes created from the Add card dialog should be stored.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("board-folder", "Same folder as the board")
          .addOption("board-subfolder", "Subfolder named after the board")
          .addOption("custom-folder", "Custom vault folder")
          .setValue(this.plugin.settings.newNoteFolderMode)
          .onChange(async (value) => {
            this.plugin.settings.newNoteFolderMode = value as NewNoteFolderMode;
            await this.plugin.saveData(this.plugin.settings);
            this.display();
          })
      );

    if (this.plugin.settings.newNoteFolderMode === "custom-folder") {
      new Setting(containerEl)
        .setName("Custom note folder")
        .setDesc("Vault-relative path, for example Projects/Kanban cards.")
        .addText((text) =>
          text
            .setPlaceholder("Projects/Kanban cards")
            .setValue(this.plugin.settings.newNoteCustomFolder)
            .onChange(async (value) => {
              this.plugin.settings.newNoteCustomFolder = value.trim();
              await this.plugin.saveData(this.plugin.settings);
            })
        );
    }

    new Setting(containerEl)
      .setName("New card note filename")
      .setDesc("Choose how the Markdown note filename is generated.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("board-and-card", "Board name - card title")
          .addOption("card-only", "Card title only")
          .setValue(this.plugin.settings.newNoteNameMode)
          .onChange(async (value) => {
            this.plugin.settings.newNoteNameMode = value as NewNoteNameMode;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    containerEl.createEl("p", {
      text: "These options apply to new notes created from the Add card dialog. Existing linked cards are unchanged."
    });
  }
}
