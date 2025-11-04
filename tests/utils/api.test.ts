import { ApiService } from "../../utils/api";

describe("ApiService", () => {
  let apiService: ApiService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    apiService = new ApiService();
    fetchMock = global.fetch as jest.Mock;
    fetchMock.mockReset();
  });

  describe("clearCache", () => {
    it("should clear all caches", async () => {
      // Populate caches
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          hasMore: false,
          page: 1,
          totalPages: 1,
        }),
      });

      await apiService.fetchArticleSuggestions("test");

      // Clear cache
      apiService.clearCache();

      // Fetch again - should hit API, not cache
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          hasMore: false,
          page: 1,
          totalPages: 1,
        }),
      });

      await apiService.fetchArticleSuggestions("test");

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchArticleSuggestions", () => {
    it("should fetch article suggestions successfully", async () => {
      const mockResponse = {
        items: [
          {
            id: "Tx1",
            title: "Test Article",
            kind: "Writing",
          },
        ],
        total: 1,
        hasMore: false,
        page: 1,
        totalPages: 1,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiService.fetchArticleSuggestions("test");

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/articles?"),
        expect.objectContaining({})
      );
    });

    it("should use cached results on subsequent calls", async () => {
      const mockResponse = {
        items: [],
        total: 0,
        hasMore: false,
        page: 1,
        totalPages: 1,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // First call
      await apiService.fetchArticleSuggestions("test");

      // Second call (should use cache)
      await apiService.fetchArticleSuggestions("test");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should throw error on failed request", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      await expect(
        apiService.fetchArticleSuggestions("test")
      ).rejects.toThrow("API request failed: Not Found");
    });

    it("should support pagination parameters", async () => {
      const mockResponse = {
        items: [],
        total: 0,
        hasMore: false,
        page: 2,
        totalPages: 5,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await apiService.fetchArticleSuggestions("test", undefined, 2, 10);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("limit=10"),
        expect.anything()
      );
    });

    it("should encode search term in URL", async () => {
      const mockResponse = {
        items: [],
        total: 0,
        hasMore: false,
        page: 1,
        totalPages: 1,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await apiService.fetchArticleSuggestions("test & special");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("test%20%26%20special"),
        expect.anything()
      );
    });

    it("should support AbortSignal", async () => {
      const mockResponse = {
        items: [],
        total: 0,
        hasMore: false,
        page: 1,
        totalPages: 1,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const controller = new AbortController();
      await apiService.fetchArticleSuggestions("test", controller.signal);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: controller.signal })
      );
    });
  });

  describe("fetchFileContent", () => {
    it("should fetch file content successfully", async () => {
      const mockContent = "# Test Content\n\nThis is a test.";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: mockContent }),
      });

      const result = await apiService.fetchFileContent("test.md");

      expect(result).toBe(mockContent);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/commits/head/test.md/Content")
      );
    });

    it("should use cached results on subsequent calls", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "Test" }),
      });

      // First call
      await apiService.fetchFileContent("test.md");

      // Second call (should use cache)
      await apiService.fetchFileContent("test.md");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should throw error on failed request", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(apiService.fetchFileContent("missing.md")).rejects.toThrow(
        "API request failed: 404 Not Found"
      );
    });

    it("should throw error when content is missing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(apiService.fetchFileContent("test.md")).rejects.toThrow(
        "No content received for test.md"
      );
    });

    it("should remove YAML frontmatter", async () => {
      const mockContent = `---
title: Test
date: 2024-01-01
---

# Content Here`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: mockContent }),
      });

      const result = await apiService.fetchFileContent("test.md");

      expect(result).toBe("# Content Here");
      expect(result).not.toContain("---");
      expect(result).not.toContain("title: Test");
    });

    it("should handle content without frontmatter", async () => {
      const mockContent = "# No frontmatter\n\nJust content.";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: mockContent }),
      });

      const result = await apiService.fetchFileContent("test.md");

      expect(result).toBe(mockContent);
    });

    it("should handle malformed frontmatter", async () => {
      const mockContent = "---\nIncomplete frontmatter\n\n# Content";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: mockContent }),
      });

      const result = await apiService.fetchFileContent("test.md");

      // Should return original content if frontmatter is malformed
      expect(result).toBe(mockContent);
    });
  });

  describe("fetchArticleById", () => {
    it("should fetch article by ID successfully", async () => {
      const mockArticle = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
        content: "Article content",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockArticle,
      });

      const result = await apiService.fetchArticleById("Tx123");

      expect(result).toEqual(mockArticle);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/articles/Tx123")
      );
    });

    it("should use cached results on subsequent calls", async () => {
      const mockArticle = {
        id: "Tx123",
        title: "Test Article",
        kind: "Writing",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockArticle,
      });

      // First call
      await apiService.fetchArticleById("Tx123");

      // Second call (should use cache)
      await apiService.fetchArticleById("Tx123");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should throw error on failed request", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      await expect(apiService.fetchArticleById("invalid")).rejects.toThrow(
        "API request failed: Not Found"
      );
    });

    it("should cache different articles separately", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "Tx1", title: "Article 1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "Tx2", title: "Article 2" }),
        });

      const result1 = await apiService.fetchArticleById("Tx1");
      const result2 = await apiService.fetchArticleById("Tx2");

      expect(result1.id).toBe("Tx1");
      expect(result2.id).toBe("Tx2");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchAnnotations", () => {
    it("should fetch annotations successfully", async () => {
      const mockAnnotations = [
        {
          id: "a1",
          source_id: "source1",
          target_id: "target1",
          kind: "COMMENT",
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: mockAnnotations,
          hasMore: false,
          page: 1,
          total: 1,
          totalPages: 1,
        }),
      });

      const result = await apiService.fetchAnnotations("source1", "target1");

      expect(result).toEqual(mockAnnotations);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should fetch multiple pages of annotations", async () => {
      const page1Annotations = [{ id: "a1" }];
      const page2Annotations = [{ id: "a2" }];

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: page1Annotations,
            hasMore: true,
            page: 1,
            total: 2,
            totalPages: 2,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: page2Annotations,
            hasMore: false,
            page: 2,
            total: 2,
            totalPages: 2,
          }),
        });

      const result = await apiService.fetchAnnotations("source1", "target1");

      expect(result).toHaveLength(2);
      expect(result).toEqual([...page1Annotations, ...page2Annotations]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should use cached results on subsequent calls", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          hasMore: false,
          page: 1,
          total: 0,
          totalPages: 1,
        }),
      });

      // First call
      await apiService.fetchAnnotations("source1", "target1");

      // Second call (should use cache)
      await apiService.fetchAnnotations("source1", "target1");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should return empty array on error", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: "Server Error",
      });

      const result = await apiService.fetchAnnotations("source1", "target1");

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should filter by valid and merged annotations", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          hasMore: false,
          page: 1,
          total: 0,
          totalPages: 1,
        }),
      });

      await apiService.fetchAnnotations("source1", "target1");

      const callUrl = fetchMock.mock.calls[0][0] as string;
      expect(callUrl).toContain("is_valid=true");
      expect(callUrl).toContain("commit_is_merged=true");
    });

    it("should cache different source-target pairs separately", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "a1" }],
            hasMore: false,
            page: 1,
            total: 1,
            totalPages: 1,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: "a2" }],
            hasMore: false,
            page: 1,
            total: 1,
            totalPages: 1,
          }),
        });

      const result1 = await apiService.fetchAnnotations("source1", "target1");
      const result2 = await apiService.fetchAnnotations("source2", "target2");

      expect(result1[0].id).toBe("a1");
      expect(result2[0].id).toBe("a2");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
