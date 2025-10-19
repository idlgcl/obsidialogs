export interface Comment {
  title: string;
  body: string;
  source: string;
  filePath: string;
}

export interface NoteMeta {
  linkText: string;
  target: string;
  previousWords: string;
  nextWords: string;
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

export class NoteParser {
  parseLineAsNote(
    line: string,
    filename: string,
    fullPath: string
  ): NoteMeta | null {
    if (line.trim().startsWith("#")) {
      return null;
    }

    // note link pattern [[@TxXXX]]
    const linkPattern = /\[\[@(Tx[^\]]+)\]\]/;
    const linkMatch = line.match(linkPattern);

    if (!linkMatch) {
      return null;
    }

    const linkText = linkMatch[0];
    const target = linkMatch[1];

    const words = line.split(/\s+/).filter((word) => word.length > 0);

    let linkIndex = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i].includes(linkText)) {
        linkIndex = i;
        break;
      }
    }

    if (linkIndex === -1) {
      return null;
    }

    if (linkIndex === 0) {
      return null;
    }

    if (linkIndex === words.length - 1) {
      return null;
    }

    const previousWords = words.slice(0, linkIndex).join(" ");
    const nextWords = words.slice(linkIndex + 1).join(" ");

    return {
      linkText,
      target,
      previousWords,
      nextWords,
      source: filename,
      filePath: fullPath,
    };
  }
}
