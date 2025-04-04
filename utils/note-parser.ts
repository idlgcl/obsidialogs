import { AnnotationData } from "./annotation-service";

import { v4 as uuidv4 } from 'uuid';

export interface Note {
    id: string;
    linkText: string;
    previousWords: string;
    nextWords: string;
    linkTextIndex: number[];
    previousWordsIndex: number[];
    nextWordsIndex: number[];
    fullIndex: number[];
}

export function parseNotes(text: string): Note[] {
    const paragraphs = text.split(/\n\s*\n/); 
    const results: Note[] = [];
    let counter = 0;
    
    for (const paragraph of paragraphs) {
        if (paragraph.trim().startsWith('#') || paragraph.trim() === '') {
            const words = paragraph.split(/\s+/).filter(word => word.length > 0);
            counter += words.length;
            continue;
        }
        
        const words = paragraph.split(/\s+/).filter(word => word.length > 0);
        
        if (words.length === 0) {
            continue;
        }
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            
            const linkMatch = word.match(/\[\[(Tx[^\]]+)\]\]/);
            
            if (linkMatch && i > 0) { 
                const linkText = linkMatch[0]; 
                
                const prevStartIdx = Math.max(0, i - 5);
                const previousWords = words.slice(prevStartIdx, i).join(' ');
                
                const nextEndIdx = Math.min(words.length, i + 6);
                const nextWords = words.slice(i + 1, nextEndIdx).join(' ');
                
                const previousWordsIndex: number[] = [];
                for (let j = prevStartIdx; j < i; j++) {
                    previousWordsIndex.push(counter + j);
                }
                
                const linkTextIndex: number[] = [counter + i];
                
                const nextWordsIndex: number[] = [];
                for (let j = i + 1; j < nextEndIdx; j++) {
                    nextWordsIndex.push(counter + j);
                }
                
                const fullIndex = [
                    ...previousWordsIndex,
                    ...linkTextIndex,
                    ...nextWordsIndex
                ];
                
                const id = uuidv4();
                
                results.push({
                    id,
                    linkText,
                    previousWords,
                    nextWords,
                    linkTextIndex,
                    previousWordsIndex,
                    nextWordsIndex,
                    fullIndex
                });
            }
        }
        
        counter += words.length;
    }
    
    return results;
}

export function noteToAnnotationData(note: Note, filePath: string): AnnotationData {
    return {
        id: note.id,
        timestamp: Date.now(),
        src: filePath.split('/').pop() || '',
        src_txt_display: note.previousWords,
        src_txt_start: note.previousWords.split(' ')[0] || '',
        src_txt_end: note.nextWords.split(' ').pop() || '',
        src_txt: `${note.previousWords} ${note.linkText} ${note.nextWords}`,
        src_range: note.fullIndex,
        src_txt_display_range: note.previousWordsIndex,
        target: note.linkText.replace(/\[\[(Tx[^\]]+)\]\]/g, '$1'),
        target_txt_display: note.linkText,
        target_txt_start: '',
        target_txt_end: '',
        target_txt: '',
        target_range: [],
        target_txt_display_range: [],
        noteMeta: note
    };
}
