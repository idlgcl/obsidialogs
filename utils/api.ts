// @ts-ignore
const API_ENDPOINT = API_ENDPOINT_VALUE;
// @ts-ignore
const ANNOTATION_ENDPOINT = ANNOTATION_ENDPOINT_VALUE;

import { Article, ArticleResponse, IdealogsAnnotation } from '../types';

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


export class ApiService {
    async fetchArticleSuggestions(searchTerm: string): Promise<ArticleResponse> {
        const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
        const url = `${API_ENDPOINT}/articles?kind=${kinds}&include_parent=True&query=${encodeURIComponent(searchTerm)}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
        }
        
        return await response.json() as ArticleResponse;
    }
    
    async fetchFileContent(fileName: string): Promise<string> {
        const url = `${API_ENDPOINT}/commits/head/${fileName}/Content`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.content) {
            throw new Error(`No content received for ${fileName}`);
        }
        
        return data.content;
    }

    async fetchArticleById(articleId: string): Promise<Article> {
        const url = `${API_ENDPOINT}/articles/${articleId}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
        }
        
        return await response.json() as Article;
    }

    async fetchAnnotations(sourceId: string, targetId: string): Promise<IdealogsAnnotation[]> {
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
                
                const data = await response.json() as AnnotationsResponse;
                allAnnotations.push(...data.items);
                
                hasMore = data.hasMore;
                page++;
            }
            
            return allAnnotations;
        } catch (error) {
            console.error('Error fetching annotations:', error);
            return [];
        }
    }

}
