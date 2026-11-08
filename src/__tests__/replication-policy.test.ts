import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  DEFAULT_REPLICATION_POLICY,
  resolveReplicationPolicy,
  isChildAutomaton,
  computeProfitCents,
  checkSpawnAllowed,
  checkFundAllowed,
} from "../replication/policy.js";

const policy = DEFAULT_REPLICATION_POLICY;

describe("replication policy defaults", () => {
  it("uses a $20 budget, 1 child, $10 profit threshold, $5 per child", () => {
    expect(policy.creatorFundedCents).toBe(2000);
    expect(policy.maxChildren).toBe(1);
    expect(policy.minProfitCents).toBe(1000);
    expect(policy.childFundingCents).toBe(500);
    expect(policy.childrenCanReplicate).toBe(false);
  });

  it("rejects invalid numbers and keeps defaults", () => {
    const p = resolveReplicationPolicy({ maxChildren: -1, minProfitCents: NaN } as any);
    expect(p.maxChildren).toBe(1);
    expect(p.minProfitCents).toBe(1000);
  });

  it("only enables childrenCanReplicate for literal true", () => {
    expect(resolveReplicationPolicy({ childrenCanReplicate: "yes" as any }).childrenCanReplicate).toBe(false);
  });
});

describe("computeProfitCents", () => {
  it("is balance minus creator funding", () => {
    // $8 credits + $14 USDC with $20 funded = $2 profit
    expect(computeProfitCents(800, 1400, policy)).toBe(200);
  });
});

describe("checkSpawnAllowed", () => {
  const base = { policy, isChild: false, activeChildren: 0 };

  it("blocks when not profitable", () => {
    const d = checkSpawnAllowed({ ...base, profitCents: 999 });
    expect(d.allowed).toBe(false);
  });

  it("allows at the profit threshold", () => {
    expect(checkSpawnAllowed({ ...base, profitCents: 1000 }).allowed).toBe(true);
  });

  it("blocks when a balance could not be read (fail closed)", () => {
    expect(checkSpawnAllowed({ ...base, profitCents: null }).allowed).toBe(false);
  });

  it("blocks at max children", () => {
    expect(checkSpawnAllowed({ ...base, activeChildren: 1, profitCents: 5000 }).allowed).toBe(false);
  });

  it("blocks children from replicating", () => {
    expect(checkSpawnAllowed({ ...base, isChild: true, profitCents: 5000 }).allowed).toBe(false);
  });
});

describe("checkFundAllowed", () => {
  const base = { policy, isChild: false, alreadyFundedCents: 0 };

  it("allows funding fully covered by profit", () => {
    expect(checkFundAllowed({ ...base, amountCents: 500, profitCents: 1000 }).allowed).toBe(true);
  });

  it("blocks funding that would use creator money", () => {
    expect(checkFundAllowed({ ...base, amountCents: 500, profitCents: 400 }).allowed).toBe(false);
  });

  it("blocks funding above the per-child cap", () => {
    expect(checkFundAllowed({ ...base, alreadyFundedCents: 300, amountCents: 300, profitCents: 5000 }).allowed).toBe(false);
  });

  it("blocks non-positive amounts", () => {
    expect(checkFundAllowed({ ...base, amountCents: 0, profitCents: 5000 }).allowed).toBe(false);
  });

  it("blocks children from funding", () => {
    expect(checkFundAllowed({ ...base, isChild: true, amountCents: 100, profitCents: 5000 }).allowed).toBe(false);
  });
});

describe("isChildAutomaton", () => {
  const mkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "automaton-policy-"));

  it("is true when config has a parentAddress", () => {
    expect(isChildAutomaton("0xabc", mkDir())).toBe(true);
  });

  it("is false without config parent and without genesis.json", () => {
    expect(isChildAutomaton(undefined, mkDir())).toBe(false);
  });

  it("is true when genesis.json names a parent", () => {
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, "genesis.json"), JSON.stringify({ parentAddress: "0x" + "1".repeat(40) }));
    expect(isChildAutomaton(undefined, dir)).toBe(true);
  });

  it("fails closed on unreadable genesis.json", () => {
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, "genesis.json"), "{not json");
    expect(isChildAutomaton(undefined, dir)).toBe(true);
  });
});
