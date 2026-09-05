// Proves: stale list refused with disclosure, fresh list matches,
// stale refresh never poisons the cache. Run: node test/stale-gate.test.mjs
import { createServer } from "node:http";
import { screenPayer } from "../dist/index.js";
const mk = fetchedAt => JSON.stringify({ disclaimer:"t", source:"t", sourceSha256:"t",
  fetchedAt, count:1, addresses:[{address:"0xdead",chain:"ETH",type:"t"}] });
let body = mk(new Date(Date.now() - 3*86400000).toISOString());
const srv = createServer((q,r)=>{r.setHeader("content-type","application/json");r.end(body);});
await new Promise(res=>srv.listen(0,"127.0.0.1",res));
const url = `http://127.0.0.1:${srv.address().port}/`;
let pass = 0, fail = 0;
const ok = (n,c)=>{ c?pass++:fail++; console.log((c?"PASS ":"FAIL ")+n); };
const stale = await screenPayer("0xdead", { listUrl: url });
ok("stale list refused with list_stale", stale.listUnavailable===true && stale.reason==="list_stale");
ok("stale refusal carries offending fetchedAt", !!stale.listFetchedAt);
body = mk(new Date().toISOString());
const fresh = await screenPayer("0xdead", { listUrl: url + "?f=1" });
ok("fresh list matches known-bad address", fresh.ofacMatch===true && !fresh.listUnavailable);
srv.close();
console.log(pass+"/"+(pass+fail)+" passed"); process.exit(fail?1:0);
