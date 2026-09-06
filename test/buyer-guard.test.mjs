import { rubricBuyerGuard } from "../dist/index.js";
import assert from "node:assert";

const SDN = "0x098b716b8aaf21512996dc57eb0615e2383e2f96";
const CLEAN = "0xab6731a0bcdf511c2842c768a03448075ab654ca";
const ctx = (payTo) => ({ paymentRequired: {}, selectedRequirements: { payTo, amount: "10000", network: "eip155:8453" } });

let logged = [];
const guard = rubricBuyerGuard({ onScreened: (r, p) => logged.push([p, r.ofacMatch]) });

const r1 = await guard({}, ctx(SDN));
assert.equal(r1?.abort, true, "SDN payTo must abort");
assert.ok(r1.reason.includes("OFAC"), "reason names the list");

const r2 = await guard({}, ctx(CLEAN));
assert.equal(r2, undefined, "clean payTo returns void");

const r3 = await guard({}, ctx("BMRMkQ8PY1zp89j3R7Bv7c218Euiij4fTLiyJ1BHyBu2"));
assert.equal(r3, undefined, "non-EVM payTo passes through unscreened");

const r4 = await guard({}, { selectedRequirements: {} });
assert.equal(r4, undefined, "missing payTo passes through");

assert.equal(logged.length, 2, "onScreened fires only for screened (EVM) payments");

console.log("buyer-guard: 5/5 pass");
