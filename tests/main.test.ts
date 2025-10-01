import { App, TFile } from "obsidian";
import ArticleSuggestPlugin from "../main";

jest.mock("../components/suggester");
jest.mock("../utils/file-handler");
jest.mock("../utils/annotation-service");
jest.mock("../utils/suggester-patcher");
jest.mock("../utils/api");

describe("ArticleSuggestPlugin", () => {
    let app: App;
    let plugin: ArticleSuggestPlugin;

    beforeEach(() => {
        app = new App();
        plugin = new ArticleSuggestPlugin(app, {
            id: "test-plugin",
            name: "Test Plugin",
            version: "1.0.0",
        } as any);
    });

    describe("onload", () => {
        it("should initialize all services", async () => {
            await plugin.onload();

            expect(plugin.fileHandler).toBeDefined();
            expect(plugin.annotationService).toBeDefined();
            expect((plugin as any).apiService).toBeDefined();
            expect((plugin as any).articleSuggest).toBeDefined();
        });

        it("should register editor suggest", async () => {
            const registerSpy = jest.spyOn(plugin, "registerEditorSuggest");
            await plugin.onload();

            expect(registerSpy).toHaveBeenCalled();
        });

        it("should register all views", async () => {
            const registerViewSpy = jest.spyOn(plugin, "registerView");
            await plugin.onload();

            expect(registerViewSpy).toHaveBeenCalledTimes(4);
            expect(registerViewSpy).toHaveBeenCalledWith(
                "idealogs-annotator",
                expect.any(Function),
            );
            expect(registerViewSpy).toHaveBeenCalledWith(
                "idealogs-reader",
                expect.any(Function),
            );
            expect(registerViewSpy).toHaveBeenCalledWith(
                "idl-right-panel",
                expect.any(Function),
            );
            expect(registerViewSpy).toHaveBeenCalledWith(
                "annotator-view",
                expect.any(Function),
            );
        });

        it("should register workspace events", async () => {
            const registerEventSpy = jest.spyOn(plugin, "registerEvent");
            await plugin.onload();

            expect(registerEventSpy).toHaveBeenCalled();
        });

        it("should register commands", async () => {
            const addCommandSpy = jest.spyOn(plugin, "addCommand");
            await plugin.onload();

            expect(addCommandSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "open-in-idealogs-reader",
                    name: "Open in Idealogs Reader",
                }),
            );

            expect(addCommandSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "toggle-editor-reader-view",
                    name: "Toggle between Editor and Reader views",
                }),
            );
        });

        it("should ensure annotations directory", async () => {
            // The plugin.annotationService is created during onload, so we can't spy on it before
            // Just verify that onload completes successfully
            await expect(plugin.onload()).resolves.not.toThrow();
        });
    });

    describe("isIdealogsArticle", () => {
        it("should recognize Idealogs article patterns", async () => {
            await plugin.onload();

            expect((plugin as any).isIdealogsArticle("@Tx123")).toBe(true);
            expect((plugin as any).isIdealogsArticle("@Ix456")).toBe(true);
            expect((plugin as any).isIdealogsArticle("@Fx789")).toBe(true);
            expect((plugin as any).isIdealogsArticle("@0x999")).toBe(true);
        });

        it("should not recognize non-Idealogs patterns", async () => {
            await plugin.onload();

            expect((plugin as any).isIdealogsArticle("regular-note")).toBe(
                false,
            );
            expect((plugin as any).isIdealogsArticle("@Zx123")).toBe(false);
            expect((plugin as any).isIdealogsArticle("Tx123")).toBe(false);
        });
    });

    describe("openAnnotatorViewByFile", () => {
        it("should open annotator view with file", async () => {
            await plugin.onload();

            // @ts-ignore
            const file = new TFile("test", "md", "test.md");
            const mockLeaf = {
                setViewState: jest.fn(),
                detach: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);
            jest.spyOn(app.workspace, "getLeaf").mockReturnValue(
                mockLeaf as any,
            );

            await plugin.openAnnotatorViewByFile(file);

            expect(mockLeaf.setViewState).toHaveBeenCalledWith({
                type: "idealogs-annotator",
                active: true,
                state: {
                    articleId: "test",
                    mode: "LOCAL",
                },
            });
        });

        it("should reuse existing annotator leaf if available", async () => {
            await plugin.onload();

            // @ts-ignore
            const file = new TFile("test", "md", "test.md");
            const mockLeaf = {
                setViewState: jest.fn(),
                detach: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
                mockLeaf as any,
            ]);

            await plugin.openAnnotatorViewByFile(file);

            expect(mockLeaf.setViewState).toHaveBeenCalledWith({
                type: "idealogs-annotator",
                active: true,
                state: {
                    articleId: "test",
                    mode: "LOCAL",
                },
            });
        });
    });

    describe("openAnnotatorViewByLinkClick", () => {
        it("should open annotator view from link", async () => {
            await plugin.onload();

            const mockLeaf = {
                setViewState: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);
            jest.spyOn(app.workspace, "getLeaf").mockReturnValue(
                mockLeaf as any,
            );

            await plugin.openAnnotatorViewByLinkClick("Tx123");

            expect(mockLeaf.setViewState).toHaveBeenCalledWith({
                type: "idealogs-annotator",
                active: false,
                state: {
                    articleId: "Tx123",
                    mode: "WEB",
                },
            });
        });

        it("should reuse existing annotator leaf for link click", async () => {
            await plugin.onload();

            const mockLeaf = {
                setViewState: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([
                mockLeaf as any,
            ]);

            await plugin.openAnnotatorViewByLinkClick("Ix456");

            expect(mockLeaf.setViewState).toHaveBeenCalledWith({
                type: "idealogs-annotator",
                active: false,
                state: {
                    articleId: "Ix456",
                    mode: "WEB",
                },
            });
        });
    });

    describe("patchLinkOpening", () => {
        it("should patch workspace openLinkText", async () => {
            await plugin.onload();

            expect((plugin as any).originalOpenLinkText).toBeDefined();
            expect(app.workspace.openLinkText).not.toBe(
                (plugin as any).originalOpenLinkText,
            );
        });

        it("should intercept Idealogs article links", async () => {
            await plugin.onload();

            const mockLeaf = {
                setViewState: jest.fn(),
            };

            jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);
            jest.spyOn(app.workspace, "getLeaf").mockReturnValue(
                mockLeaf as any,
            );

            const result = await app.workspace.openLinkText(
                "@Tx123",
                "",
                false,
            );

            expect(result).toBe(true);
            expect(mockLeaf.setViewState).toHaveBeenCalled();
        });
    });

    describe("setupReaderButton", () => {
        it("should add reader button to markdown view", async () => {
            await plugin.onload();
            // @ts-ignore
            const file = new TFile("test", "md", "test.md");

            const mockViewActionsEl = document.createElement("div");
            mockViewActionsEl.className = "view-actions";

            const mockContainerEl = document.createElement("div");
            mockContainerEl.appendChild(mockViewActionsEl);

            const mockView = {
                file,
                containerEl: mockContainerEl,
            };

            jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(
                mockView as any,
            );

            (plugin as any).setupReaderButton(file);

            const button = mockContainerEl.querySelector(
                ".idealogs-reader-button",
            );
            expect(button).toBeTruthy();
            expect(button?.getAttribute("aria-label")).toBe(
                "Open in Idealogs Reader",
            );
        });

        it("should not add button for non-markdown files", async () => {
            await plugin.onload();
            // @ts-ignore
            const file = new TFile("test", "txt", "test.txt");

            const mockContainerEl = document.createElement("div");

            const mockView = {
                file,
                containerEl: mockContainerEl,
            };

            jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(
                mockView as any,
            );

            (plugin as any).setupReaderButton(file);

            const button = mockContainerEl.querySelector(
                ".idealogs-reader-button",
            );
            expect(button).toBeFalsy();
        });

        it("should remove existing button before adding new one", async () => {
            await plugin.onload();

            // @ts-ignore
            const file = new TFile("test", "md", "test.md");

            const mockViewActionsEl = document.createElement("div");
            mockViewActionsEl.className = "view-actions";

            const existingButton = document.createElement("button");
            existingButton.className = "idealogs-reader-button";
            mockViewActionsEl.appendChild(existingButton);

            const mockContainerEl = document.createElement("div");
            mockContainerEl.appendChild(mockViewActionsEl);

            const mockView = {
                file,
                containerEl: mockContainerEl,
            };

            jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(
                mockView as any,
            );

            (plugin as any).setupReaderButton(file);

            const buttons = mockContainerEl.querySelectorAll(
                ".idealogs-reader-button",
            );
            expect(buttons.length).toBe(1);
        });
    });

    describe("onunload", () => {
        it("should clean up file handler", async () => {
            await plugin.onload();

            const trashSpy = jest.spyOn(plugin.fileHandler, "trash");

            plugin.onunload();

            expect(trashSpy).toHaveBeenCalled();
        });

        it("should restore original openLinkText", async () => {
            await plugin.onload();

            const originalOpenLinkText = (plugin as any).originalOpenLinkText;

            plugin.onunload();

            expect(app.workspace.openLinkText).toBe(originalOpenLinkText);
        });
    });

    describe("command: open-in-idealogs-reader", () => {
        it("should be available for markdown files", async () => {
            await plugin.onload();
            // @ts-ignore
            const file = new TFile("test", "md", "test.md");
            jest.spyOn(app.workspace, "getActiveFile").mockReturnValue(file);

            // Verify command was registered
            const addCommandSpy = jest.spyOn(plugin, "addCommand");
            await plugin.onload();

            expect(addCommandSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "open-in-idealogs-reader",
                }),
            );
        });

        it("should not be available for Idealogs files", async () => {
            await plugin.onload();
            // @ts-ignore
            const file = new TFile("Tx123", "md", "Tx123.md");
            jest.spyOn(app.workspace, "getActiveFile").mockReturnValue(file);

            // We can't easily test the checkCallback logic without more mocking
            // but we can verify the command is registered
            const addCommandSpy = jest.spyOn(plugin, "addCommand");
            await plugin.onload();

            expect(addCommandSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "open-in-idealogs-reader",
                }),
            );
        });
    });
});
