import { App, normalizePath } from 'obsidian';

export interface AnnotationData {
    id: string;
    timestamp: number;
    kind: 'COMMENT' | 'NOTE';
    src: string;
    src_txt_display: string;
    src_txt_start: string;
    src_txt_end: string;
    src_txt: string;
    src_range: number[];
    src_txt_display_range: number[];
    target: string;
    target_txt_display: string;
    target_txt_start: string;
    target_txt_end: string;
    target_txt: string;
    target_range: number[];
    target_txt_display_range: number[];
    noteMeta?: any; 
    isValid?: boolean;
    validationMessage?: string;
}

export interface AnnotationsFile {
    comments: Record<string, AnnotationData>;
    notes: Record<string, AnnotationData>;
}

export class AnnotationService {
    private app: App;
    private readonly ANNOTATIONS_FOLDER = '.idealogs/annotations';

    constructor(app: App) {
        this.app = app;
    }

    async ensureAnnotationsDirectory(): Promise<void> {
        const folderPath = normalizePath(this.ANNOTATIONS_FOLDER);
        
        if (!await this.app.vault.adapter.exists(folderPath)) {
            const idealogsFolderPath = normalizePath('.idealogs');
            if (!await this.app.vault.adapter.exists(idealogsFolderPath)) {
                await this.app.vault.createFolder(idealogsFolderPath);
            }
            
            await this.app.vault.createFolder(folderPath);
        }
    }

    getAnnotationsFilePath(targetPath: string): string {
        const baseFilename = targetPath.split('/').pop()?.split('.')[0] || 'unknown';
        return normalizePath(`${this.ANNOTATIONS_FOLDER}/${baseFilename}.annotations`);
    }

    async loadAnnotations(targetPath: string): Promise<AnnotationsFile> {
        await this.ensureAnnotationsDirectory();
        
        const annotationsPath = this.getAnnotationsFilePath(targetPath);
        
        if (await this.app.vault.adapter.exists(annotationsPath)) {
            try {
                const fileContent = await this.app.vault.adapter.read(annotationsPath);
                return JSON.parse(fileContent);
            } catch (error) {
                console.error(`Error reading annotations file: ${error}`);
                return { comments: {}, notes: {} };
            }
        }
        
        return { comments: {}, notes: {} };
    }

    async saveComment(commentData: {
        commentId: string,
        textDisplay: string,
        commentBody: string,
        targetArticle: string,
        targetTextStart: string,
        targetTextEnd: string,
        targetTextDisplay: string,
        targetStartIndex?: number,
        targetEndIndex?: number,
        targetFullText?: string,
        targetRangeIndices?: number[],
        targetDisplayIndices?: number[],
        srcIndices: number[],
        sourceFilePath: string
    }): Promise<string> {
        await this.ensureAnnotationsDirectory();
        
        if (!commentData.targetArticle || !commentData.sourceFilePath) {
            throw new Error('Target article and source path are required');
        }
        
        
        const timestamp = Date.now();
        
        const srcTxtDisplay = commentData.textDisplay;
        const srcTxtStart = srcTxtDisplay.split(/\s+/)[0] || '';
        const srcTxtEnd = commentData.commentBody.split(/\s+/).pop() || '';
        const srcTxt = `${srcTxtDisplay} ${commentData.commentBody}`;
        const srcRange = commentData.srcIndices;
        const srcTxtDisplayRange = srcRange.slice(0, srcTxtDisplay.split(/\s+/).length);
        
        const targetTxtDisplay = commentData.targetTextDisplay;
        const targetTxtStart = commentData.targetTextStart;
        const targetTxtEnd = commentData.targetTextEnd;
        const targetTxt = commentData.targetFullText || '';
        const targetRange = commentData.targetRangeIndices || [];
        const targetTxtDisplayRange = commentData.targetDisplayIndices || [];

        const sourceFilename = commentData.sourceFilePath.split('/').pop() || commentData.sourceFilePath;
        
        const annotationData: AnnotationData = {
            id: commentData.commentId,
            kind: 'COMMENT',
            timestamp,
            src: sourceFilename,
            src_txt_display: srcTxtDisplay,
            src_txt_start: srcTxtStart,
            src_txt_end: srcTxtEnd,
            src_txt: srcTxt,
            src_range: srcRange,
            src_txt_display_range: srcTxtDisplayRange,
            target: commentData.targetArticle,
            target_txt_display: targetTxtDisplay,
            target_txt_start: targetTxtStart,
            target_txt_end: targetTxtEnd,
            target_txt: targetTxt,
            target_range: targetRange,
            target_txt_display_range: targetTxtDisplayRange
        };
        
        const annotations = await this.loadAnnotations(commentData.targetArticle);
        
        annotations.comments[commentData.commentId] = annotationData;
        
        const annotationsPath = this.getAnnotationsFilePath(commentData.targetArticle);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
        );

