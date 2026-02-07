/**
 * receipt_semantics.test.ts
 *
 * Purpose:
 * This test suite enforces the Normative Receipt Semantics specification.
 * It is NOT a behavior test, but a semantic guardrail to prevent silent violations.
 *
 * Any failure here indicates a BREAKING SEMANTIC CHANGE.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

function extractFunctionBody(src: string, name: string): { params: string; body: string } | null {
  const idx = src.indexOf(`function ${name}`);
  if (idx < 0) return null;

  // find "(" after function name
  const p0 = src.indexOf("(", idx);
  if (p0 < 0) return null;

  // find matching ")" for params (simple scan)
  let i = p0 + 1;
  let depthParen = 1;
  while (i < src.length && depthParen > 0) {
    const ch = src[i];
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    i++;
  }
  if (depthParen !== 0) return null;
  const p1 = i - 1;
  const params = src.slice(p0 + 1, p1);

  // find "{" that starts the function body
  const b0 = src.indexOf("{", p1);
  if (b0 < 0) return null;

  // scan to matching "}" using brace counting
  i = b0 + 1;
  let depthBrace = 1;
  while (i < src.length && depthBrace > 0) {
    const ch = src[i];
    if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    i++;
  }
  if (depthBrace !== 0) return null;
  const b1 = i - 1;
  const body = src.slice(b0 + 1, b1);

  return { params, body };
}


describe("Receipt Semantics — Normative Compliance", () => {
  /**
   * SECTION 1 — assess() purity
   */
  describe("assess() purity", () => {
    it("assess.ts must not perform I/O or spawn processes", () => {
      const src = readSource("src/tools/assess.ts");

      // hard forbidden: file/process/network
      expect(src).not.toMatch(/\bspawnSync\b/);
      expect(src).not.toMatch(/\bexecSync\b/);
      expect(src).not.toMatch(/\bchild_process\b/);

      expect(src).not.toMatch(/\bexistsSync\b/);
      expect(src).not.toMatch(/\breadFileSync\b/);
      expect(src).not.toMatch(/\bwriteFileSync\b/);
      expect(src).not.toMatch(/\bappendFileSync\b/);
      expect(src).not.toMatch(/\bmkdirSync\b/);

      expect(src).not.toMatch(/\bfetch\b/i);
      expect(src).not.toMatch(/\baxios\b/i);
      expect(src).not.toMatch(/\bhttp\b/i);
      expect(src).not.toMatch(/\bhttps\b/i);

      // also forbidden: importing receipt store (assess must not read server state)
      expect(src).not.toMatch(/receipt_store/i);
      expect(src).not.toMatch(/from\s+["']\.\.\/guardrail\/receipt_store/i);
    });
  });

  /**
 * SECTION 2 — receipt_id constraints
 */
  describe("receipt_id constraints", () => {
    it("receipt_id must be random and independent from plan_hash", () => {
      const src = readSource("src/tools/assess.ts");
  
      const fn = extractFunctionBody(src, "makeReceiptId");
      expect(fn).not.toBeNull();
  
      // must take no parameters
      expect(fn!.params.trim()).toBe("");
  
      // must use randomness/uuid
      expect(fn!.body).toMatch(/\brandomUUID\b/i);
  
      // must not reference plan_hash or hashing inside receipt id generation
      expect(fn!.body).not.toMatch(/\bplan_hash\b/i);
      expect(fn!.body).not.toMatch(/\bbuildPlanHash\b/i);
      expect(fn!.body).not.toMatch(/\bsha256\b/i);
      expect(fn!.body).not.toMatch(/\bcreateHash\b/i);
    });
  });
  
  /**
   * SECTION 3 — lifecycle constraints
   */
  describe("receipt lifecycle constraints", () => {
    it("receipt_store must not introduce extra lifecycle states", () => {
      const src = readSource("src/guardrail/receipt_store.ts");

      expect(src).not.toMatch(/\bexpired\b/i);
      expect(src).not.toMatch(/\brevoked\b/i);
      expect(src).not.toMatch(/\binvalidated\b/i);
      expect(src).not.toMatch(/\bpending\b/i);

      expect(src).toMatch(/\bmissing\b/);
      expect(src).toMatch(/\bactive\b/);
      expect(src).toMatch(/\bconsumed\b/);
    });
  });

  /**
   * SECTION 4 — idempotent consumption
   */
  describe("idempotent consumption", () => {
    it("consumeReceipt must exist", async () => {
      const mod = await import("../src/guardrail/receipt_store");
      expect(typeof mod.consumeReceipt).toBe("function");
    });
  });

  /**
   * SECTION 5 — forbidden client authority
   */
  describe("client authority violations", () => {
    it("receipt_store must not infer state by reading receipts.jsonl", () => {
      const src = readSource("src/guardrail/receipt_store.ts");

      // forbidden read paths
      expect(src).not.toMatch(/\breadFileSync\b/);
      expect(src).not.toMatch(/\bcreateReadStream\b/);

      // evidence append must exist
      expect(src).toMatch(/\bappendFileSync\b/);
    });
  });
});
