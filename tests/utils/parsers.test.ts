import { CommentParser, detectNoteLink } from "../../utils/parsers";

describe("CommentParser", () => {
  let parser: CommentParser;

  beforeEach(() => {
    parser = new CommentParser();
  });

  describe("parseLineAsComment", () => {
    it("should parse a simple comment with title and body", () => {
      const line = "This is a title. This is the body:";
      const result = parser.parseLineAsComment(line, "test.md", "/path/test.md");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("This is a title.");
      expect(result?.body).toBe("This is the body:");
      expect(result?.source).toBe("test.md");
      expect(result?.filePath).toBe("/path/test.md");
    });

    it("should return null for lines starting with #", () => {
      const line = "# This is a title. This is the body:";
      const result = parser.parseLineAsComment(line, "test.md", "/path/test.md");

      expect(result).toBeNull();
    });

    it("should return null for lines not ending with colon", () => {
      const line = "This is a title. This is the body";
      const result = parser.parseLineAsComment(line, "test.md", "/path/test.md");

      expect(result).toBeNull();
    });

    it("should return null for lines without period separator", () => {
      const line = "This is text without period separator:";
      const result = parser.parseLineAsComment(line, "test.md", "/path/test.md");

      expect(result).toBeNull();
    });

    it("should remove wiki links before parsing", () => {
      const line = "This is a [[link]] title. Body text:";
      const result = parser.parseLineAsComment(line, "test.md", "/path/test.md");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("This is a  title.");
      expect(result?.body).toBe("Body text:");
    });

    it("should handle multiple wiki links", () => {
      const line = "Title [[link1]] text [[link2]]. Body [[link3]]:";
      const result = parser.parseLineAsComment(line, "test.md", "/path/test.md");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Title  text.");
      expect(result?.body).toBe("Body :");
    });
  });

  describe("findAllCommentsInLine", () => {
    it("should find single comment in line", () => {
      const line = "This is a title. This is the body:";
      const result = parser.findAllCommentsInLine(
        line,
        "test.md",
        "/path/test.md"
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("This is a title.");
      expect(result[0].body).toBe("This is the body");
      expect(result[0].startPos).toBe(0);
      expect(result[0].endPos).toBe(34);
    });

    it("should find multiple comments in line", () => {
      const line = "First title. First body: Second title. Second body:";
      const result = parser.findAllCommentsInLine(
        line,
        "test.md",
        "/path/test.md"
      );

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("First title.");
      expect(result[0].body).toBe("First body");
      expect(result[1].title).toBe("Second title.");
      expect(result[1].body).toBe("Second body");
    });

    it("should return empty array for lines starting with #", () => {
      const line = "# This is a title. This is the body:";
      const result = parser.findAllCommentsInLine(
        line,
        "test.md",
        "/path/test.md"
      );

      expect(result).toHaveLength(0);
    });

    it("should return empty array for lines without colons", () => {
      const line = "This is just regular text";
      const result = parser.findAllCommentsInLine(
        line,
        "test.md",
        "/path/test.md"
      );

      expect(result).toHaveLength(0);
    });

    it("should handle comments with wiki links", () => {
      const line = "Title [[link]]. Body text:";
      const result = parser.findAllCommentsInLine(
        line,
        "test.md",
        "/path/test.md"
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Title.");
      expect(result[0].body).toBe("Body text");
    });

    it("should correctly calculate positions for multiple comments", () => {
      const line = "First. Body1: Second. Body2:";
      const result = parser.findAllCommentsInLine(
        line,
        "test.md",
        "/path/test.md"
      );

      expect(result).toHaveLength(2);
      expect(result[0].startPos).toBe(0);
      expect(result[0].endPos).toBe(13); // "First. Body1:"
      expect(result[1].startPos).toBe(13);
      expect(result[1].endPos).toBe(28); // " Second. Body2:"
    });
  });

  describe("findCommentAtPosition", () => {
    it("should find comment at given position", () => {
      const line = "This is a title. This is the body:";
      const result = parser.findCommentAtPosition(
        line,
        10,
        "test.md",
        "/path/test.md"
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe("This is a title.");
      expect(result?.body).toBe("This is the body");
    });

    it("should return null when position is outside comments", () => {
      const line = "This is a title. This is the body: Some text after";
      const result = parser.findCommentAtPosition(
        line,
        40,
        "test.md",
        "/path/test.md"
      );

      expect(result).toBeNull();
    });

    it("should find correct comment when multiple comments exist", () => {
      const line = "First title. First body: Second title. Second body:";

      // Position in first comment
      const result1 = parser.findCommentAtPosition(
        line,
        5,
        "test.md",
        "/path/test.md"
      );
      expect(result1?.title).toBe("First title.");

      // Position in second comment
      const result2 = parser.findCommentAtPosition(
        line,
        30,
        "test.md",
        "/path/test.md"
      );
      expect(result2?.title).toBe("Second title.");
    });

    it("should find comment at position within second comment", () => {
      const line = "First. Body1:   Second. Body2:";
      // Position 20 is within the second comment ("Second")
      const result = parser.findCommentAtPosition(
        line,
        20,
        "test.md",
        "/path/test.md"
      );

      // Should find the second comment
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Second.");
    });
  });
});

describe("detectNoteLink", () => {
  it("should detect note link with Tx prefix", () => {
    const line = "Some text [[@Tx123]] more text";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).not.toBeNull();
    expect(result?.linkText).toBe("[[@Tx123]]");
    expect(result?.target).toBe("Tx123");
    expect(result?.hasTextAround).toBe(true);
    expect(result?.source).toBe("test.md");
    expect(result?.filePath).toBe("/path/test.md");
  });

  it("should detect note link with Fx prefix", () => {
    const line = "[[@Fx456]]";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).not.toBeNull();
    expect(result?.linkText).toBe("[[@Fx456]]");
    expect(result?.target).toBe("Fx456");
    expect(result?.hasTextAround).toBe(false);
  });

  it("should detect note link with Ix prefix", () => {
    const line = "Note: [[@Ix789]]";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).not.toBeNull();
    expect(result?.linkText).toBe("[[@Ix789]]");
    expect(result?.target).toBe("Ix789");
    expect(result?.hasTextAround).toBe(true);
  });

  it("should return null for non-matching links", () => {
    const line = "Regular [[link]] here";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).toBeNull();
  });

  it("should return null for @ without T/F/I prefix", () => {
    const line = "[[@article123]]";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).toBeNull();
  });

  it("should detect hasTextAround correctly when link is alone", () => {
    const line = "   [[@Tx123]]   ";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).not.toBeNull();
    expect(result?.hasTextAround).toBe(false);
  });

  it("should detect hasTextAround correctly when text surrounds link", () => {
    const line = "Before [[@Tx123]] after";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).not.toBeNull();
    expect(result?.hasTextAround).toBe(true);
  });

  it("should handle links with complex article IDs", () => {
    const line = "[[@Tx123-456_789]]";
    const result = detectNoteLink(line, "test.md", "/path/test.md");

    expect(result).not.toBeNull();
    expect(result?.linkText).toBe("[[@Tx123-456_789]]");
    expect(result?.target).toBe("Tx123-456_789");
  });

  it("should return null for empty line", () => {
    const result = detectNoteLink("", "test.md", "/path/test.md");
    expect(result).toBeNull();
  });

  it("should return null for line with only regular text", () => {
    const result = detectNoteLink(
      "Just some regular text",
      "test.md",
      "/path/test.md"
    );
    expect(result).toBeNull();
  });
});
