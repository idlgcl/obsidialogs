import { ArticleAutocompleteField } from "../../components/old/article-input";
import { Article } from "../../types";
import { ApiService } from "../../utils/api";

jest.mock("../../utils/api");

describe("ArticleAutocompleteField", () => {
  let container: HTMLElement;
  let mockApiService: jest.Mocked<ApiService>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockApiService = new ApiService() as jest.Mocked<ApiService>;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe("constructor and initialization", () => {
    it("should create input field with default placeholder", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({ container });

      const input = container.querySelector("input");
      expect(input).toBeTruthy();
      expect(input?.placeholder).toBe("Search for an article...");
    });

    it("should create input field with custom placeholder", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({
        container,
        placeholder: "Custom placeholder",
      });

      const input = container.querySelector("input");
      expect(input?.placeholder).toBe("Custom placeholder");
    });

    it("should create input field with label", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({
        container,
        label: "Test Label",
      });

      const label = container.querySelector("label");
      expect(label?.textContent).toBe("Test Label");
    });

    it("should set initial value", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const field = new ArticleAutocompleteField({
        container,
        initialValue: "Tx123",
      });

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("Tx123");
    });

    it("should create disabled input when disabled option is true", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({
        container,
        disabled: true,
      });

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it("should create enabled input by default", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({ container });

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.disabled).toBe(false);
    });

    it("should create search icon", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({ container });

      const icon = container.querySelector(".article-search-icon");
      expect(icon).toBeTruthy();
    });

    it("should create suggestions container", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({ container });

      const suggestions = container.querySelector(".article-suggestions");
      expect(suggestions).toBeTruthy();
    });

    it("should hide suggestions initially", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({ container });

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).toBe("none");
    });
  });

  describe("input handling", () => {
    it("should fetch suggestions on input", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockApiService.fetchArticleSuggestions).toHaveBeenCalledWith(
        "test"
      );
    });

    it("should close suggestions when input is empty", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _field = new ArticleAutocompleteField({ container });

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).toBe("none");
    });

    it("should render suggestions when API returns results", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Article 1",
          kind: "Writing",
          isParent: false,
        },
        {
          id: "Tx456",
          title: "Article 2",
          kind: "Insight",
          isParent: true,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestionItems = container.querySelectorAll(
        ".article-suggestion-item"
      );
      expect(suggestionItems.length).toBe(2);
    });

    it("should display article titles in suggestions", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const titleEl = container.querySelector(".article-title");
      expect(titleEl?.textContent).toBe("Test Article");
    });

    it("should display article kind in suggestions", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Insight",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const kindEl = container.querySelector(".article-kind");
      expect(kindEl?.textContent).toBe("Insight");
    });

    it("should handle API errors gracefully", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      mockApiService.fetchArticleSuggestions = jest
        .fn()
        .mockRejectedValue(new Error("API Error"));

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalled();
      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).toBe("none");

      consoleErrorSpy.mockRestore();
    });

    it("should close suggestions when no results", async () => {
      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: [],
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).toBe("none");
    });
  });

  describe("suggestion selection", () => {
    it("should select article on click", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestionItem = container.querySelector(
        ".article-suggestion-item"
      ) as HTMLElement;
      suggestionItem.click();

      expect(input.value).toBe("Tx123");
      expect(field.getSelectedArticle()).toEqual(mockArticles[0]);
    });

    it("should close suggestions after selection", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestionItem = container.querySelector(
        ".article-suggestion-item"
      ) as HTMLElement;
      suggestionItem.click();

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).toBe("none");
    });

    it("should call onChange callback when article is selected", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const onChange = jest.fn();

      const field = new ArticleAutocompleteField({ container, onChange });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestionItem = container.querySelector(
        ".article-suggestion-item"
      ) as HTMLElement;
      suggestionItem.click();

      expect(onChange).toHaveBeenCalledWith(mockArticles[0]);
    });
  });

  describe("focus handling", () => {
    it("should show suggestions on focus if suggestions exist", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      // Close suggestions properly by clicking outside
      document.body.click();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(suggestions.style.display).toBe("none");

      input.dispatchEvent(new Event("focus"));

      expect(suggestions.style.display).not.toBe("none");
    });
  });

  describe("document click handling", () => {
    it("should close suggestions when clicking outside", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      document.body.click();

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).toBe("none");
    });

    it("should not close suggestions when clicking inside field", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      input.click();

      const suggestions = container.querySelector(
        ".article-suggestions"
      ) as HTMLElement;
      expect(suggestions.style.display).not.toBe("none");
    });
  });

  describe("public methods", () => {
    it("should return input value with getValue()", () => {
      const field = new ArticleAutocompleteField({
        container,
        initialValue: "test",
      });

      expect(field.getValue()).toBe("test");
    });

    it("should return selected article with getSelectedArticle()", async () => {
      const mockArticles: Article[] = [
        {
          id: "Tx123",
          title: "Test Article",
          kind: "Writing",
          isParent: false,
        },
      ];

      mockApiService.fetchArticleSuggestions = jest.fn().mockResolvedValue({
        items: mockArticles,
      });

      const field = new ArticleAutocompleteField({ container });
      (field as any).apiService = mockApiService;

      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "test";
      input.dispatchEvent(new Event("input"));

      await new Promise((resolve) => setTimeout(resolve, 0));

      const suggestionItem = container.querySelector(
        ".article-suggestion-item"
      ) as HTMLElement;
      suggestionItem.click();

      expect(field.getSelectedArticle()).toEqual(mockArticles[0]);
    });

    it("should return null when no article selected", () => {
      const field = new ArticleAutocompleteField({ container });

      expect(field.getSelectedArticle()).toBeNull();
    });

    it("should set input value with setValue()", () => {
      const field = new ArticleAutocompleteField({ container });

      field.setValue("Tx999");

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("Tx999");
    });

    it("should disable input with setDisabled(true)", () => {
      const field = new ArticleAutocompleteField({ container });

      field.setDisabled(true);

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it("should enable input with setDisabled(false)", () => {
      const field = new ArticleAutocompleteField({
        container,
        disabled: true,
      });

      field.setDisabled(false);

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.disabled).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should remove suggestions element on unload", () => {
      const field = new ArticleAutocompleteField({ container });

      const suggestions = container.querySelector(".article-suggestions");
      expect(suggestions).toBeTruthy();

      field.onunload();

      const suggestionsAfter = document.body.contains(suggestions);
      expect(suggestionsAfter).toBe(false);
    });
  });
});
