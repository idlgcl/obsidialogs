export interface Comment {
  title: string;
  body: string;
  source: string;
  filePath: string;
}

export interface CommentWithPosition extends Comment {
  startPos: number;
  endPos: number;
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

  findAllCommentsInLine(
    line: string,
    filename: string,
    fullPath: string
  ): CommentWithPosition[] {
    const comments: CommentWithPosition[] = [];

    // Remove wiki links for parsing but keep original line for positions
    const cleanLine = line.replace(/\[\[[^\]]+\]\]/g, "");

    if (cleanLine.startsWith("#")) {
      return comments;
    }

    // Split by ":" to find potential comment segments
    const segments = cleanLine.split(":");

    // The last segment after the final ":" is not part of a comment
    if (segments.length < 2) {
      return comments;
    }

    let currentPos = 0;

    // Process all segments except the last one (which is after the final ":")
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const segmentStart = currentPos;
      const segmentEnd = currentPos + segment.length;

      // Comment pattern "Title. body"
      const pattern = /^(.*?)\.\s+(.+)$/;
      const match = segment.match(pattern);

      if (match) {
        const [, title, description] = match;

        comments.push({
          title: title.trim() + ".",
          body: description.trim(),
          source: filename,
          filePath: fullPath,
          startPos: segmentStart,
          endPos: segmentEnd + 1, // +1 for the ":"
        });
      }

      // Move position past this segment and the ":"
      currentPos = segmentEnd + 1;
    }

    return comments;
  }

  findCommentAtPosition(
    line: string,
    charPos: number,
    filename: string,
    fullPath: string
  ): CommentWithPosition | null {
    const comments = this.findAllCommentsInLine(line, filename, fullPath);

    for (const comment of comments) {
      if (charPos >= comment.startPos && charPos <= comment.endPos) {
        return comment;
      }
    }

    return null;
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
