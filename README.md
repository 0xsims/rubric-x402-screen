# rubric-x402-screen

Screen the wallets that pay your x402 endpoints against OFAC. Free, local, sub-millisecond.

    import { screenPayer } from "rubric-x402-screen";

    const result = await screenPayer(payerAddress);
    if (!result.clear) return res.status(403).json({ error: "sanctioned counterparty" });

That's it. The sanctions list is fetched once and matched in memory: no network call in your payment path after warm-up. A cold start, and the first call after each 30-minute refresh window, awaits one mirror fetch inline. The client verifies the list's age (24h max, configurable) but does not diff the mirror against Treasury; the sourceSha256 in every response is there so you can. One reviewer did, and it matched.

## Why this exists

If you sell an x402 service and a sanctioned wallet pays you, you may have transacted with a sanctioned party. Most x402 sellers screen nobody, because there was no easy way to. This is the easy way.

## Middleware

    import { rubricScreen } from "rubric-x402-screen";

    app.use(rubricScreen());                 // 403s sanctioned payers
    app.use(rubricScreen({ onMatch: log })); // or handle it yourself

If a list refresh fails, screening continues against the last successfully fetched list. If no list has ever loaded, it fails open with an explicit `listUnavailable: true` flag so the degraded state is disclosed in the result. Either way, your revenue is not blocked.

## Optional: anchor the screening as evidence

Screening protects you. Proving you screened is a different thing, and it is what an examiner asks for.

    import { screenPayer, attestScreening } from "rubric-x402-screen";

    const result = await screenPayer(addr);
    const proof = await attestScreening(result, { apiKey: process.env.RUBRIC_API_KEY });
    // proof.verifyUrl -> a Hedera-anchored record that you screened this address,
    //                    at this time, against this list version, verifiable by anyone.

Or skip the account entirely and pay per attestation over x402 (half a cent, no signup):

    const result = await screenPayer(addr);
    const challenge = await attestScreening(result);           // returns the x402 payment challenge
    const proof = await attestScreening(result, { payment });  // your signed payment -> anchored proof

Free API key at https://rubric-protocol.com — 1,000 anchored screenings a month.

## Name and entity screening (paid)

Address matching catches wallets on OFAC's published list. It does not catch a sanctioned person using an unlisted wallet. For that you screen the name.

    import { screenName } from "rubric-x402-screen";

    const challenge = await screenName("Acme Trading Ltd");        // x402 payment challenge
    const result = await screenName("Acme Trading Ltd", { payment }); // signed payment -> result
    // or with an account: screenName("Acme Trading Ltd", { apiKey })

Screens six lists: OFAC SDN and Consolidated including alternate spellings, UN Security Council, UK OFSI, EU, and BIS Denied Persons. One cent over x402, no account required.

Every response discloses the matching rule in full (screen-match-v2.2: Damerau-Levenshtein token matching with a documented edit budget, one-to-one token assignment, at most one query-side initial expansion), the exact source files and their SHA-256 hashes, the list version screened, and the match type and edit distance for every hit.

### This returns candidates, not determinations

A fuzzy name match is a candidate requiring human adjudication. It is not a finding that a party is listed. Absence of a match is evidence that this rule was applied to this query against these list versions at this time; it is not legal clearance, and a spelling more than one edit from every listed form will not match.

## What this is and is not

Free and local: address screening. Exact matching, no network call after warm-up, no key.

Paid API: name screening, and anchoring any screening as evidence.

Neither is a compliance program. This library performs screening checks. A sanctions compliance program also requires risk assessment, adjudication and escalation procedures, blocking and reporting obligations, testing, training, and management oversight. If you have real sanctions exposure, you need more than a library. Most x402 sellers currently check nothing at all, and going from nothing to this is the cheapest risk reduction available.

## Data source and your responsibility

The address list is a convenience mirror of the public OFAC SDN digital-currency address list, parsed from treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml and refreshed every six hours. Every response carries the source URL, the source file SHA-256, and the fetch time so you can verify against the original.

Rubric does not warrant completeness or timeliness, and you remain solely responsible for your own sanctions compliance. This tool performs exact address matching against one public list. It is not a full compliance program.

## Screen who your agent pays (buyer side)

The middleware above screens who pays you. `rubricBuyerGuard` screens who your agent is about to pay, wired into the official x402 client's `onBeforePaymentCreation` hook. One line, runs before any signature is created:

```typescript
import { rubricBuyerGuard } from "rubric-x402-screen";

client.onBeforePaymentCreation(rubricBuyerGuard());
```

Sanctioned recipient: the payment aborts with a reason before signing. Clean recipient: nothing happens and your flow continues. Non-EVM recipients pass through unscreened.

Compose it with your own spend policy:

```typescript
const screen = rubricBuyerGuard({
  onScreened: (result, payTo) => log.info({ payTo, result }),
});
client.onBeforePaymentCreation(async (decl, ctx) => {
  const s = await screen(decl, ctx);
  if (s) return s;
  // your network / asset / spend-cap checks
});
```

Fail-open by default, same as the seller middleware: a list outage never blocks your agent, and the screening result discloses `listUnavailable` so the miss is on the record. Set `abortOnUnavailable: true` if unscreened spend is worse for you than a blocked request.

## License

MIT (c) Echelon Intelligence Group LLC
