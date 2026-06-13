# Security policy

If you discover a security vulnerability in Peregrine, please **do
not open a public GitHub issue**. Instead, report it privately so
we can fix it before it becomes public knowledge.

## How to report

### Preferred — GitHub Private Vulnerability Reporting
1. Open https://github.com/Remilulz91/peregrine-panel/security/advisories/new
2. Describe the issue, the affected versions, reproduction steps,
   and the impact you assess.
3. We acknowledge within 72 h and aim to ship a patch within 30 d
   for high/critical severities.

### Fallback — Email
If for any reason you cannot use the GitHub form, email
**remi.rousselot91 [at] gmail [dot] com** with subject
`[Peregrine security] <short summary>`.

## What we consider in scope
- Authentication / authorization bypass
- Remote code execution
- SQL injection, command injection, path traversal
- Cross-site scripting (stored or reflected)
- Cross-site request forgery
- Server-side request forgery
- Cryptographic flaws (weak ciphers, broken key derivation, etc.)
- Container escape via the Docker socket integration
- Supply chain attacks against the project's npm dependencies

## What we consider out of scope
- Findings produced by automated scanners with no demonstrated impact
- DoS via excessive resource consumption from a logged-in user
  (we already rate-limit at multiple layers and document host-level
  mitigations in `docs/HARDENING.md`)
- Phishing / social engineering of operators
- Issues in third-party dependencies that we have no fix for yet
  (these are tracked separately via Dependabot)

## Coordinated disclosure
We follow a 90-day disclosure window from the date of the report.
After a fix ships, we publish a Security Advisory describing the
issue, the fix, the affected versions, and the reporter (with their
permission). The CVE is requested via GitHub's CNA.

## Hall of fame
Reporters of valid issues are credited here unless they prefer to
remain anonymous.

_(No reports yet.)_
