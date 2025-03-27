import { App, normalizePath } from 'obsidian';

export interface AnnotationData {
    id: string;
    timestamp: number;
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
        commentIndex: number,
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
        const id = `${sourceFilename}-${commentData.commentIndex.toString()}`;
        
        const annotationData: AnnotationData = {
            id,
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
        
        console.log('TARGET ARTICLE', commentData.targetArticle)
        const annotations = await this.loadAnnotations(commentData.targetArticle);
        
        annotations.comments[id] = annotationData;
        
        const annotationsPath = this.getAnnotationsFilePath(commentData.targetArticle);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
        );
        
        return id;
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
        targetDisplayIndices?: number[]
    }): Promise<string> {
        await this.ensureAnnotationsDirectory();
        
        if (!noteData.targetArticle || !noteData.sourceFilePath) {
            throw new Error('Target article and source path are required');
        }
        
        // Use provided ID or generate a timestamp-based one
        const id = noteData.id || Date.now().toString();
        const timestamp = Date.now();
        
        // Load existing annotations for the target article
        const annotations = await this.loadAnnotations(noteData.targetArticle);
        
        // Extract just the filename from the full path
        const sourceFilename = noteData.sourceFilePath.split('/').pop() || noteData.sourceFilePath;
        
        // Prepare the source text data
        const srcTxtDisplay = noteData.textDisplay;
        const srcTxtStart = noteData.textStart;
        const srcTxtEnd = noteData.textEnd;
        const srcTxt = `${srcTxtStart} ${srcTxtDisplay} ${srcTxtEnd}`;
        
        // Notes don't have source ranges/indices, so we use empty arrays
        const srcRange: number[] = [];
        const srcTxtDisplayRange: number[] = [];
        
        // Prepare the target text data
        const targetTxtDisplay = noteData.targetTextDisplay;
        const targetTxtStart = noteData.targetTextStart;
        const targetTxtEnd = noteData.targetTextEnd;
        const targetTxt = noteData.targetFullText || '';
        const targetRange = noteData.targetRangeIndices || [];
        const targetTxtDisplayRange = noteData.targetDisplayIndices || [];
        
        const annotationData: AnnotationData = {
            id,
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
            target_txt_display_range: targetTxtDisplayRange
        };
        
        // Add or update the note
        annotations.notes[id] = annotationData;
        
        // Save the annotations file
        const annotationsPath = this.getAnnotationsFilePath(noteData.targetArticle);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
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
}
