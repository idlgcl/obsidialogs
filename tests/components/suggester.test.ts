import { App, Plugin, MarkdownView } from "obsidian";
import { ArticleSuggest } from "../../utils/suggester";
import { Article } from "../../types";
import { ApiService } from "../../utils/api";

jest.mock("../../utils/api");

describe("ArticleSuggest", () => {
  let app: App;
  let plugin: Plugin;
  let articleSuggest: ArticleSuggest;
  let mockApiService: jest.Mocked<ApiService>;

  beforeEach(() => {
    app = new App();
    // @ts-ignore
    plugin = new Plugin(app);
    articleSuggest = new ArticleSuggest(plugin);
    mockApiService = (articleSuggest as any)
      .apiService as jest.Mocked<ApiService>;
  });

  describe("onTrigger", () => {
    it("should trigger on [[@pattern", () => {
      const mockEditor = {
        getLine: jest.fn().mockReturnValue("[[@test"),
      };

      const cursor = { line: 0, ch: 7 };

      const result = articleSuggest.onTrigger(cursor, mockEditor as any);

      expect(result).toEqual({
        start: { line: 0, ch: 2 },
        end: cursor,
        query: "test",
      });
    });

    it("should trigger on [[@pattern with search query", () => {
      const mockEditor = {
        getLine: jest.fn().mockReturnValue("Some text [[@search term"),
      };

      const cursor = { line: 0, ch: 24 };

      const result = articleSuggest.onTrigger(cursor, mockEditor as any);

      expect(result).toEqual({
        start: { line: 0, ch: 12 },
        end: cursor,
        query: "search term",
      });
    });

    it("should not trigger without [[@pattern", () => {
      const mockEditor = {
        getLine: jest.fn().mockReturnValue("Regular text"),
      };

      const cursor = { line: 0, ch: 12 };

      const result = articleSuggest.onTrigger(cursor, mockEditor as any);

      expect(result).toBeNull();
    });

    it("should not trigger with closed brackets", () => {
      const mockEditor = {
        getLine: jest.fn().mockReturnValue("[[@test]]"),
      };

      const cursor = { line: 0, ch: 9 };

      const result = articleSuggest.onTrigger(cursor, mockEditor as any);

      expect(result).toBeNull();
    });

    it("should handle empty query", () => {
      const mockEditor = {
        getLine: jest.fn().mockReturnValue("[[@"),
      };

      const cursor = { line: 0, ch: 3 };

      const result = articleSuggest.onTrigger(cursor, mockEditor as any);

      expect(result).toEqual({
        start: { line: 0, ch: 2 },
        end: cursor,
        query: "",
      });
    });
  });

  describe("getSuggestions", () => {
    it("should fetch and return article suggestions", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Article 1",
          kind: "Writing",
          isParent: false,
        },
        {
          id: "Ix456",
          title: "Article 2",
          kind: "Insight",
          isParent: true,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        total: 2,
        limit: 10,
        offset: 0,
        hasMore: false,
        page: 1,
        totalPages: 1,
        nextPage: 2,
        previousPage: 0,
        items: mockArticles,
      });

      const context = { query: "test" } as any;

      const result = await articleSuggest.getSuggestions(context);

      expect(result).toEqual(mockArticles);
      expect(mockApiService.fetchArticleSuggestions).toHaveBeenCalledWith(
        "test"
      );
    });

    it("should return empty array if no items", async () => {
      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
        page: 1,
        totalPages: 0,
        nextPage: 1,
        previousPage: 0,
        items: [],
      });

      const context = { query: "nonexistent" } as any;

      const result = await articleSuggest.getSuggestions(context);

      expect(result).toEqual([]);
    });

    it("should handle API errors gracefully", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      mockApiService.fetchArticleSuggestions = jest
        .fn()
        .mockRejectedValue(new Error("API Error"));

      const context = { query: "test" } as any;

      const result = await articleSuggest.getSuggestions(context);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching article suggestions:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should handle null items", async () => {
      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
        page: 1,
        totalPages: 0,
        nextPage: 1,
        previousPage: 0,
        items: null as any,
      });

      const context = { query: "test" } as any;

      const result = await articleSuggest.getSuggestions(context);

      expect(result).toEqual([]);
    });
  });

  describe("renderSuggestion", () => {
    it("should render article suggestion with title and kind", () => {
      const article: Article = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
        isParent: false,
      };

      const mockEl = document.createElement("div");

      articleSuggest.renderSuggestion(article, mockEl);

      expect(mockEl.classList.contains("idealogs-article")).toBe(true);

      const container = mockEl.querySelector(".idealogs-suggestion-container");
      expect(container).toBeTruthy();

      const titleRow = container?.querySelector(".article-title-row");
      expect(titleRow).toBeTruthy();

      const title = titleRow?.querySelector(".article-title");
      expect(title?.textContent).toBe("Test Article");

      const kind = titleRow?.querySelector(".article-kind");
      expect(kind?.textContent).toBe("Writing");
    });

    it("should clear existing content before rendering", () => {
      const article: Article = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
        isParent: false,
      };

      const mockEl = document.createElement("div");
      mockEl.innerHTML = "<span>Old content</span>";

      articleSuggest.renderSuggestion(article, mockEl);

      const oldContent = mockEl.querySelector("span");
      expect(oldContent).toBeFalsy();
    });
  });

  describe("selectSuggestion", () => {
    it("should replace [[@query with article link", async () => {
      const article: Article = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
        isParent: false,
      };

      const mockEditor = {
        getCursor: jest.fn().mockReturnValue({ line: 0, ch: 10 }),
        getLine: jest.fn().mockReturnValue("[[@query"),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };

      // @ts-ignore
      const mockView = new MarkdownView();
      mockView.editor = mockEditor as any;

      jest
        .spyOn(app.workspace, "getActiveViewOfType")
        .mockReturnValue(mockView as any);

      await articleSuggest.selectSuggestion(article);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith(
        "[[@Tx123]]",
        { line: 0, ch: 0 },
        { line: 0, ch: 10 }
      );

      expect(mockEditor.setCursor).toHaveBeenCalledWith({
        line: 0,
        ch: 10,
      });
    });

    it("should handle existing closing brackets", async () => {
      const article: Article = {
        id: "Ix456",
        title: "Test Article",
        kind: "Insight",
        isParent: true,
      };

      const mockEditor = {
        getCursor: jest.fn().mockReturnValue({ line: 0, ch: 10 }),
        getLine: jest.fn().mockReturnValue("[[@query]]more text"),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };

      // @ts-ignore
      const mockView = new MarkdownView();
      mockView.editor = mockEditor as any;

      jest
        .spyOn(app.workspace, "getActiveViewOfType")
        .mockReturnValue(mockView as any);

      await articleSuggest.selectSuggestion(article);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith(
        "[[@Ix456]]",
        { line: 0, ch: 0 },
        { line: 0, ch: 10 }
      );
    });

    it("should do nothing if no active markdown view", async () => {
      const article: Article = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
        isParent: false,
      };

      jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(null);

      await articleSuggest.selectSuggestion(article);

      // Should not throw, just return early
    });

    it("should handle bracket not found", async () => {
      const article: Article = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
        isParent: false,
      };

      const mockEditor = {
        getCursor: jest.fn().mockReturnValue({ line: 0, ch: 5 }),
        getLine: jest.fn().mockReturnValue("query"),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };

      // @ts-ignore
      const mockView = new MarkdownView();
      mockView.editor = mockEditor as any;

      jest
        .spyOn(app.workspace, "getActiveViewOfType")
        .mockReturnValue(mockView as any);

      await articleSuggest.selectSuggestion(article);

      expect(mockEditor.replaceRange).not.toHaveBeenCalled();
    });

    it("should handle multiline scenarios", async () => {
      const article: Article = {
        id: "Fx789",
        title: "Test Article",
        kind: "Question",
        isParent: false,
      };

      const mockEditor = {
        getCursor: jest.fn().mockReturnValue({ line: 2, ch: 8 }),
        getLine: jest.fn().mockReturnValue("[[@test"),
        replaceRange: jest.fn(),
        setCursor: jest.fn(),
      };

      // @ts-ignore
      const mockView = new MarkdownView();
      mockView.editor = mockEditor as any;

      jest
        .spyOn(app.workspace, "getActiveViewOfType")
        .mockReturnValue(mockView as any);

      await articleSuggest.selectSuggestion(article);

      expect(mockEditor.replaceRange).toHaveBeenCalledWith(
        "[[@Fx789]]",
        { line: 2, ch: 0 },
        { line: 2, ch: 8 }
      );

      expect(mockEditor.setCursor).toHaveBeenCalledWith({
        line: 2,
        ch: 10,
      });
    });
  });
});
