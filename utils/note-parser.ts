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
        if (paragraph.trim() === '') {
            continue;
        }
        
        const lines = paragraph.split('\n');
        let paragraphWords: string[] = [];
        
        for (const line of lines) {
            if (line.trim().startsWith('#')) {
                continue;
            }
            
            const lineWords = line.split(/\s+/).filter(word => word.length > 0);
            paragraphWords = paragraphWords.concat(lineWords);
        }
        
        if (paragraphWords.length === 0) {
            continue;
        }
        
        for (let i = 0; i < paragraphWords.length; i++) {
            const word = paragraphWords[i];
            
            const linkMatch = word.match(/\[\[(Tx[^\]]+)\]\]/);
            
            if (linkMatch && i > 0) { 
                const linkText = linkMatch[0]; 
                
                const prevStartIdx = Math.max(0, i - 5);
                const previousWords = paragraphWords.slice(prevStartIdx, i).join(' ');
                
                const nextEndIdx = Math.min(paragraphWords.length, i + 6);
                const nextWords = paragraphWords.slice(i + 1, nextEndIdx).join(' ');
                
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
        
        counter += paragraphWords.length;
    }
    
    return results;
}

export function noteToAnnotationData(note: Note, filePath: string): AnnotationData {
    return {
        id: note.id,
        timestamp: Date.now(),
        src: filePath.split('/').pop() || '',
        src_txt_display: '',
        src_txt_start: '',
        src_txt_end: '',
        src_txt: '',
        src_range: [],
        src_txt_display_range: [],
        target: note.linkText.replace(/\[\[(Tx[^\]]+)\]\]/g, '$1'),
        target_txt_display: '',
        target_txt_start: '',
        target_txt_end: '',
        target_txt: '',
        target_range: [],
        target_txt_display_range: [],
        noteMeta: note
    };
}
