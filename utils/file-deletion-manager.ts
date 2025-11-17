import { App, TFile } from "obsidian";
import { FileTracker } from "./file-tracker";

export class FileDeletionManager {
  private app: App;
  private fileTracker: FileTracker;
  private getDeletionDelay: () => number;
  private onFileDeleted: () => Promise<void>;
  private pendingDeletions: Map<string, number>;

  constructor(
    app: App,
    fileTracker: FileTracker,
    getDeletionDelay: () => number,
    onFileDeleted: () => Promise<void>
  ) {
    this.app = app;
    this.fileTracker = fileTracker;
    this.getDeletionDelay = getDeletionDelay;
    this.onFileDeleted = onFileDeleted;
    this.pendingDeletions = new Map();
  }

  cancelDeletion(fileName: string): void {
    const timerId = this.pendingDeletions.get(fileName);
    if (timerId) {
      window.clearTimeout(timerId);
      this.pendingDeletions.delete(fileName);
    }
  }

  checkAllTrackedFiles(): void {
    const trackedFiles = this.fileTracker.getAllTrackedFiles();

    trackedFiles.forEach((tracked) => {
      const fileName = tracked.fileName;

      if (!this.isFileOpen(fileName) && !this.isFilePinned(fileName)) {
        this.scheduleFileDeletion(fileName);
      }
    });
  }

  destroy(): void {
    this.pendingDeletions.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    this.pendingDeletions.clear();
  }

  private isFileOpen(fileName: string): boolean {
    let isOpen = false;

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && "file" in view) {
        const file = (view as any).file;
        if (file?.name === fileName) {
          isOpen = true;
        }
      }
    });

    return isOpen;
  }

  private isFilePinned(fileName: string): boolean {
    let isPinned = false;

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && "file" in view) {
        const file = (view as any).file;
        if (file?.name === fileName) {
          const viewState = leaf.getViewState();
          if (viewState.pinned) {
            isPinned = true;
          }
        }
      }
    });

    return isPinned;
  }

  private scheduleFileDeletion(fileName: string): void {
    if (this.pendingDeletions.has(fileName)) {
      window.clearTimeout(this.pendingDeletions.get(fileName));
    }

    const delayMs = this.getDeletionDelay() * 1000;

    // Schedule deletion
    const timerId = window.setTimeout(async () => {
      await this.checkAndDeleteFile(fileName);
      this.pendingDeletions.delete(fileName);
    }, delayMs);

    this.pendingDeletions.set(fileName, timerId);
  }

  private async checkAndDeleteFile(fileName: string): Promise<void> {
    // delete if:
    // File is tracked
    // File is not open anywhere
    // File is not pinned

    if (!this.fileTracker.isTracked(fileName)) {
      return;
    }

    if (this.isFileOpen(fileName)) {
      return;
    }

    if (this.isFilePinned(fileName)) {
      return;
    }

    await this.deleteFile(fileName);
  }

  private async deleteFile(fileName: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(fileName);

    if (!file || !(file instanceof TFile)) {
      // File deleted or doesn't exist
      this.fileTracker.untrack(fileName);
      await this.onFileDeleted();
      return;
    }

    // Untrack first
    this.fileTracker.untrack(fileName);
    await this.onFileDeleted();

    // Move to trash (not permanent delete)
    await this.app.vault.trash(file, false);
  }
}
