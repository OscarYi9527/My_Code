# P2 Gate Evidence

**Status**: PASSED; P3 entry approved.

## Delivered Contracts

- `PaManifestSchema`
- `PaActivityContractSchema`
- `PaCheckContractSchema`
- `PaDataObjectContractSchema`
- `PaRunSchema`
- `PaCheckpointSchema`
- `PaArtifactSchema`

## Delivered Semantic Validation

- schema and package-path validation;
- unique activity, check, data-object, and output validation;
- entry and dependency existence;
- DAG cycle detection;
- declared input and output existence;
- producer/consumer consistency;
- direct producer dependency declaration;
- CA target and failure-route existence;
- critical data-object CA coverage;
- host version range consistency.

## Layer Decision

Zod is not imported from Workbench `common` or `browser` layers because the
repository forbids external runtime modules there. Zod schemas and semantic
validation live in:

```text
src/vs/workbench/services/paRegistry/node/
```

Plaza-facing browser contracts remain dependency-free. A later P3
electron-main/node storage service owns package parsing and validation before
publishing metadata to the browser registry projection.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct ESLint on P2 files | PASS |
| `scripts\test.bat --grep "PA manifest contracts"` | PASS, 5 tests |
| `npm run valid-layers-check` | PASS |
| `npm run transpile-client` | PASS |

## Fixtures Covered

- valid closed and acyclic manifest;
- parent-directory package traversal;
- duplicate output;
- producer mismatch;
- undeclared producer dependency;
- cyclic dependency;
- missing CA coverage;
- valid run/checkpoint/artifact persistence records;
- invalid artifact content hash.
