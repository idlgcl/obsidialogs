import { App, TFile, MarkdownView } from "obsidian";
import { FileHandler } from "../../utils/file-handler";
import { ApiService } from "../../utils/api";

jest.mock("../../utils/api");
jest.mock("../../utils/annotation-service");

describe("FileHandler", () => {
    let app: App;
    let fileHandler: FileHandler;
    let mockApiService: jest.Mocked<ApiService>;

    beforeEach(() => {
        app = new App();
        fileHandler = new FileHandler(app);
        mockApiService = (fileHandler as any)
            .apiService as jest.Mocked<ApiService>;
    });

    describe("currentFile", () => {
        it("should return null initially", () => {
            expect(fileHandler.currentFile).toBeNull();
        });
    });

    describe("handleFileOpen", () => {
        it("should handle Idealogs file open", async () => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");
            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("File content");

            // @ts-ignore
            const mockView = new MarkdownView();    
            mockView.file = file;
            mockView.editor = {
                setValue: jest.fn(),
            } as any;

            jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(
                mockView as any,
            );

            await fileHandler.handleFileOpen(file);

            expect(fileHandler.currentFile).toBe(file);
        });

        it("should handle non-Idealogs markdown file open", async () => {
            // @ts-ignore
            const file = new TFile("regular-note", "md", "regular-note.md");

            const mockRightLeaf = {
                setViewState: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);
            (app.workspace as any).getRightLeaf = jest
                .fn()
                .mockReturnValue(mockRightLeaf);

            await fileHandler.handleFileOpen(file);

            expect(mockRightLeaf.setViewState).toHaveBeenCalledWith({
                type: expect.any(String),
                active: false,
            });
        });

        it("should trash previous Idealogs file when opening a new one", async () => {
            // @ts-ignore
            const file1 = new TFile("@Tx123", "md", "@Tx123.md");
            // @ts-ignore
            const file2 = new TFile("@Tx456", "md", "@Tx456.md");

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("Content");

            (app as any).fileManager = {
                trashFile: jest.fn(),
            };

            await fileHandler.handleFileOpen(file1);
            await fileHandler.handleFileOpen(file2);

            expect((app as any).fileManager.trashFile).toHaveBeenCalledWith(
                file1,
            );
        });

        it("should not handle non-TFile", async () => {
            await fileHandler.handleFileOpen(null as any);
            expect(fileHandler.currentFile).toBeNull();
        });

        it("should recognize all Idealogs file patterns", async () => {
            const patterns = ["@Ix", "@0x", "@Tx", "@Fx"];

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("Content");

            for (const pattern of patterns) {
                
                const file = new TFile(
                    // @ts-ignore
                    `${pattern}123`, 
                    "md",
                    `${pattern}123.md`,
                );
                await fileHandler.handleFileOpen(file);
                expect(fileHandler.currentFile).toBe(file);
            }
        });
    });

    describe("handleMarkdownFileOpen", () => {
        it("should fetch and update content for Idealogs file", async () => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");
            const mockContent = "Fetched content";

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue(mockContent);

            const mockEditor = {
                setValue: jest.fn(),
            };

            // @ts-ignore
            const mockView = new MarkdownView();
            mockView.file = file;
            mockView.editor = mockEditor as any;

            jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(
                mockView as any,
            );

            await fileHandler.handleMarkdownFileOpen(file);

            expect(mockApiService.fetchFileContent).toHaveBeenCalledWith(
                "@Tx123",
            );
            expect(mockEditor.setValue).toHaveBeenCalledWith(mockContent);
        });

        it("should not process non-Idealogs files", async () => {
            // @ts-ignore
            const file = new TFile("regular-note", "md", "regular-note.md");

            mockApiService.fetchFileContent = jest.fn();

            await fileHandler.handleMarkdownFileOpen(file);

            expect(mockApiService.fetchFileContent).not.toHaveBeenCalled();
        });

        it("should handle API errors gracefully", async () => {

            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation();
            mockApiService.fetchFileContent = jest
                .fn()
                .mockRejectedValue(new Error("API Error"));

            await fileHandler.handleMarkdownFileOpen(file);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Error fetching or updating content:",
                expect.any(Error),
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe("setViewToReadOnly", () => {
        it("should toggle to preview mode", (done) => {

            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            // @ts-ignore
            const mockView = new MarkdownView();
            mockView.file = file;
            mockView.getMode = jest.fn().mockReturnValue("source");

            const mockLeaf = {
                view: mockView,
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
                mockLeaf as any,
            ]);

            (app as any).commands = {
                executeCommandById: jest.fn(),
            };

            fileHandler.setViewToReadOnly(file);

            setTimeout(() => {
                expect(
                    (app as any).commands.executeCommandById,
                ).toHaveBeenCalledWith("markdown:toggle-preview");
                done();
            }, 150);
        });

        it("should not toggle if already in preview mode", (done) => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            // @ts-ignore
            const mockView = new MarkdownView();
            mockView.file = file;
            mockView.getMode = jest.fn().mockReturnValue("preview");

            const mockLeaf = {
                view: mockView,
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
                mockLeaf as any,
            ]);

            (app as any).commands = {
                executeCommandById: jest.fn(),
            };

            fileHandler.setViewToReadOnly(file);

            setTimeout(() => {
                expect(
                    (app as any).commands.executeCommandById,
                ).not.toHaveBeenCalled();
                done();
            }, 150);
        });
    });

    describe("setViewToEditMode", () => {
        it("should toggle to source mode", (done) => {
            // @ts-ignore
            const file = new TFile("test", "md", "test.md");

            // @ts-ignore
            const mockView = new MarkdownView();
            mockView.file = file;
            mockView.getMode = jest.fn().mockReturnValue("preview");

            const mockLeaf = {
                view: mockView,
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
                mockLeaf as any,
            ]);

            (app as any).commands = {
                executeCommandById: jest.fn(),
            };

            fileHandler.setViewToEditMode(file);

            setTimeout(() => {
                expect(
                    (app as any).commands.executeCommandById,
                ).toHaveBeenCalledWith("markdown:toggle-preview");
                done();
            }, 150);
        });
    });

    describe("checkIfFileStillOpen", () => {
        it("should trash file if not open", async () => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("Content");
            await fileHandler.handleFileOpen(file);

            (app as any).fileManager = {
                trashFile: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);

            fileHandler.checkIfFileStillOpen();

            expect((app as any).fileManager.trashFile).toHaveBeenCalledWith(
                file,
            );
            expect(fileHandler.currentFile).toBeNull();
        });

        it("should not trash file if still open", async () => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("Content");
            await fileHandler.handleFileOpen(file);

            // @ts-ignore
            const mockView = new MarkdownView();
            mockView.file = file;

            const mockLeaf = {
                view: mockView,
            };

            (app as any).fileManager = {
                trashFile: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
                mockLeaf as any,
            ]);

            fileHandler.checkIfFileStillOpen();

            expect((app as any).fileManager.trashFile).not.toHaveBeenCalled();
            expect(fileHandler.currentFile).toBe(file);
        });

        it("should do nothing if no current file", () => {
            (app as any).fileManager = {
                trashFile: jest.fn(),
            };

            fileHandler.checkIfFileStillOpen();

            expect((app as any).fileManager.trashFile).not.toHaveBeenCalled();
        });
    });

    describe("trash", () => {
        it("should delete current Idealogs file", async () => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("Content");
            await fileHandler.handleFileOpen(file);

            (app as any).fileManager = {
                trashFile: jest.fn(),
            };

            fileHandler.trash();

            expect((app as any).fileManager.trashFile).toHaveBeenCalledWith(
                file,
            );
            expect(fileHandler.currentFile).toBeNull();
        });

        it("should handle deletion errors gracefully", async () => {
            // @ts-ignore
            const file = new TFile("@Tx123", "md", "@Tx123.md");

            mockApiService.fetchFileContent = jest
                .fn()
                .mockResolvedValue("Content");
            await fileHandler.handleFileOpen(file);

            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation();

            (app as any).fileManager = {
                trashFile: jest.fn().mockImplementation(() => {
                    throw new Error("Deletion failed");
                }),
            };

            fileHandler.trash();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Error deleting Idealogs file:",
                expect.any(Error),
            );
            expect(fileHandler.currentFile).toBeNull();

            consoleErrorSpy.mockRestore();
        });

        it("should do nothing if no current file", () => {
            (app as any).fileManager = {
                trashFile: jest.fn(),
            };

            fileHandler.trash();

            expect((app as any).fileManager.trashFile).not.toHaveBeenCalled();
        });
    });
});
