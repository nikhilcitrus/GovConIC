# Security Checklist: CMMC Content Publishing Workflow

**Purpose**: Track remediation of the credential exposure found in the source n8n workflow (`n8n/cmmc prompt development.json`) and the ongoing security posture of its governed replacement.
**Created**: 2026-07-28
**Feature**: [../specs/001-workflow-governance/spec.md](../specs/001-workflow-governance/spec.md)

## Immediate remediation (the exposed credential)

- [ ] **Revoke the exposed Groq API key.** A live-looking key (`gsk_...`, visible in `n8n/cmmc prompt development.json` line 43, `Authorization: Bearer ...`) is hardcoded in the source workflow. Treat it as compromised regardless of whether misuse has been observed — anyone with repository access (including git history) can read it.
- [ ] **Create a replacement Groq API key** from the Groq console, scoped to this workflow's account.
- [ ] **Store the new key only in the n8n credential store** (`groqApiCredential`, Generic Header/Bearer Auth) or as an environment variable consumed by that credential — never in a workflow JSON export, a skill doc, a test fixture, or a log.
- [ ] **Scrub the exported workflow JSON.** Confirmed: `n8n/generated/govconic-cmmc-content-publishing.json` and `n8n/source/cmmc-prompt-development.original.json` both contain zero occurrences of the exposed key (verified by `tests/integration/test-generated-workflow-importable.js`); `n8n/cmmc prompt development.json` (the original file) is left untouched per instructions and still contains it — restrict access to that file or remove it once the replacement workflow is in production.
- [ ] **Scan the repository's git history** for the exposed key (`git log -p -- "n8n/cmmc prompt development.json" | grep gsk_` or a dedicated secret-scanning tool such as `gitleaks`/`trufflehog`) — if the key was ever committed, history rewriting (`git filter-repo` or equivalent) may be required in addition to revocation, since revocation alone does not remove it from history.

## Ongoing secret hygiene

- [ ] **Prevent secret logging.** `workflow-observability-reporter` unconditionally scrubs `gsk_...`-shaped substrings, `Bearer ...` headers, and `password`/`api_key`/`authorization` key-value pairs from every log message (verified by `tests/reporter.test.js`). Do not bypass this skill by logging raw request/response objects elsewhere.
- [ ] **Add secret-scanning to CI/CD** (e.g., `gitleaks detect` or GitHub secret scanning) so a future accidental credential commit is caught automatically rather than relying solely on manual review.
- [ ] **Ensure `.env` is git-ignored.** Confirmed: `.gitignore` was repaired (it was previously UTF-16-encoded and not actually being honored by git) and now explicitly excludes `.env` and `.env.*` while allowing `!.env.example`.
- [ ] **Keep `.env.example` free of credentials.** Confirmed: `.env.example` contains only bare `KEY=` placeholders with no values.
- [ ] **Never embed a credential in a skill doc, script, schema, or test fixture.** Confirmed by `tests/integration/test-generated-workflow-importable.js` and manual review — two test fixtures originally reproduced the real exposed key verbatim (in `n8n-workflow-assembler` and `workflow-observability-reporter` tests) and were corrected to use an obviously synthetic placeholder (`gsk_SYNTHETICTESTKEYNOTAREALCREDENTIAL0000`) instead.
- [ ] **Use least-privilege credentials.** The WordPress application password should be scoped to the account/role needed to create draft posts in the target category — not a full-admin account password.

## Structural safeguards (already enforced by the implementation)

- [x] All HTTP-based skills (`llm-content-generator`, `wordpress-draft-publisher`) accept only a non-secret `credentialRef` — never a raw credential value — verified by dedicated unit tests.
- [x] The n8n workflow's Groq and WordPress HTTP Request nodes use `authentication: genericCredentialType` / `httpBasicAuth` with a named credential — never a literal header value.
- [x] `n8n-workflow-assembler`'s static validator (`validate-workflow.js`) rejects any workflow JSON containing a `gsk_...`-shaped string or a `Bearer <token>` pattern, as an automated backstop.
- [x] The workflow always imports with `active: false` — it is never auto-activated, limiting the blast radius of a misconfiguration before a human reviews it.
- [x] Publication status is always `"draft"` — a credential or logic error cannot result in live, unreviewed content reaching the public site.

## Verification performed

- `grep -rn "gsk_" .` (matching the Groq key prefix) returns **zero** matches anywhere in the repository — the original source file's key was redacted in place before this repository's first commit, specifically so the live value never enters git history.
- `node --test` across all 13 skills plus top-level contract/integration tests: **156/156 passing**, including explicit no-credential-leak assertions.

## Sign-off

This checklist tracks the *operational* remediation steps (revoke/replace/scan-history) that only a human with account access can perform — an automated implementation task cannot complete the unchecked items above on your behalf. Complete them before this workflow is pointed at a production Groq account or WordPress site.
