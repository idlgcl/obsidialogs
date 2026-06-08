import { ApiService, toApiAnnotation } from "../../utils/api";
import type { Annotation } from "../../utils/annotation-service";

const base: Annotation = {
  id: "a1",
  kind: "Comment",
  targetId: "Tx1",
  targetStart: "The",
  targetEnd: "end.",
  targetDisplay: "painful",
  targetText: "The painful end.",
  sourceId: "note.md",
  sourceStart: "Title",
  sourceEnd: "body",
  sourceDisplay: "Title",
  sourceText: "Title body",
  lineIndex: 3,
  hexId: "a",
};

describe("toApiAnnotation", () => {
  it("maps short fields to long API fields and tags local", () => {
    const out = toApiAnnotation(base, "tok-9");
    expect(out).toMatchObject({
      kind: "Comment",
      sourceId: "note.md",
      targetId: "Tx1",
      targetTextStart: "The",
      targetTextEnd: "end.",
      targetTextDisplay: "painful",
      targetText: "The painful end.",
      sourceTextStart: "Title",
      sourceTextEnd: "body",
      sourceTextDisplay: "Title",
      sourceText: "Title body",
      isLocal: true,
      localOwner: "tok-9",
    });
    expect(out).not.toHaveProperty("lineIndex");
    expect(out).not.toHaveProperty("hexId");
  });

  it("defaults missing optional source fields to empty strings", () => {
    const note: Annotation = {
      id: "b2",
      kind: "Note",
      targetId: "Tx2",
      targetStart: "a",
      targetEnd: "b",
      targetDisplay: "c",
      targetText: "a c b",
      sourceId: "n.md",
    };
    const out = toApiAnnotation(note, "t");
    expect(out.sourceTextStart).toBe("");
    expect(out.sourceText).toBe("");
  });

  it("includes the vault name when provided, empty otherwise", () => {
    expect(toApiAnnotation(base, "t", "MyVault").sourceVault).toBe("MyVault");
    expect(toApiAnnotation(base, "t").sourceVault).toBe("");
  });
});

describe("ApiService.upsertLocalAnnotation", () => {
  let api: ApiService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    api = new ApiService();
    fetchMock = global.fetch as jest.Mock;
    fetchMock.mockReset();
  });

  it("PUTs the mapped annotation to /annotations/{id}", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await api.upsertLocalAnnotation(base, "tok-9");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://annotations.test.com/annotations/a1");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body);
    expect(body.isLocal).toBe(true);
    expect(body.localOwner).toBe("tok-9");
    expect(body.targetTextDisplay).toBe("painful");
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: "err" });
    await expect(api.upsertLocalAnnotation(base, "t")).rejects.toThrow();
  });

  it("deleteLocalAnnotation marks the record deleted", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await api.deleteLocalAnnotation(base, "t");
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body).isDeleted).toBe(true);
  });
});
