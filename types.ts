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

export interface Parent {
  id: string;
  title: string;
  parent?: Parent | null;
}

export interface Article {
  id: string;
  title: string;
  kind: string;
  isParent: boolean;
  ledeHtml?: string;
  authorId?: number;
  orgId?: number;
  isWorkspace?: boolean;
  createdAt?: string;
  updatedAt?: string;
  parents?: Parent[];
}

export interface WordProcessorOptions {
  articleId: string;
}

export interface IdealogsAnnotation {
  id: string | number;
  kind: string;
  commitId: number;
  isValid: boolean;
  isDeleted: boolean;
  commitIsMerged: boolean;
  errorSource?: string;
  validationMessage?: string;

  sourceId: string;
  sourceTextStart: string;
  sourceTextEnd: string;
  sourceTextDisplay: string;
  sourceText: string;
  // sTxtDisplayRange: number[];
  // sTxtRange: number[];

  targetId: string;
  targetTextStart: string;
  targetTextEnd: string;
  targetTextDisplay: string;
  targetText: string;
  // tTxtDisplayRange: number[];
  // tTxtRange: number[];
}
