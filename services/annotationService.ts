import { App, normalizePath } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';

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


    getAnnotationsFilePath(sourcePath: string): string {
        const baseFilename = sourcePath.split('/').pop()?.split('.')[0] || 'unknown';
        return normalizePath(`${this.ANNOTATIONS_FOLDER}/${baseFilename}.annotations`);
    }


    async loadAnnotations(sourcePath: string): Promise<AnnotationsFile> {
        await this.ensureAnnotationsDirectory();
        
        const annotationsPath = this.getAnnotationsFilePath(sourcePath);
        
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


    async saveAnnotation(
        data: Omit<AnnotationData, 'id' | 'timestamp'>, 
        type: 'comment' | 'note'
    ): Promise<string> {
        await this.ensureAnnotationsDirectory();
        
        if (!data.src) {
            throw new Error('Source path is required');
        }
        
        const id = uuidv4();
        const annotationData: AnnotationData = {
            ...data,
            id,
            timestamp: Date.now()
        };
        
        const annotations = await this.loadAnnotations(data.src);
        
        if (type === 'comment') {
            annotations.comments[id] = annotationData;
        } else {
            annotations.notes[id] = annotationData;
        }
        
        const annotationsPath = this.getAnnotationsFilePath(data.src);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
        );
        
        return id;
    }

    async deleteAnnotation(
        sourcePath: string, 
        id: string, 
        type: 'comment' | 'note'
    ): Promise<boolean> {
        if (!sourcePath || !id) return false;
        
        const annotations = await this.loadAnnotations(sourcePath);
        
        if (type === 'comment' && annotations.comments[id]) {
            delete annotations.comments[id];
        } else if (type === 'note' && annotations.notes[id]) {
            delete annotations.notes[id];
        } else {
            return false;
        }
        
        const annotationsPath = this.getAnnotationsFilePath(sourcePath);
        await this.app.vault.adapter.write(
            annotationsPath, 
            JSON.stringify(annotations, null, 2)
        );
        
        return true;
    }
}
