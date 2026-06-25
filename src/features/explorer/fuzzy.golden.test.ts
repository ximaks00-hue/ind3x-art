import { describe, expect, it } from "vitest";

import golden from "../../../tests/fixtures/fuzzy_golden.json";
import { fuzzyScore } from "./fuzzy";

type GoldenCase = {
  query: string;
  text: string;
  match: boolean;
  score?: number;
};

describe("fuzzyScore golden vectors (EXP-007)", () => {
  it("matches shared fixtures with Rust search/mod.rs", () => {
    for (const row of golden.cases as GoldenCase[]) {
      const score = fuzzyScore(row.query, row.text);
      if (row.match) {
        expect(score, `query=${JSON.stringify(row.query)} text=${JSON.stringify(row.text)}`).toBe(
          row.score,
        );
      } else {
        expect(score, `query=${JSON.stringify(row.query)} text=${JSON.stringify(row.text)}`).toBeNull();
      }
    }
  });
});
