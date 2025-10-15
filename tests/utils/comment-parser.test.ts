import { parseComments, annotationToComment } from "../../utils/comment-parser";
import { AnnotationData } from "../../utils/old/annotation-service";

describe("comment-parser", () => {
  describe("parseComments", () => {
    it("should parse a simple comment with title and body", () => {
      const text = "This is a title. This is the body:";
      const result = parseComments(text);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("This is a title.");
      expect(result[0].body).toBe("This is the body:");
      expect(result[0].indices).toHaveLength(8); // "This is a title. This is the body:"
    });

    it("should handle multiple comments", () => {
      const text = `First title. First body:

Some regular text here.

Second title. Second body:`;

      const result = parseComments(text);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("First title.");
      expect(result[0].body).toBe("First body:");
      expect(result[1].title).toBe("Second title.");
      expect(result[1].body).toBe("Second body:");
    });

    it("should skip lines starting with #", () => {
      const text = `# Heading

This is a title. This is the body:`;

      const result = parseComments(text);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("This is a title.");
    });

    it("should remove wiki links from text", () => {
      const text = "This is a [[link]] title. Body text:";
      const result = parseComments(text);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("This is a  title.");
      expect(result[0].body).toBe("Body text:");
    });

    it("should handle text without colons", () => {
      const text = `Regular paragraph without colons.
Another line without colon ending`;

      const result = parseComments(text);

      expect(result).toHaveLength(0);
    });

    it("should handle lines ending with colon but no period", () => {
      const text = "No period here:";

      const result = parseComments(text);

      expect(result).toHaveLength(0);
    });

    it("should handle empty text", () => {
      const result = parseComments("");
      expect(result).toHaveLength(0);
    });

    it("should handle text with only whitespace", () => {
      const result = parseComments("   \n  \n  ");
      expect(result).toHaveLength(0);
    });

    it("should track word indices correctly", () => {
      const text = `Regular text here.

Title word. Body word:`;

      const result = parseComments(text);

      expect(result).toHaveLength(1);
      expect(result[0].indices[0]).toBe(3); // First index after "Regular text here"
      expect(result[0].indices.length).toBe(4); // "Title word Body word"
    });

    it("should handle multiple spaces between words", () => {
      const text = "Title   word. Body   word:";

      const result = parseComments(text);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Title   word.");
      expect(result[0].body).toBe("Body   word:");
    });

    it("should handle complex wiki link patterns", () => {
      const text = "Title with [[@Tx123]] link. Body with [[@Ix456]]:";

      const result = parseComments(text);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Title with  link.");
      expect(result[0].body).toBe("Body with :");
    });
  });

  describe("annotationToComment", () => {
    it("should convert annotation to comment", () => {
      const annotation: AnnotationData = {
        id: "c1",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Display text",
        src_txt_start: "Start",
        src_txt_end: "End",
        src_txt: "Full text content",
        src_range: [0, 1, 2],
        src_txt_display_range: [0, 1],
        target: "target.md",
        target_txt_display: "Target display",
        target_txt_start: "Target start",
        target_txt_end: "Target end",
        target_txt: "Target text",
        target_range: [0, 1],
        target_txt_display_range: [0, 1],
      };

      const result = annotationToComment(annotation);

      expect(result.title).toBe("Display text");
      expect(result.body).toBe("Full text content");
      expect(result.indices).toEqual([0, 1, 2]);
    });

    it("should handle annotation with empty arrays", () => {
      const annotation: AnnotationData = {
        id: "c2",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Title",
        src_txt_start: "",
        src_txt_end: "",
        src_txt: "Body",
        src_range: [],
        src_txt_display_range: [],
        target: "target.md",
        target_txt_display: "",
        target_txt_start: "",
        target_txt_end: "",
        target_txt: "",
        target_range: [],
        target_txt_display_range: [],
      };

      const result = annotationToComment(annotation);

      expect(result.title).toBe("Title");
      expect(result.body).toBe("Body");
      expect(result.indices).toEqual([]);
    });

    it("should preserve large index arrays", () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => i);
      const annotation: AnnotationData = {
        id: "c3",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Display",
        src_txt_start: "Start",
        src_txt_end: "End",
        src_txt: "Text",
        src_range: largeArray,
        src_txt_display_range: [0],
        target: "target.md",
        target_txt_display: "",
        target_txt_start: "",
        target_txt_end: "",
        target_txt: "",
        target_range: [],
        target_txt_display_range: [],
      };

      const result = annotationToComment(annotation);

      expect(result.indices).toEqual(largeArray);
      expect(result.indices.length).toBe(100);
    });
  });
});
