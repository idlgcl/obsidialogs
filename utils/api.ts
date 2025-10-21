// @ts-ignore
const API_ENDPOINT = API_ENDPOINT_VALUE;
// @ts-ignore
const ANNOTATION_ENDPOINT = ANNOTATION_ENDPOINT_VALUE;

import { Article, ArticleResponse, IdealogsAnnotation } from "../types";

export interface AnnotationsResponse {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  page: number;
  totalPages: number;
  nextPage: number;
  previousPage: number;
  items: IdealogsAnnotation[];
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheConfig {
  ttlMs: number;
  maxEntries: number;
}

export class ApiService {
  private searchCache = new Map<string, CacheEntry<ArticleResponse>>();
  private articleCache = new Map<string, CacheEntry<Article>>();
  private fileContentCache = new Map<string, CacheEntry<string>>();
  private annotationsCache = new Map<
    string,
    CacheEntry<IdealogsAnnotation[]>
  >();

  private readonly CACHE_CONFIG = {
    search: { ttlMs: 2 * 60 * 1000, maxEntries: 100 }, // 2 minutes
    article: { ttlMs: 5 * 60 * 1000, maxEntries: 200 }, // 5 minutes
    fileContent: { ttlMs: 5 * 60 * 1000, maxEntries: 100 }, // 5 minutes
    annotations: { ttlMs: 3 * 60 * 1000, maxEntries: 100 }, // 3 minutes
  };

  private getCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string
  ): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    data: T,
    config: CacheConfig
  ): void {
    if (cache.size >= config.maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }

    cache.set(key, {
      data,
      expiresAt: Date.now() + config.ttlMs,
    });
  }

  clearCache(): void {
    this.searchCache.clear();
    this.articleCache.clear();
    this.fileContentCache.clear();
    this.annotationsCache.clear();
  }

  async fetchArticleSuggestions(
    searchTerm: string,
    signal?: AbortSignal,
    page = 1,
    limit = 50
  ): Promise<ArticleResponse> {
    const cacheKey = `${searchTerm}:${page}:${limit}`;

    const cached = this.getCached(this.searchCache, cacheKey);
    if (cached) {
      return cached;
    }

    const kinds = ["Writing", "Question", "Insight"].join("&kind=");
    const url = `${API_ENDPOINT}/articles?kind=${kinds}&include_parents=true&query=${encodeURIComponent(
      searchTerm
    )}&page=${page}&limit=${limit}`;

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as ArticleResponse;

    this.setCache(this.searchCache, cacheKey, data, this.CACHE_CONFIG.search);

    return data;
  }

  async fetchFileContent(fileName: string): Promise<string> {
    const cached = this.getCached(this.fileContentCache, fileName);
    if (cached) {
      return cached;
    }

    const url = `${API_ENDPOINT}/commits/head/${fileName}/Content`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data || !data.content) {
      throw new Error(`No content received for ${fileName}`);
    }

    const content = data.content;

    this.setCache(
      this.fileContentCache,
      fileName,
      content,
      this.CACHE_CONFIG.fileContent
    );

    return content;
  }

  async fetchArticleById(articleId: string): Promise<Article> {
    const cached = this.getCached(this.articleCache, articleId);
    if (cached) {
      return cached;
    }

    const url = `${API_ENDPOINT}/articles/${articleId}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const article = (await response.json()) as Article;

    this.setCache(
      this.articleCache,
      articleId,
      article,
      this.CACHE_CONFIG.article
    );

    return article;
  }

  async fetchAnnotations(
    sourceId: string,
    targetId: string
  ): Promise<IdealogsAnnotation[]> {
    const cacheKey = `${sourceId}:${targetId}`;

    const cached = this.getCached(this.annotationsCache, cacheKey);
    if (cached) {
      return cached;
    }

    let page = 1;
    const limit = 50;
    let hasMore = true;
    const allAnnotations: IdealogsAnnotation[] = [];

    try {
      while (hasMore) {
        const url = `${ANNOTATION_ENDPOINT}/annotations?target_id=${targetId}&source_id=${sourceId}&is_valid=true&commit_is_merged=true&page=${page}&limit=${limit}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }

        const data = (await response.json()) as AnnotationsResponse;
        allAnnotations.push(...data.items);

        hasMore = data.hasMore;
        page++;
      }

      this.setCache(
        this.annotationsCache,
        cacheKey,
        allAnnotations,
        this.CACHE_CONFIG.annotations
      );

      return allAnnotations;
    } catch (error) {
      console.error("Error fetching annotations:", error);
      return [];
    }
  }
}
