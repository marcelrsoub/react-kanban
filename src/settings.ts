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
