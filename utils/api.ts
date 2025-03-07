import { Article, ArticleResponse } from '../types/interfaces';

declare const API_ENDPOINT_VALUE: string;
const API_ENDPOINT = API_ENDPOINT_VALUE;

export async function fetchArticleSuggestions(searchTerm: string): Promise<Article[]> {
    try {
        const kinds = ['Writing', 'Question', 'Insight', 'Subject'].join('&kind=');
        const url = `${API_ENDPOINT}/articles?kind=${kinds}&query=${encodeURIComponent(searchTerm)}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error('API request failed:', response.statusText);
            return [];
        }
        
        const data = await response.json() as ArticleResponse;
        
        if (!data.items || !data.items.length) {
            return [];
        }
        
        return data.items;
    } catch (error) {
        console.error('Error fetching article suggestions:', error);
        return [];
    }
}

export async function fetchArticleContent(articleId: string): Promise<string | null> {
    try {
        const url = `${API_ENDPOINT}/commits/head/${articleId}/Content`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`API request failed: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.content) {
            return data.content;
        } else {
            console.error(`No content received for ${articleId}`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching content:', error);
        return null;
    }
}
