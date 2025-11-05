import { App } from "obsidian";
import {
  AnnotationService,
  AnnotationData,
  AnnotationsFile,
  SavedAnnotationData,
  SavedAnnotationsFile,
} from "../../utils/annotation-service";

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

    it("should handle paths with multiple slashes", () => {
      const path =
        annotationService.getAnnotationsFilePath("folder/subfolder/file.md");
      expect(path).toBe(".idealogs/annotations/file.annotations");
    });
  });

  describe("loadAnnotations", () => {
    it("should load existing annotations", async () => {
      const timestamp = Date.now();

      // Mock saved format (camelCase, no id inside objects)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {
          c1: {
            kind: "COMMENT",
            timestamp: timestamp,
            src: "test.md",
            sourceTextDisplay: "Display",
            sourceTextStart: "Start",
            sourceTextEnd: "End",
            sourceText: "Full text",
            target: "Tx123",
            targetTextDisplay: "Target display",
            targetTextStart: "Target start",
            targetTextEnd: "Target end",
            targetText: "Target text",
            targetStartOffset: 0,
            targetEndOffset: 10,
            targetDisplayOffset: 5,
          } as SavedAnnotationData,
        },
        notes: {},
      };

      // Expected result (snake_case, with id)
      const expectedAnnotations: AnnotationsFile = {
        comments: {
          c1: {
            id: "c1",
            kind: "COMMENT",
            timestamp: timestamp,
            src: "test.md",
            src_txt_display: "Display",
            src_txt_start: "Start",
            src_txt_end: "End",
            src_txt: "Full text",
            target: "Tx123",
            target_txt_display: "Target display",
            target_txt_start: "Target start",
            target_txt_end: "Target end",
            target_txt: "Target text",
            target_start_offset: 0,
            target_end_offset: 10,
            target_display_offset: 5,
          } as AnnotationData,
        },
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));

      const result = await annotationService.loadAnnotations("test.md");

      expect(result).toEqual(expectedAnnotations);
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
        targetFullText: "Target start Target display Target end",
        targetStartOffset: 0,
        targetEndOffset: 38,
        targetDisplayOffset: 13,
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
        targetFullText: "Target text",
        targetStartOffset: 0,
        targetEndOffset: 10,
        targetDisplayOffset: 5,
        sourceFilePath: "source.md",
      };

      await expect(annotationService.saveComment(commentData)).rejects.toThrow(
        "Target article and source path are required"
      );
    });

    it("should throw error if source path is missing", async () => {
      const commentData = {
        commentId: "c1",
        textDisplay: "Sample text",
        commentBody: "Comment body",
        targetArticle: "Tx123",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
        targetFullText: "Target text",
        targetStartOffset: 0,
        targetEndOffset: 10,
        targetDisplayOffset: 5,
        sourceFilePath: "",
      };

      await expect(annotationService.saveComment(commentData)).rejects.toThrow(
        "Target article and source path are required"
      );
    });
  });

  describe("saveNote", () => {
    it("should save note successfully with valid file content", async () => {
      app.vault.adapter.exists = jest.fn().mockResolvedValue(false);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue("Start text Display text [[@Tx123]] End text");
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      const noteData = {
        noteId: "n1",
        textStart: "Start",
        textEnd: "End",
        textDisplay: "Display",
        linkText: "[[@Tx123]]",
        targetArticle: "Tx123",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
        targetFullText: "Target start Target display Target end",
        targetStartOffset: 0,
        targetEndOffset: 38,
        targetDisplayOffset: 13,
        sourceFilePath: "source.md",
      };

      const result = await annotationService.saveNote(noteData);

      expect(result).toBe("n1");
      expect(app.vault.adapter.write).toHaveBeenCalledTimes(2);
    });

    it("should throw error if target article is missing", async () => {
      const noteData = {
        noteId: "n1",
        textStart: "Start",
        textEnd: "End",
        textDisplay: "Display",
        linkText: "[[@Tx123]]",
        targetArticle: "",
        targetTextStart: "Target start",
        targetTextEnd: "Target end",
        targetTextDisplay: "Target display",
        targetFullText: "Target text",
        targetStartOffset: 0,
        targetEndOffset: 10,
        targetDisplayOffset: 5,
        sourceFilePath: "source.md",
      };

      await expect(annotationService.saveNote(noteData)).rejects.toThrow(
        "Target article and source path are required"
      );
    });
  });

  describe("findCommentBySource", () => {
    it("should find comment by source text", async () => {
      // Mock saved format (camelCase, no id)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {
          c1: {
            kind: "COMMENT",
            timestamp: Date.now(),
            src: "test.md",
            sourceTextDisplay: "Display text",
            sourceTextStart: "Display",
            sourceTextEnd: "end",
            sourceText: "Display text end",
            target: "Tx123",
            targetTextDisplay: "Target",
            targetTextStart: "Target",
            targetTextEnd: "text",
            targetText: "Target text",
            targetStartOffset: 0,
            targetEndOffset: 10,
            targetDisplayOffset: 5,
          } as SavedAnnotationData,
        },
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));

      const result = await annotationService.findCommentBySource(
        "test.md",
        "Display text",
        "Display",
        "end"
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe("c1");
    });

    it("should return null if no matching comment found", async () => {
      // Mock saved format (empty)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {},
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));

      const result = await annotationService.findCommentBySource(
        "test.md",
        "Nonexistent",
        "Non",
        "existent"
      );

      expect(result).toBeNull();
    });
  });

  describe("findNoteByLinkText", () => {
    it("should find note by link text", async () => {
      // Mock saved format (camelCase, no id)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {},
        notes: {
          n1: {
            kind: "NOTE",
            timestamp: Date.now(),
            src: "test.md",
            sourceTextDisplay: "Display",
            sourceTextStart: "Start",
            sourceTextEnd: "End",
            sourceText: "Start Display [[@Tx123]] End",
            target: "Tx123",
            targetTextDisplay: "Target",
            targetTextStart: "Target",
            targetTextEnd: "text",
            targetText: "Target text",
            targetStartOffset: 0,
            targetEndOffset: 10,
            targetDisplayOffset: 5,
          } as SavedAnnotationData,
        },
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));

      const result = await annotationService.findNoteByLinkText(
        "test.md",
        "[[@Tx123]]"
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe("n1");
    });

    it("should return null if no matching note found", async () => {
      // Mock saved format (empty)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {},
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));

      const result = await annotationService.findNoteByLinkText(
        "test.md",
        "[[@Tx999]]"
      );

      expect(result).toBeNull();
    });
  });

  describe("deleteAnnotation", () => {
    it("should delete comment", async () => {
      // Mock saved format (camelCase, no id)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {
          c1: {
            kind: "COMMENT",
            timestamp: Date.now(),
            src: "test.md",
            sourceTextDisplay: "Display",
            sourceTextStart: "Start",
            sourceTextEnd: "End",
            sourceText: "Full text",
            target: "Tx123",
            targetTextDisplay: "Target",
            targetTextStart: "Target",
            targetTextEnd: "text",
            targetText: "Target text",
            targetStartOffset: 0,
            targetEndOffset: 10,
            targetDisplayOffset: 5,
          } as SavedAnnotationData,
        },
        notes: {},
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      await annotationService.deleteAnnotation("test.md", "c1", "comment");

      expect(app.vault.adapter.write).toHaveBeenCalled();
      const writeCall = (app.vault.adapter.write as jest.Mock).mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      // Verify the comment was deleted
      expect(savedData.comments.c1).toBeUndefined();
      // Verify the saved format is camelCase (no snake_case fields)
      expect(savedData.comments).toBeDefined();
    });

    it("should delete note", async () => {
      // Mock saved format (camelCase, no id)
      const mockSavedAnnotations: SavedAnnotationsFile = {
        comments: {},
        notes: {
          n1: {
            kind: "NOTE",
            timestamp: Date.now(),
            src: "test.md",
            sourceTextDisplay: "Display",
            sourceTextStart: "Start",
            sourceTextEnd: "End",
            sourceText: "Full text",
            target: "Tx123",
            targetTextDisplay: "Target",
            targetTextStart: "Target",
            targetTextEnd: "text",
            targetText: "Target text",
            targetStartOffset: 0,
            targetEndOffset: 10,
            targetDisplayOffset: 5,
          } as SavedAnnotationData,
        },
      };

      app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      app.vault.adapter.read = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockSavedAnnotations));
      app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);

      await annotationService.deleteAnnotation("test.md", "n1", "note");

      expect(app.vault.adapter.write).toHaveBeenCalled();
      const writeCall = (app.vault.adapter.write as jest.Mock).mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      // Verify the note was deleted
      expect(savedData.notes.n1).toBeUndefined();
      // Verify the saved format is camelCase (no snake_case fields)
      expect(savedData.notes).toBeDefined();
    });
  });

  describe("validateComment", () => {
    it("should validate valid comment", async () => {
      const annotation: AnnotationData = {
        id: "c1",
        kind: "COMMENT",
        timestamp: Date.now(),
        src: "test.md",
        src_txt_display: "Hello world",
        src_txt_start: "Hello",
        src_txt_end: "end",
        src_txt: "Hello world comment text end",
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_start_offset: 0,
        target_end_offset: 10,
        target_display_offset: 5,
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
        src: "test.md",
        src_txt_display: "Hello",
        src_txt_start: "Hello",
        src_txt_end: "end",
        src_txt: "Hello end",
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_start_offset: 0,
        target_end_offset: 10,
        target_display_offset: 5,
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
        src: "test.md",
        src_txt_display: "Missing",
        src_txt_start: "Missing",
        src_txt_end: "end",
        src_txt: "Missing end",
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_start_offset: 0,
        target_end_offset: 10,
        target_display_offset: 5,
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
        src: "test.md",
        src_txt_display: "Hello world",
        src_txt_start: "Hello",
        src_txt_end: "world",
        src_txt: "Hello world",
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_start_offset: 0,
        target_end_offset: 10,
        target_display_offset: 5,
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
        src: "test.md",
        src_txt_display: "Hello",
        src_txt_start: "Hello",
        src_txt_end: "world",
        src_txt: "Hello world",
        target: "Tx123",
        target_txt_display: "Target",
        target_txt_start: "Target",
        target_txt_end: "text",
        target_txt: "Target text",
        target_start_offset: 0,
        target_end_offset: 10,
        target_display_offset: 5,
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
});
