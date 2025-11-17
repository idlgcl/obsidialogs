export interface TrackedFile {
  fileName: string;
  articleId: string;
  downloadedAt: number;
  lastAccessedAt?: number;
}

export class FileTracker {
  private files: Map<string, TrackedFile>;

  constructor() {
    this.files = new Map();
  }

  track(fileName: string, articleId: string): void {
    const trackedFile: TrackedFile = {
      fileName,
      articleId,
      downloadedAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    this.files.set(fileName, trackedFile);
  }

  untrack(fileName: string): void {
    this.files.delete(fileName);
  }

  isTracked(fileName: string): boolean {
    return this.files.has(fileName);
  }

  getTrackedFile(fileName: string): TrackedFile | undefined {
    return this.files.get(fileName);
  }

  getAllTrackedFiles(): TrackedFile[] {
    return Array.from(this.files.values());
  }

  clear(): void {
    this.files.clear();
  }

  updateLastAccessed(fileName: string): void {
    const file = this.files.get(fileName);
    if (file) {
      file.lastAccessedAt = Date.now();
    }
  }

  toJSON(): object {
    const data: Record<string, TrackedFile> = {};
    this.files.forEach((file, fileName) => {
      data[fileName] = file;
    });
    return data;
  }

  fromJSON(data: object): void {
    this.files.clear();
    if (data && typeof data === "object") {
      Object.entries(data).forEach(([fileName, fileData]) => {
        if (this.isValidTrackedFile(fileData)) {
          this.files.set(fileName, fileData as TrackedFile);
        }
      });
    }
  }

  private isValidTrackedFile(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const file = data as Partial<TrackedFile>;
    return (
      typeof file.fileName === "string" &&
      typeof file.articleId === "string" &&
      typeof file.downloadedAt === "number"
    );
  }
}
