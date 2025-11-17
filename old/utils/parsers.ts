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

export interface NoteLinkInfo {
  linkText: string;
  target: string;
  hasTextAround: boolean;
  filePath: string;
  source: string;
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

export function detectNoteLink(
  line: string,
  filename: string,
  fullPath: string
): NoteLinkInfo | null {
  const linkPattern = /\[\[@([TFI]x[^\]]+)\]\]/;
  const match = line.match(linkPattern);

  if (!match) {
    return null;
  }

  const linkText = match[0];
  const target = match[1];

  // Check if link is alone
  const trimmedLine = line.trim();
  const hasTextAround = trimmedLine !== linkText;

  return {
    linkText,
    target,
    hasTextAround,
    filePath: fullPath,
    source: filename,
  };
}
