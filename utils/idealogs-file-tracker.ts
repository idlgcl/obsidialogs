export class IdealogsFileTracker {
  private files: Map<string, string> = new Map();

  track(fileName: string, articleId: string): void {
    this.files.set(fileName, articleId);
  }

  untrack(fileName: string): void {
    this.files.delete(fileName);
  }

  isTracked(fileName: string): boolean {
    return this.files.has(fileName);
  }

  getArticleId(fileName: string): string | undefined {
    return this.files.get(fileName);
  }

  clear(): void {
    this.files.clear();
  }
}
