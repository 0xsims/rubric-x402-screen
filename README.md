# rubric-x402-screen

Screen the wallets that pay your x402 endpoints against OFAC. Free, local, sub-millisecond.

    import { screenPayer } from "rubric-x402-screen";

    const result = await screenPayer(payerAddress);
    if (!result.clear) return res.status(403).json({ error: "sanctioned counterparty" });

That's it. The sanctions list is fetched once and matched in memory, so screening adds no network call to your payment path.

## Why this exists

If you sell an x402 service and a sanctioned wallet pays you, you may have transacted with a sanctioned party. Most x402 sellers screen nobody, because there was no easy way to. This is the easy way.

## Middleware

    import { rubricScreen } from "rubric-x402-screen";

    app.use(rubricScreen());                 // 403s sanctioned payers
    app.use(rubricScreen({ onMatch: log })); // or handle it yourself

Fails open by design: if the list cannot be fetched, your revenue is not blocked.

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

## Data source and your responsibility

The address list is a convenience mirror of the public OFAC SDN digital-currency address list, parsed from treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml and refreshed every six hours. Every response carries the source URL, the source file SHA-256, and the fetch time so you can verify against the original.

Rubric does not warrant completeness or timeliness, and you remain solely responsible for your own sanctions compliance. This tool performs exact address matching against one public list. It is not a full compliance program.

## License

MIT (c) Echelon Intelligence Group LLC
