export type NewNoteFolderMode = "board-folder" | "board-subfolder" | "custom-folder";
export type NewNoteNameMode = "board-and-card" | "card-only";

export type ReactKanbanSettings = {
  newNoteFolderMode: NewNoteFolderMode;
  newNoteCustomFolder: string;
  newNoteNameMode: NewNoteNameMode;
};

export const DEFAULT_SETTINGS: ReactKanbanSettings = {
  newNoteFolderMode: "board-folder",
  newNoteCustomFolder: "",
  newNoteNameMode: "board-and-card"
};

export function isNewNoteFolderMode(value: unknown): value is NewNoteFolderMode {
  return value === "board-folder" || value === "board-subfolder" || value === "custom-folder";
}

export function isNewNoteNameMode(value: unknown): value is NewNoteNameMode {
  return value === "board-and-card" || value === "card-only";
}