        const sourceAnnotations = await this.loadAnnotations(commentData.sourceFilePath);
        sourceAnnotations.comments[commentData.commentId] = annotationData;
        const sourceAnnotationsPath = this.getAnnotationsFilePath(commentData.sourceFilePath);
        await this.app.vault.adapter.write(
            sourceAnnotationsPath, 
            JSON.stringify(sourceAnnotations, null, 2)
        );
        
        return commentData.commentId;
    }

    async saveNote(noteData: {
        id?: string,
        sourceFilePath: string,
        textStart: string,
        textEnd: string,
        textDisplay: string,
        targetArticle: string,
        targetTextStart: string,
        targetTextEnd: string,
        targetTextDisplay: string,
        targetStartIndex?: number,
        targetEndIndex?: number,
        targetFullText?: string,
        targetRangeIndices?: number[],
        targetDisplayIndices?: number[],
        noteMeta?: any
    }): Promise<string> {
        await this.ensureAnnotationsDirectory();
        
        if (!noteData.targetArticle || !noteData.sourceFilePath) {
            throw new Error('Target article and source path are required');
        }
        
        const id = noteData.id || Date.now().toString();
        const timestamp = Date.now();
        
        let sourceContent = "";
        try {
            sourceContent = await this.app.vault.adapter.read(noteData.sourceFilePath);
        } catch (error) {
            console.error(`Error reading source file: ${error}`);
            throw new Error(`Could not read source file: ${error.message}`);
        }
        
        const startPos = sourceContent.indexOf(noteData.textStart);
        const endPos = sourceContent.indexOf(noteData.textEnd) + noteData.textEnd.length;
        
        if (startPos === -1 || endPos === -1) {
            throw new Error('Could not locate text boundaries in source file');
        }
        
        const fullText = sourceContent.substring(startPos, endPos);
        
        const srcTxt = fullText.replace(/\[\[.*?\]\]/g, '');
        
        const sourceFilename = noteData.sourceFilePath.split('/').pop() || noteData.sourceFilePath;
        
        const srcTxtDisplay = noteData.textDisplay;
        const srcTxtStart = noteData.textStart;
        const srcTxtEnd = noteData.textEnd;
        
        const srcRange: number[] = [];
        const srcTxtDisplayRange: number[] = [];
        
        const targetTxtDisplay = noteData.targetTextDisplay;
        const targetTxtStart = noteData.targetTextStart;
        const targetTxtEnd = noteData.targetTextEnd;
        const targetTxt = noteData.targetFullText || '';
        const targetRange = noteData.targetRangeIndices || [];
        const targetTxtDisplayRange = noteData.targetDisplayIndices || [];
        
        const annotationData: AnnotationData = {
            id,
            kind: 'NOTE',
            timestamp,
            src: sourceFilename,
            src_txt_display: srcTxtDisplay,
            src_txt_start: srcTxtStart,
            src_txt_end: srcTxtEnd,
            src_txt: srcTxt,
            src_range: srcRange,
            src_txt_display_range: srcTxtDisplayRange,
            target: noteData.targetArticle,
            target_txt_display: targetTxtDisplay,
            target_txt_start: targetTxtStart,
            target_txt_end: targetTxtEnd,
            target_txt: targetTxt,
            target_range: targetRange,
            target_txt_display_range: targetTxtDisplayRange,
            noteMeta: noteData.noteMeta,
            isValid: true,
            validationMessage: ''
        };
        
        const targetAnnotations = await this.loadAnnotations(noteData.targetArticle);
        targetAnnotations.notes[id] = annotationData;
        const targetAnnotationsPath = this.getAnnotationsFilePath(noteData.targetArticle);
        await this.app.vault.adapter.write(
            targetAnnotationsPath, 
            JSON.stringify(targetAnnotations, null, 2)
        );
        
        const sourceAnnotations = await this.loadAnnotations(noteData.sourceFilePath);
        sourceAnnotations.notes[id] = annotationData;
        const sourceAnnotationsPath = this.getAnnotationsFilePath(noteData.sourceFilePath);
        await this.app.vault.adapter.write(
            sourceAnnotationsPath, 
            JSON.stringify(sourceAnnotations, null, 2)
        );
        
        return id;
    }

    async deleteAnnotation(
        targetPath: string, 
        id: string, 
        type: 'comment' | 'note'
    ): Promise<boolean> {
        if (!targetPath || !id) return false;
        
        const annotations = await this.loadAnnotations(targetPath);
        
        if (type === 'comment' && annotations.comments[id]) {
            delete annotations.comments[id];
        } else if (type === 'note' && annotations.notes[id]) {
            delete annotations.notes[id];
        } else {
            return false;
        }
        
        const annotationsPath = this.getAnnotationsFilePath(targetPath);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
        );
        
        return true;
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async validateComment(annotation: AnnotationData, sourceFilePath: string): Promise<{isValid: boolean, message?: string}> {
        try {
            if (!await this.app.vault.adapter.exists(sourceFilePath)) {
                return {
                    isValid: false,
                    message: `Source document not found: ${sourceFilePath}`
                };
            }
    
            const sourceContent = await this.app.vault.adapter.read(sourceFilePath);
            const content = sourceContent.replace(/\[\[.*?\|?\d*?\]\]/g, '');
            
            const startRegex = new RegExp(`\\b${this.escapeRegExp(annotation.src_txt_start)}\\b`);
        
            const startMatch = startRegex.exec(content);
            
            if (!startMatch) {
                return {
                    isValid: false,
                    message: `Text Start not found in document: "${annotation.src_txt_start}"`
                };
            }

            const exactEndText = this.escapeRegExp(annotation.src_txt_end);
            const exactEndRegex = new RegExp(`\\b${exactEndText}(?:\\s|$)`, 'g');
            
            const endMatch = exactEndRegex.exec(content);
            
            if (!endMatch) {
                return {
                    isValid: false,
                    message: `Text End not found in document: "${annotation.src_txt_end}"`
                };
            }
    
            const startIndex = startMatch.index;
            const endIndex = endMatch.index + annotation.src_txt_end.length;
    
            if (endIndex < startIndex) {
                return {
                    isValid: false,
                    message: `Text end appears before text start in the document`
                };
            }
            

            if (!annotation.src_txt_display.startsWith(annotation.src_txt_start)) {
                return {
                    isValid: false,
                    message: `Text start "${annotation.src_txt_start}" must be the beginning of text display "${annotation.src_txt_display}"`
                };
            }
            
            const boundedText = content.substring(startIndex, endIndex);
            const exactDisplayRegex = new RegExp(
                `${this.escapeRegExp(annotation.src_txt_display)}`
            );
            
            const displayTextFound = exactDisplayRegex.test(boundedText);
            
            if (!displayTextFound) {
                return {
                    isValid: false,
                    message: `Display text "${annotation.src_txt_display}" not found between start and end markers`
                };
            }
    
            return { isValid: true };
        }
        catch (error) {
            console.error(`Error validating annotation: ${error}`);
            return {
                isValid: false,
                message: `Error validating: ${error.message}`
            };
        }
    }
    
    async validateNote(annotation: AnnotationData, sourceFilePath: string): Promise<{isValid: boolean, message?: string}> {
        try {
            if (!await this.app.vault.adapter.exists(sourceFilePath)) {
                return {
                    isValid: false,
                    message: `Source document not found: ${sourceFilePath}`
                };
            }
    
            const sourceContent = await this.app.vault.adapter.read(sourceFilePath);
            
            const startRegex = new RegExp(`\\b${this.escapeRegExp(annotation.src_txt_start)}\\b`);
            
            const endRegex = new RegExp(`\\b${this.escapeRegExp(annotation.src_txt_end)}\\b`);
            
            const startMatch = startRegex.exec(sourceContent);
            const endMatch = endRegex.exec(sourceContent);
            
            if (!startMatch) {
                return {
                    isValid: false,
                    message: `Text Start not found in document: "${annotation.src_txt_start}"`
                };
            }
            if (!endMatch) {
                return {
                    isValid: false,
                    message: `Text End not found in document: "${annotation.src_txt_end}"`
                };
            }

            const startIndex = startMatch.index;
            const endIndex = endMatch.index + annotation.src_txt_end.length;
    
            if (endIndex < startIndex) {
                return {
                    isValid: false,
                    message: `Text end appears before text start in the document`
                };
            }
            

            const boundedText = sourceContent.substring(startIndex, endIndex);
    
            const displayWords = annotation.src_txt_display.split(/\s+/);
            let displayTextFound = false;

            if (displayWords.length === 1) {
                const singleWordRegex = new RegExp(`\\b${this.escapeRegExp(annotation.src_txt_display)}\\b`);
                displayTextFound = singleWordRegex.test(boundedText);
            } else {
                const flexibleSpacingRegex = new RegExp(
                    displayWords.map(word => `\\b${this.escapeRegExp(word)}\\b`).join('\\s+')
                );
                displayTextFound = flexibleSpacingRegex.test(boundedText);
            }

            if (!displayTextFound) {
                return {
                    isValid: false,
                    message: `Display text "${annotation.src_txt_display}" not found between start and end markers`
                };
            }

            if (annotation.target) {
                const expectedLinkText = `[[${annotation.target}]]`;
                
                const displayTextRegex = new RegExp(
                    displayWords.map(word => `\\b${this.escapeRegExp(word)}\\b`).join('\\s+')
                );
                const displayMatch = displayTextRegex.exec(sourceContent);
                
                if (displayMatch) {
                    const afterDisplayTextPos = displayMatch.index + displayMatch[0].length;
                    const textAfterDisplay = sourceContent.substring(afterDisplayTextPos, afterDisplayTextPos + 100).trim();
                    
                    const linkRegex = new RegExp(`^\\s*${this.escapeRegExp(expectedLinkText)}`);
                    
                    if (!linkRegex.test(textAfterDisplay)) {
                        return {
                            isValid: false,
                            message: `Display text "${annotation.src_txt_display}" is not followed by the expected link "${expectedLinkText}"`
                        };
                    }
                }
            }
    
            return { isValid: true };
        }
        catch (error) {
            console.error(`Error validating annotation: ${error}`);
            return {
                isValid: false,
                message: `Error validating: ${error.message}`
            };
        }
    }

    async validateAllAnnotations(filePath: string): Promise<void> {
        
        try {
            const annotations = await this.loadAnnotations(filePath);

            for (const commentId in annotations.comments) {
                const comment = annotations.comments[commentId];
                const {isValid, message} = await this.validateComment(comment, filePath);
                
                comment.isValid = isValid;
                comment.validationMessage = message;
                
                if (comment.target && comment.target !== filePath) {
                    await this.updateTargetFileAnnotation(comment);
                }
            }
            
            for (const noteId in annotations.notes) {
                const note = annotations.notes[noteId];
                const {isValid, message} = await this.validateNote(note, filePath);
                
                note.isValid = isValid;
                note.validationMessage = message;
  
                if (note.target && note.target !== filePath) {
                    await this.updateTargetFileAnnotation(note);
                }
            }
            
            await this.saveAnnotationsFile(filePath, annotations);
            
        } catch (error) {
            console.error(`Error in validateAllAnnotations: ${error}`);
        }
    }

    async updateTargetFileAnnotation(annotation: AnnotationData): Promise<void> {
        try {
            const targetPath = annotation.target;
            const targetAnnotations = await this.loadAnnotations(targetPath);
            
            if (annotation.kind === 'COMMENT' && targetAnnotations.comments[annotation.id]) {
                targetAnnotations.comments[annotation.id].isValid = annotation.isValid;
                targetAnnotations.comments[annotation.id].validationMessage = annotation.validationMessage;
   
            } 
            else if (annotation.kind === 'NOTE' && targetAnnotations.notes[annotation.id]) {
                targetAnnotations.notes[annotation.id].isValid = annotation.isValid;
                targetAnnotations.notes[annotation.id].validationMessage = annotation.validationMessage;
            }
            
            await this.saveAnnotationsFile(targetPath, targetAnnotations);
        } catch (error) {
            console.error(`Error updating target file annotation: ${error}`);
        }
    }
    
    private calculateTextSimilarity(s1: string, s2: string): number {
        if (s1 === s2) return 1.0; // identical strings
        if (s1.length === 0 || s2.length === 0) return 0.0; // one string is empty
        
        const len1 = s1.length;
        const len2 = s2.length;
        
        // build 2d array for Levenshtein distance
        const distance = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        
        // fill 1st column
        for (let i = 0; i <= len1; i++) distance[i][0] = i;
        
        // fill 1st row
        for (let j = 0; j <= len2; j++) distance[0][j] = j;
        
        // fill the matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                distance[i][j] = Math.min(
                    distance[i - 1][j] + 1, // deletion
                    distance[i][j - 1] + 1, // insertion
                    distance[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        // compute score
        const maxLen = Math.max(len1, len2);
        return 1 - (distance[len1][len2] / maxLen);
    }
    
    private async saveAnnotationsFile(targetPath: string, annotations: AnnotationsFile): Promise<void> {
        const annotationsPath = this.getAnnotationsFilePath(targetPath);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
        );
    }
}
