/**
 * Replication Policy
 *
 * Hard, code-level gate for self-replication. The model may *want* to
 * replicate at any time; this module decides whether it is *allowed* to.
 *
 * Rules (all must hold):
 *   1. This automaton is not itself a child (children never replicate),
 *      unless `childrenCanReplicate` is explicitly enabled.
 *   2. Active children < `maxChildren`.
 *   3. Proven profit: (credits + USDC) - creatorFundedCents >= minProfitCents.
 *      Profit is measured against everything the creator ever put in, so a
 *      child can only ever be paid for out of money the automaton earned.
 *   4. Funding a child never pushes profit below zero, and never exceeds
 *      `childFundingCents` per child in total.
 *
 * The balance lookup fails closed: if a balance cannot be read, replication
 * is denied.
 */

import fs from "fs";
import path from "path";

export interface ReplicationPolicy {
  /** Max simultaneously active children. */
  maxChildren: number;
  /** Whether children may spawn grandchildren. */
  childrenCanReplicate: boolean;
  /** Total amount the creator has funded this automaton with, in cents. */
  creatorFundedCents: number;
  /** Profit (above creator funding) required before spawning a child. */
  minProfitCents: number;
  /** Max total funding a single child may receive, in cents. */
  childFundingCents: number;
}

export const DEFAULT_REPLICATION_POLICY: ReplicationPolicy = {
  maxChildren: 1,
  childrenCanReplicate: false,
  creatorFundedCents: 2000, // $20 budget
  minProfitCents: 1000, // $10 earned before the first child
  childFundingCents: 500, // $5 per child, paid from profit only
};

export interface ReplicationDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Merge a partial user policy with defaults, rejecting invalid numbers.
 */
export function resolveReplicationPolicy(
  raw?: Partial<ReplicationPolicy>,
): ReplicationPolicy {
  const merged: ReplicationPolicy = { ...DEFAULT_REPLICATION_POLICY, ...(raw ?? {}) };
  for (const key of [
    "maxChildren",
    "creatorFundedCents",
    "minProfitCents",
    "childFundingCents",
  ] as const) {
    const v = merged[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      merged[key] = DEFAULT_REPLICATION_POLICY[key];
    }
  }
  merged.childrenCanReplicate = merged.childrenCanReplicate === true;
  return merged;
}

/**
 * True if this automaton was spawned by a parent. Checks the config and the
 * genesis.json the parent writes into the child's ~/.automaton directory.
 */
export function isChildAutomaton(
  configParentAddress: string | undefined,
  automatonDir: string,
): boolean {
  if (configParentAddress) return true;
  try {
    const genesisPath = path.join(automatonDir, "genesis.json");
    if (!fs.existsSync(genesisPath)) return false;
    const genesis = JSON.parse(fs.readFileSync(genesisPath, "utf-8"));
    return typeof genesis?.parentAddress === "string" && genesis.parentAddress.length > 0;
  } catch {
    // Unreadable genesis: fail closed, treat as child.
    return true;
  }
}

/** Profit above everything the creator funded, in cents. */
export function computeProfitCents(
  creditsCents: number,
  usdcCents: number,
  policy: ReplicationPolicy,
): number {
  return Math.floor(creditsCents) + Math.floor(usdcCents) - policy.creatorFundedCents;
}

export interface SpawnCheckInput {
  policy: ReplicationPolicy;
  isChild: boolean;
  activeChildren: number;
  /** null when a balance could not be read. */
  profitCents: number | null;
}

export function checkSpawnAllowed(input: SpawnCheckInput): ReplicationDecision {
  const { policy, isChild, activeChildren, profitCents } = input;
  if (isChild && !policy.childrenCanReplicate) {
    return { allowed: false, reason: "Children may not replicate (replicationPolicy.childrenCanReplicate=false)." };
  }
  if (activeChildren >= policy.maxChildren) {
    return {
      allowed: false,
      reason: `Already at max children (${activeChildren}/${policy.maxChildren}).`,
    };
  }
  if (profitCents === null) {
    return { allowed: false, reason: "Could not read balances; replication denied (fail closed)." };
  }
  if (profitCents < policy.minProfitCents) {
    return {
      allowed: false,
      reason: `Not profitable enough to replicate: profit $${(profitCents / 100).toFixed(2)} < required $${(policy.minProfitCents / 100).toFixed(2)}. Earn more first.`,
    };
  }
  return { allowed: true, reason: `Profit $${(profitCents / 100).toFixed(2)} meets threshold.` };
}

export interface FundCheckInput {
  policy: ReplicationPolicy;
  isChild: boolean;
  amountCents: number;
  alreadyFundedCents: number;
  profitCents: number | null;
}

export function checkFundAllowed(input: FundCheckInput): ReplicationDecision {
  const { policy, isChild, amountCents, alreadyFundedCents, profitCents } = input;
  if (isChild && !policy.childrenCanReplicate) {
    return { allowed: false, reason: "Children may not fund children." };
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { allowed: false, reason: `amount_cents must be positive, got ${amountCents}.` };
  }
  if (alreadyFundedCents + amountCents > policy.childFundingCents) {
    return {
      allowed: false,
      reason: `Child funding cap: already $${(alreadyFundedCents / 100).toFixed(2)}, max $${(policy.childFundingCents / 100).toFixed(2)} per child.`,
    };
  }
  if (profitCents === null) {
    return { allowed: false, reason: "Could not read balances; funding denied (fail closed)." };
  }
  if (profitCents - amountCents < 0) {
    return {
      allowed: false,
      reason: `Funding $${(amountCents / 100).toFixed(2)} would dip into creator money (profit only $${(profitCents / 100).toFixed(2)}).`,
    };
  }
  return { allowed: true, reason: "Funded from profit." };
}
