import { AnnotationData } from "./annotation-service";

export interface Comment {
    title: string;
    body: string;
    indices: number[];
}

export function parseComments(text: string): Comment[] {
    const cleanText = text.replace(/\[\[[^\]]+\]\]/g, '');
    const segments = cleanText.split('\n');
    const pattern = /^(.*?)\.\s+(.*)$/;
    
    const results: Comment[] = [];
    let counter = 0;
    
    for (const segment of segments) {
        if (segment.startsWith('#')) {
            continue;
        }
        
        if (!segment.endsWith(':')) {
            const words = segment.split(/\s+/).filter(word => word.length > 0);
            counter += words.length;
            continue;
        }
        
        const match = segment.match(pattern);
        
        if (!match) {
            const words = segment.split(/\s+/).filter(word => word.length > 0);
            counter += words.length;
            continue;
        }
        
        const [, title, description] = match;
        
        const indices: number[] = [];
        const words = `${title} ${description}`.split(/\s+/).filter(word => word.length > 0);
        
        words.forEach(() => {
            indices.push(counter);
            counter++;
        });
        
        results.push({
            title: title.trim() + '.',
            body: description.trim(),
            indices: indices
        });
    }
    
    return results;
}


export function annotationToComment(annotation: AnnotationData): Comment {
    return {
        title: annotation.src_txt_display,
        body: annotation.src_txt,
        indices: annotation.src_range
    }
}
