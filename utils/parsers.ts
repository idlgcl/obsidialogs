export interface Comment {
  title: string;
  body: string;
  source: string;
  filePath: string;
}

export class CommentParser {
  parseLineAsComment(
    line: string,
    filename: string,
    fullPath: string
  ): Comment | null {
    // Remove wiki links
    const cleanLine = line.replace(/\[\[[^\]]+\]\]/g, "");

    if (cleanLine.startsWith("#")) {
      return null;
    }

    if (!cleanLine.endsWith(":")) {
      return null;
    }

    // Comment pattern "Title. body:"
    const pattern = /^(.*?)\.\s+(.*)$/;
    const match = cleanLine.match(pattern);

    if (!match) {
      return null;
    }

    const [, title, description] = match;

    return {
      title: title.trim() + ".",
      body: description.trim(),
      source: filename,
      filePath: fullPath,
    };
  }
}
