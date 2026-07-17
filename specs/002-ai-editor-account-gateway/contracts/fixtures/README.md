# AI Editor Edge/Code contract fixtures

`edge-code-contract.json` is the machine-readable companion to
`edge-gateway-api.md` and `code-edge-webview.md`.

It freezes:

- the five safe account states and actions;
- local nonce authorization behavior;
- one-time handoff start, completion and replay behavior;
- Webview-ticket and logout responses;
- model-catalog success and logged-out responses;
- fields that must not appear in safe status or sanitized reports.

The values containing `fixture-` or `example.test` are test-only and are not
product credentials or production account data.

Oscar's simulator, live Black-stack verifier and model-catalog tests consume
this fixture. Black should consume the same file in server contract tests after
pulling the current `My_Code` contract commit. Interface changes require both
the Markdown contract and this fixture to change in the same reviewed commit.
