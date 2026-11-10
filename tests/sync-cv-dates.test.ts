import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { memeDate } from "@/lib/sync/cv";

describe("synchro CV", () => {
  it("une même date au format base ou Graph n'est pas une modification", () => {
    expect(memeDate("2026-01-01T10:00:00+00:00", "2026-01-01T10:00:00Z")).toBe(true);
    expect(memeDate("2026-01-01T10:00:00+00:00", "2026-01-02T10:00:00Z")).toBe(false);
    expect(memeDate(null, "2026-01-01T10:00:00Z")).toBe(false);
  });
});
