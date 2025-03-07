export interface ArticleResponse {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    page: number;
    totalPages: number;
    nextPage: number;
    previousPage: number;
    items: Article[];
}

export interface Article {
    id: string;
    title: string;
    kind: string;
    ledeHtml?: string;
    authorId?: number;
    orgId?: number;
    isWorkspace?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface WordProcessorOptions {
    articleId: string;
}

export interface Comment {
    title: string;
    body: string;
    indices: number[];
}
