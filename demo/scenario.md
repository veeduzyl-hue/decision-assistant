# Decision Assistant v0.3 — Receipt Semantics Demo (Evidence-Level)

This demo proves the receipt semantics by producing a real decision trace:

1) Trigger `REQUIRE_CONFIRM` → obtain `{ receipt_id, plan_hash }`
2) Replay `EXECUTE` with that exact pair → `ALLOW` + `executed:true`
3) Replay the same receipt against a changed plan → rejected + new receipt

## Why you may see BLOCK

Some policies contain hard thresholds that immediately return `BLOCK`
(e.g., `files_touched >= threshold`). Receipts exist only under `REQUIRE_CONFIRM`.

Demo 1 auto-searches for a nearby `files_touched` value that yields `REQUIRE_CONFIRM`
and writes `demo/.demo_last.json` so demos 2/3 reuse the *exact same signals*.

## Run

```bash
npx tsx demo/demo_require_confirm.ts
npx tsx demo/demo_execute.ts --receipt_id <RID> --plan_hash <PLAN_HASH>
npx tsx demo/demo_reject.ts  --receipt_id <RID> --plan_hash <PLAN_HASH>
```

Tip: if you forget to pass flags to demos 2/3, they will read `demo/.demo_last.json`.
