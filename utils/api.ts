// @ts-ignore
const API_ENDPOINT = API_ENDPOINT_VALUE;

import { Article, ArticleResponse } from '../types';

export class ApiService {
    async fetchArticleSuggestions(searchTerm: string): Promise<ArticleResponse> {
        const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
        const url = `${API_ENDPOINT}/articles?kind=${kinds}&query=${encodeURIComponent(searchTerm)}`;
        
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
}
