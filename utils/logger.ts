export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  data?: any;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  log(message: string, data?: any): void {
    this.addEntry("INFO", message, data);
  }

  info(message: string, data?: any): void {
    this.addEntry("INFO", message, data);
  }

  warn(message: string, data?: any): void {
    this.addEntry("WARN", message, data);
  }

  error(message: string, data?: any): void {
    this.addEntry("ERROR", message, data);
  }

  private addEntry(level: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getFormattedLogs(): string {
    return this.logs
      .map((entry) => {
        const date = new Date(entry.timestamp);
        const timestamp = date.toLocaleString();
        const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
        return `[${timestamp}] [${entry.level}] ${entry.message}${dataStr}`;
      })
      .join("\n");
  }

  clear(): void {
    this.logs = [];
  }

  async copyToClipboard(): Promise<boolean> {
    const formattedLogs = this.getFormattedLogs();

    if (!formattedLogs) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(formattedLogs);
      return true;
    } catch (error) {
      console.error("Failed to copy logs to clipboard:", error);
      return false;
    }
  }
}
