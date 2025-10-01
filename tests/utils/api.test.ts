import { ApiService } from "../../utils/api";
import { Article, ArticleResponse, IdealogsAnnotation } from "../../types";

describe("ApiService", () => {
    let apiService: ApiService;

    beforeEach(() => {
        apiService = new ApiService();
    });

    describe("fetchArticleSuggestions", () => {
        it("should fetch article suggestions successfully", async () => {
            const mockResponse: ArticleResponse = {
                total: 2,
                limit: 10,
                offset: 0,
                hasMore: false,
                page: 1,
                totalPages: 1,
                nextPage: 2,
                previousPage: 0,
                items: [
                    {
                        id: "Tx123",
                        title: "Test Article 1",
                        kind: "Writing",
                        isParent: false,
                    },
                    {
                        id: "Ix456",
                        title: "Test Article 2",
                        kind: "Insight",
                        isParent: true,
                    },
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result =
                await apiService.fetchArticleSuggestions("test query");

            expect(result).toEqual(mockResponse);
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining("query=test%20query"),
            );
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(
                    "kind=Writing&kind=Question&kind=Insight",
                ),
            );
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining("include_parent=True"),
            );
        });

        it("should throw error when API request fails", async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                statusText: "Not Found",
            });

            await expect(
                apiService.fetchArticleSuggestions("test"),
            ).rejects.toThrow("API request failed: Not Found");
        });
    });

    describe("fetchFileContent", () => {
        it("should fetch file content successfully", async () => {
            const mockContent = "File content here";
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ content: mockContent }),
            });

            const result = await apiService.fetchFileContent("Tx123");

            expect(result).toBe(mockContent);
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining("/commits/head/Tx123/Content"),
            );
        });

        it("should throw error when API request fails", async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            await expect(apiService.fetchFileContent("Tx123")).rejects.toThrow(
                "API request failed: 404 Not Found",
            );
        });

        it("should throw error when no content is received", async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            await expect(apiService.fetchFileContent("Tx123")).rejects.toThrow(
                "No content received for Tx123",
            );
        });
    });

    describe("fetchArticleById", () => {
        it("should fetch article by ID successfully", async () => {
            const mockArticle: Article = {
                id: "Tx123",
                title: "Test Article",
                kind: "Writing",
                isParent: false,
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockArticle,
            });

            const result = await apiService.fetchArticleById("Tx123");

            expect(result).toEqual(mockArticle);
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining("/articles/Tx123"),
            );
        });

        it("should throw error when API request fails", async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                statusText: "Internal Server Error",
            });

            await expect(apiService.fetchArticleById("Tx123")).rejects.toThrow(
                "API request failed: Internal Server Error",
            );
        });
    });

    describe("fetchAnnotations", () => {
        it("should fetch all annotations with pagination", async () => {
            const mockAnnotation1: IdealogsAnnotation = {
                id: 1,
                kind: "reference",
                commitId: 100,
                isValid: true,
                commitIsMerged: true,
                sourceId: "Tx123",
                sTxtStart: "start1",
                sTxtEnd: "end1",
                sTxtDisplay: "display1",
                sTxt: "text1",
                sTxtDisplayRange: [0, 10],
                sTxtRange: [0, 10],
                targetId: "Tx456",
                tTxtStart: "start2",
                tTxtEnd: "end2",
                tTxtDisplay: "display2",
                tTxt: "text2",
                tTxtDisplayRange: [0, 10],
                tTxtRange: [0, 10],
            };

            const mockAnnotation2: IdealogsAnnotation = {
                ...mockAnnotation1,
                id: 2,
            };

            // First page response
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    total: 2,
                    limit: 50,
                    offset: 0,
                    hasMore: true,
                    page: 1,
                    totalPages: 2,
                    nextPage: 2,
                    previousPage: 0,
                    items: [mockAnnotation1],
                }),
            });

            // Second page response
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    total: 2,
                    limit: 50,
                    offset: 50,
                    hasMore: false,
                    page: 2,
                    totalPages: 2,
                    nextPage: 3,
                    previousPage: 1,
                    items: [mockAnnotation2],
                }),
            });

            const result = await apiService.fetchAnnotations("Tx123", "Tx456");

            expect(result).toHaveLength(2);
            expect(result).toEqual([mockAnnotation1, mockAnnotation2]);
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(global.fetch).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining("page=1"),
            );
            expect(global.fetch).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining("page=2"),
            );
        });

        it("should return empty array when API request fails", async () => {
            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation();

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                statusText: "Internal Server Error",
            });

            const result = await apiService.fetchAnnotations("Tx123", "Tx456");

            expect(result).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Error fetching annotations:",
                expect.any(Error),
            );

            consoleErrorSpy.mockRestore();
        });

        it("should handle single page response", async () => {
            const mockAnnotation: IdealogsAnnotation = {
                id: 1,
                kind: "reference",
                commitId: 100,
                isValid: true,
                commitIsMerged: true,
                sourceId: "Tx123",
                sTxtStart: "start1",
                sTxtEnd: "end1",
                sTxtDisplay: "display1",
                sTxt: "text1",
                sTxtDisplayRange: [0, 10],
                sTxtRange: [0, 10],
                targetId: "Tx456",
                tTxtStart: "start2",
                tTxtEnd: "end2",
                tTxtDisplay: "display2",
                tTxt: "text2",
                tTxtDisplayRange: [0, 10],
                tTxtRange: [0, 10],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    total: 1,
                    limit: 50,
                    offset: 0,
                    hasMore: false,
                    page: 1,
                    totalPages: 1,
                    nextPage: 2,
                    previousPage: 0,
                    items: [mockAnnotation],
                }),
            });

            const result = await apiService.fetchAnnotations("Tx123", "Tx456");

            expect(result).toHaveLength(1);
            expect(result).toEqual([mockAnnotation]);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
