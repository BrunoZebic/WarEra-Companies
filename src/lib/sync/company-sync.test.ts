import { describe, expect, it } from "vitest";

import {
  advanceCompanySyncCursor,
  createInitialCompanySyncCursorState,
  parseCompanySyncCursor,
  serializeCompanySyncCursor,
} from "./company-sync";

describe("company sync cursor helpers", () => {
  it("serializes and parses active cursor state", () => {
    const state = {
      version: 1 as const,
      countryIndex: 12,
      userCursor: "cursor-123",
    };

    expect(parseCompanySyncCursor(serializeCompanySyncCursor(state))).toEqual(state);
  });

  it("advances within a country when another user page exists", () => {
    expect(
      advanceCompanySyncCursor(createInitialCompanySyncCursorState(), "next-page-cursor"),
    ).toEqual({
      version: 1,
      countryIndex: 0,
      userCursor: "next-page-cursor",
    });
  });

  it("advances to the next country when the current country is exhausted", () => {
    expect(
      advanceCompanySyncCursor(
        {
          version: 1,
          countryIndex: 4,
          userCursor: "old-cursor",
        },
        "",
      ),
    ).toEqual({
      version: 1,
      countryIndex: 5,
      userCursor: null,
    });
  });

  it("rejects legacy non-json cursors", () => {
    expect(() => parseCompanySyncCursor("legacy-cursor")).toThrow(
      "Invalid company sync cursor.",
    );
  });
});
