## Behavioral verification

<!-- verify-kit: paste `node .agents/verify-kit/verify.mjs check-ci --base <base> --head <head>` output, or keep this manual shape -->

Commit: `<sha>`
Profile: `<changed | critical>`

| feature | status | verifier | receipt |
|---|---|---|---|
| `<id>` | passed | fresh | `verification/receipts/<file>.md` |

Surfaces exercised: <web / API / DB read-back / CLI>
Forbidden observations confirmed absent: <n>
Preserved behavior: <what was re-verified unchanged>
Blocked / unreachable: <none, or id + reason>
Evidence: `verification/runs/<run id>/` (trace, screenshots, http/, readback/) — content-addressed in the receipt

A green check makes this PR *eligible* for a merge decision. It is not permission to merge.
