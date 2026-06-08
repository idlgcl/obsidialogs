import { App } from "obsidian";
import { AnnotationService } from "../../utils/annotation-service";

describe("AnnotationService.getAllLocalAnnotations", () => {
  it("collects annotations across files and dedupes by id", async () => {
    const app = new App();
    app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
    (app.vault.adapter as any).list = jest.fn().mockResolvedValue({
      files: [
        ".idealogs/annotations/Tx1.json",
        ".idealogs/annotations/note.json",
        ".idealogs/annotations/notes.txt",
      ],
      folders: [".idealogs/annotations/old"],
    });
    const fileA = {
      notes: {},
      comments: { c1: { id: "c1", kind: "Comment", targetId: "Tx1", sourceId: "note" } },
    };
    const fileB = {
      notes: { n1: { id: "n1", kind: "Note", targetId: "Tx2", sourceId: "note" } },
      comments: { c1: { id: "c1", kind: "Comment", targetId: "Tx1", sourceId: "note" } },
    };
    app.vault.adapter.read = jest
      .fn()
      .mockResolvedValueOnce(JSON.stringify(fileA))
      .mockResolvedValueOnce(JSON.stringify(fileB));

    const svc = new AnnotationService(app);
    const all = await svc.getAllLocalAnnotations();

    expect(all.map((a) => a.id).sort()).toEqual(["c1", "n1"]);
    expect(app.vault.adapter.read).toHaveBeenCalledTimes(2); // .txt skipped
  });
});
