import { App } from "obsidian";
import {
  AnnotationService,
  AnnotationData,
  AnnotationsFile,
} from "../../utils/old/annotation-service";

describe("AnnotationService", () => {
  let app: App;
  let annotationService: AnnotationService;

  beforeEach(() => {
    app = new App();
    annotationService = new AnnotationService(app);
  });

  describe("ensureAnnotationsDirectory", () => {
    it("should create annotations directory if it does not exist", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);
      (app.vault as any).createFolder = jest.fn();

      await annotationService.ensureAnnotationsDirectory();

      expect(app.vault.adapter.exists).toHaveBeenCalledWith(
        ".idealogs/annotations"
      );
      expect((app.vault as any).createFolder).toHaveBeenCalledWith(".idealogs");
      expect((app.vault as any).createFolder).toHaveBeenCalledWith(
        ".idealogs/annotations"
      );
    });

    it("should not create directory if it already exists", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      (app.vault as any).createFolder = jest.fn();

      await annotationService.ensureAnnotationsDirectory();

      expect((app.vault as any).createFolder).not.toHaveBeenCalled();
    });
  });

  describe("getAnnotationsFilePath", () => {
    it("should generate correct file path", () => {
      const path = annotationService.getAnnotationsFilePath("notes/test.md");
      expect(path).toBe(".idealogs/annotations/test.annotations");
    });

    it("should handle simple file names", () => {
      const path = annotationService.getAnnotationsFilePath("test.md");
      expect(path).toBe(".idealogs/annotations/test.annotations");
    });

    it("should handle empty path", () => {
      const path = annotationService.getAnnotationsFilePath("");
      expect(path).toBe(".idealogs/annotations/unknown.annotations");
    });
  });

  describe("loadAnnotations", () => {
    it("should load existing annotations", async () => {
      const mockAnnotations: AnnotationsFile = {
        comments: { c1: {} as AnnotationData },
        notes: { n1: {} as AnnotationData },
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockAnnotations));

      const result = await annotationService.loadAnnotations("test.md");

      expect(result).toEqual(mockAnnotations);
    });

    it("should return empty structure if file does not exist", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);

      const result = await annotationService.loadAnnotations("test.md");

      expect(result).toEqual({ comments: {}, notes: {} });
    });

    it("should handle JSON parse errors gracefully", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest.fn().mockResolvedValue("invalid json");

      const result = await annotationService.loadAnnotations("test.md");

      expect(result).toEqual({ comments: {}, notes: {} });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("saveComment", () => {
    it("should save comment successfully", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      const commentData = {
        commentId: "c1",
        textDisplay: "Sample text",
        commentBody: "Comment body",
        targetArticle: "Tx123",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
        srcIndices: [0, 1, 2],
        sourceFilePath: "source.md",
      };

      const result = await annotationService.saveComment(commentData);

      expect(result).toBe("c1");
      expect(app.vault.adapter.write).toHaveBeenCalledTimes(2);
      expect(app.vault.adapter.write).toHaveBeenCalledWith(
        expect.stringContaining(".annotations"),
        expect.any(String)
      );
    });

    it("should throw error if target article is missing", async () => {
      const commentData = {
        commentId: "c1",
        textDisplay: "Sample text",
        commentBody: "Comment body",
        targetArticle: "",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
        srcIndices: [0, 1, 2],
        sourceFilePath: "source.md",
      };

      await expect(annotationService.saveComment(commentData)).rejects.toThrow(
        "Target article and source path are required"
      );
    });
  });

  describe("saveNote", () => {
    it("should save note successfully", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue("Start text content End text");
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      const noteData = {
        sourceFilePath: "source.md",
        textStart: "Start",
        textEnd: "End",
        textDisplay: "Display",
        targetArticle: "Tx123",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
      };

      const result = await annotationService.saveNote(noteData);

      expect(result).toBeDefined();
      expect(app.vault.adapter.write).toHaveBeenCalledTimes(2);
    });

    it("should throw error if source file cannot be read", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);
      app.vault.adapter.read = jest
        .fn()
        .mockRejectedValue(new Error("File not found"));

      const noteData = {
        sourceFilePath: "source.md",
        textStart: "Start",
        textEnd: "End",
        textDisplay: "Display",
        targetArticle: "Tx123",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
      };

      await expect(annotationService.saveNote(noteData)).rejects.toThrow(
        "Could not read source file"
      );
    });

    it("should throw error if text boundaries not found", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue("Some other content");

      const noteData = {
        sourceFilePath: "source.md",
        textStart: "Missing",
        textEnd: "Text",
        textDisplay: "Display",
        targetArticle: "Tx123",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
      };

      await expect(annotationService.saveNote(noteData)).rejects.toThrow(
        "Could not locate text boundaries in source file"
      );
    });
  });

  describe("deleteAnnotation", () => {
    it("should delete comment", async () => {
      const mockAnnotations: AnnotationsFile = {
        comments: { c1: {} as AnnotationData },
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockAnnotations));
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      const result = await annotationService.deleteAnnotation(
        "test.md",
        "c1",
        "comment"
      );

      expect(result).toBe(true);
      expect(app.vault.adapter.write).toHaveBeenCalled();
    });

    it("should delete note", async () => {
      const mockAnnotations: AnnotationsFile = {
        comments: {},
        notes: { n1: {} as AnnotationData },
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockAnnotations));
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      const result = await annotationService.deleteAnnotation(
        "test.md",
        "n1",
        "note"
      );

      expect(result).toBe(true);
      expect(app.vault.adapter.write).toHaveBeenCalled();
    });

    it("should return false if annotation not found", async () => {
      const mockAnnotations: AnnotationsFile = {
        comments: {},
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockAnnotations));

      const result = await annotationService.deleteAnnotation(
        "test.md",
        "nonexistent",
        "comment"
      );

      expect(result).toBe(false);
    });

    it("should return false if target path or id is empty", async () => {
      const result1 = await annotationService.deleteAnnotation(
        "",
        "c1",
        "comment"
      );
      const result2 = await annotationService.deleteAnnotation(
        "test.md",
        "",
        "comment"
      );

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe("validateComment", () => {
    it("should validate valid comment", async () => {
      const annotation: AnnotationData = {
        id: "c1",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Hello world",
        src_txt_start: "Hello",
        src_txt_end: "end",
        src_txt: "Hello world comment text end",
        src_range: [0, 1, 2, 3, 4],
        src_txt_display_range: [0, 1],
        target: "target.md",
        target_txt_display: "Target text",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_range: [0, 1],
        target_txt_display_range: [0, 1],
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue("Hello world comment text end");

      const result = await annotationService.validateComment(
        annotation,
        "source.md"
      );

      expect(result.isValid).toBe(true);
    });

    it("should invalidate if source file does not exist", async () => {
      const annotation: AnnotationData = {
        id: "c1",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Hello",
        src_txt_start: "Hello",
        src_txt_end: "end",
        src_txt: "Hello end",
        src_range: [0, 1],
        src_txt_display_range: [0],
        target: "target.md",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_range: [0, 1],
        target_txt_display_range: [0, 1],
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);

      const result = await annotationService.validateComment(
        annotation,
        "source.md"
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toContain("Source document not found");
    });

    it("should invalidate if text start not found", async () => {
      const annotation: AnnotationData = {
        id: "c1",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Missing",
        src_txt_start: "Missing",
        src_txt_end: "end",
        src_txt: "Missing end",
        src_range: [0, 1],
        src_txt_display_range: [0],
        target: "target.md",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_range: [0, 1],
        target_txt_display_range: [0, 1],
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue("Some other content");

      const result = await annotationService.validateComment(
        annotation,
        "source.md"
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toContain("Text Start not found");
    });
  });

  describe("validateNote", () => {
    it("should validate valid note", async () => {
      const annotation: AnnotationData = {
        id: "n1",
        kind: "NOTE",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Hello world",
        src_txt_start: "Hello",
        src_txt_end: "world",
        src_txt: "Hello world",
        src_range: [0, 1],
        src_txt_display_range: [0, 1],
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_range: [0, 1],
        target_txt_display_range: [0, 1],
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue("Hello world [[@Tx123]]");

      const result = await annotationService.validateNote(
        annotation,
        "source.md"
      );

      expect(result.isValid).toBe(true);
    });

    it("should invalidate if source file does not exist", async () => {
      const annotation: AnnotationData = {
        id: "n1",
        kind: "NOTE",
        timestamp: Date.now(),
        src: "source.md",
        src_txt_display: "Hello",
        src_txt_start: "Hello",
        src_txt_end: "world",
        src_txt: "Hello world",
        src_range: [0, 1],
        src_txt_display_range: [0, 1],
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_range: [0, 1],
        target_txt_display_range: [0, 1],
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);

      const result = await annotationService.validateNote(
        annotation,
        "source.md"
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toContain("Source document not found");
    });
  });

  describe("validateAllAnnotations", () => {
    it("should validate all comments and notes", async () => {
      const mockAnnotations: AnnotationsFile = {
        comments: {
          c1: {
            id: "c1",
            kind: "COMMENT",
            timestamp: Date.now(),
            src: "source.md",
            src_txt_display: "Hello",
            src_txt_start: "Hello",
            src_txt_end: "end",
            src_txt: "Hello end",
            src_range: [0, 1],
            src_txt_display_range: [0],
            target: "test.md",
            target_txt_display: "Target",
            target_txt_start: "Target",
            target_txt_end: "text",
            target_txt: "Target text",
            target_range: [0, 1],
            target_txt_display_range: [0, 1],
          } as AnnotationData,
        },
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify(mockAnnotations))
        .mockResolvedValue("Hello end");
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      await annotationService.validateAllAnnotations("test.md");

      expect(app.vault.adapter.write).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockRejectedValue(new Error("Read error"));

      await annotationService.validateAllAnnotations("test.md");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const firstCall = consoleErrorSpy.mock.calls[0][0];
      expect(typeof firstCall === "string" && firstCall.includes("Error")).toBe(
        true
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
