/**
 * rubric-x402-screen — screen the wallets that pay you against OFAC.
 *
 * Free and local: the sanctions list is fetched once and matched in memory, so
 * screening adds no network call to your payment path. Optionally anchor each
 * screening as permanent evidence you performed the check.
 *
 * The list is a convenience mirror of the public OFAC SDN digital-currency
 * address list. You remain responsible for your own sanctions compliance.
 */

const LIST_URL = "https://rubric-protocol.com/data/ofac-addresses.json";
const ATTEST_URL = "https://rubric-protocol.com/v1/tiered-attest";
const ATTEST_X402_URL = "https://rubric-protocol.com/v1/x402/tiered-attest";
const LIST_TTL_MS = 30 * 60 * 1000;

export interface ScreenResult {
  address: string;
  clear: boolean;
  ofacMatch: boolean;
  chain?: string;
  listSha256: string;
  listFetchedAt: string;
  screenedAt: string;
  disclaimer: string;
}

interface ListPayload {
  disclaimer: string; source: string; sourceSha256: string; fetchedAt: string;
  count: number; addresses: Array<{ address: string; chain: string; type: string }>;
}

let cache: { at: number; set: Map<string, string>; meta: ListPayload } | null = null;

async function loadList(url = LIST_URL): Promise<NonNullable<typeof cache>> {
  if (cache && Date.now() - cache.at < LIST_TTL_MS) return cache;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`sanctions list fetch failed: ${r.status}`);
  const meta = (await r.json()) as ListPayload;
  const set = new Map<string, string>();
  for (const a of meta.addresses || []) set.set(String(a.address).toLowerCase(), a.chain);
  cache = { at: Date.now(), set, meta };
  return cache;
}

/** Screen one address. Local, sub-millisecond after the first list load. */
export async function screenPayer(address: string, opts: { listUrl?: string } = {}): Promise<ScreenResult> {
  const { set, meta } = await loadList(opts.listUrl);
  const key = String(address).toLowerCase();
  const hit = set.get(key);
  return {
    address, clear: !hit, ofacMatch: !!hit, chain: hit,
    listSha256: meta.sourceSha256, listFetchedAt: meta.fetchedAt,
    screenedAt: new Date().toISOString(), disclaimer: meta.disclaimer,
  };
}

/** Anchor a screening as permanent, independently verifiable evidence. Needs a Rubric key. */
export async function attestScreening(
  result: ScreenResult,
  opts: { apiKey?: string; agentId?: string; payment?: string } = {}
) {
  // No API key? Use the x402 path: pay per attestation, no account, no signup.
  // Without a payment proof this returns the challenge for your wallet to sign.
  if (!opts.apiKey) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.payment) { headers["PAYMENT-SIGNATURE"] = opts.payment; headers["X-PAYMENT"] = opts.payment; }
    const r = await fetch(ATTEST_X402_URL, {
      method: "POST", headers,
      body: JSON.stringify({ agentId: opts.agentId || "x402-payer-screen",
        sourceId: "screen-" + result.address.slice(2, 14).toLowerCase() + "-" + Date.now(),
        decision: "inbound-payer-screening", data: result }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 200 && j.attestationId) {
      return { attestationId: j.attestationId, verifyUrl: `https://rubric-protocol.com/v1/verify/${j.attestationId}`,
               significance: "Anchored proof that this screening was performed at this time, verifiable by anyone without trusting you." };
    }
    return { attestationId: null, verifyUrl: null, paymentRequired: true, challenge: j,
             how: "Sign this x402 payment with your wallet and call attestScreening again with { payment }. No account required." };
  }
  return attestWithKey(result, opts as { apiKey: string; agentId?: string });
}

async function attestWithKey(result: ScreenResult, opts: { apiKey: string; agentId?: string }) {
  const r = await fetch(ATTEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey },
    body: JSON.stringify({
      agentId: opts.agentId || "x402-payer-screen",
      sourceId: "screen-" + result.address.slice(2, 14).toLowerCase() + "-" + Date.now(),
      decision: "inbound-payer-screening",
      data: result,
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  return {
    attestationId: j.attestationId ?? null,
    verifyUrl: j.attestationId ? `https://rubric-protocol.com/v1/verify/${j.attestationId}` : null,
    significance: "Anchored proof that this screening was performed at this time, verifiable by anyone without trusting you.",
  };
}

/** Express/Hono-style middleware. Screens the payer from the x402 payment header. */
export function rubricScreen(opts: {
  apiKey?: string;
  attest?: boolean;
  onMatch?: (result: ScreenResult, req: any, res: any) => void;
  extractAddress?: (req: any) => string | null;
} = {}) {
  return async function (req: any, res: any, next: any) {
    try {
      const addr = opts.extractAddress ? opts.extractAddress(req) : defaultExtract(req);
      if (!addr) return next();
      const result = await screenPayer(addr);
      (req as any).rubricScreening = result;
      if (opts.attest && opts.apiKey) {
        attestScreening(result, { apiKey: opts.apiKey }).then(a => { (req as any).rubricScreening.attestation = a; }).catch(() => {});
      }
      if (result.ofacMatch) {
        if (opts.onMatch) return opts.onMatch(result, req, res);
        return res.status(403).json({ error: "sanctioned_counterparty", screening: result });
      }
      return next();
    } catch {
      return next(); // fail open: a screening outage must never block your revenue
    }
  };
}

function defaultExtract(req: any): string | null {
  const h = req.headers?.["payment-signature"] || req.headers?.["x-payment"];
  if (!h) return null;
  try {
    const p = JSON.parse(Buffer.from(String(h), "base64").toString());
    return p?.payload?.authorization?.from || p?.payload?.from || null;
  } catch { return null; }
}
