export interface Comment {
  title: string;
  body: string;
}

export class CommentParser {
  parse(text: string): Comment[] {
    const cleanText = text.replace(/\[\[[^\]]+\]\]/g, "");
    const segments = cleanText.split("\n");
    const pattern = /^(.*?)\.\s+(.*)$/;

    const results: Comment[] = [];

    for (const segment of segments) {
      if (segment.startsWith("#")) {
        continue;
      }

      if (!segment.endsWith(":")) {
        continue;
      }

      const match = segment.match(pattern);

      if (!match) {
        continue;
      }

      const [, title, description] = match;

      results.push({
        title: title.trim() + ".",
        body: description.trim(),
      });
    }

    return results;
  }
}
