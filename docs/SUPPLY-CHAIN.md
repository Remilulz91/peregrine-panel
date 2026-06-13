# Supply chain hardening

This document describes the controls Peregrine applies to its
dependency chain and what an attacker would have to bypass to
ship malicious code through it. It is targeted at operators and
auditors.

## At a glance

| Defence | Layer | Where |
|---|---|---|
| Pinned exact versions | source | `backend/package.json`, `frontend/package.json` |
| Integrity hashes (SRI / sha512) | lockfile | `backend/package-lock.json`, `frontend/package-lock.json` |
| `npm ci --ignore-scripts` | install | `Dockerfile` runtime stage |
| `.npmrc` strict | install | `.npmrc` (root + per-project) |
| Signature verification | install | `npm audit signatures` (CI build) |
| Vulnerability scan | CI | `npm audit --audit-level=moderate` (`.github/workflows/build.yml`) |
| Automated upgrades | scheduled | `.github/dependabot.yml` (weekly) |
| Secret scanning | CI | `.github/workflows/secret-scan.yml` (gitleaks) |
| Native code policy | source | no native postinstall steps allowed |
| SBOM generation | release | `npm sbom` (manual, see below) |
| Engine pinning | runtime | `engines` + `engine-strict=true` |

## Adding a new dependency

1. Open a PR — never push directly to `main`.
2. Run locally: `cd backend && npm install <pkg> --save-exact`
   (or `--save-dev-exact`). The `--save-exact` is enforced by
   `.npmrc` but be explicit anyway.
3. Verify:
   - `npm audit` — no new vulnerabilities at moderate or higher.
   - `npm audit signatures` — every package on the dep tree is
     signed by npm (Sigstore provenance).
   - Inspect the package on npmjs.com: maintainer reputation,
     publish frequency, age, weekly downloads.
   - For new direct deps with native code, request a review from
     a second maintainer.
4. CI (`build.yml` + `secret-scan.yml`) must pass.
5. Squash merge to keep history clean.

## Postinstall scripts

The runtime Docker image installs with `npm ci --ignore-scripts`.
This blocks the classic "postinstall malware" attack vector
(`event-stream`, `colors.js`, `ua-parser-js`, …). Native modules
that legitimately require post-install rebuild (currently: none in
our stack) must be allowlisted explicitly via `npm rebuild <pkg>`
in the Dockerfile.

## SBOM (Software Bill of Materials)

Generate a CycloneDX SBOM with:

```bash
cd backend && npm sbom --sbom-format=cyclonedx --output-file ../sbom-backend.json
cd ../frontend && npm sbom --sbom-format=cyclonedx --output-file ../sbom-frontend.json
```

Attach both to the GitHub Release for the version. This lets
downstream auditors verify exactly what code went into a release.

## Threat model — what is and is not protected

### Protected against
- A maintainer publishing a malicious patch version after lockfile
  is committed (lockfile hashes mismatch → install fails).
- Typosquat at install time (`expresss` vs `express`) — exact pin
  + lockfile combine to lock the chain.
- Postinstall payload in a transitively-installed package
  (`--ignore-scripts`).
- Cache-confusion CVE on `fast-jwt` (closed in v0.34.0; future
  similar issues caught by `npm audit` in CI).

### Not (fully) protected against
- A maintainer pushing a malicious version AND we accept the
  lockfile update in a Dependabot PR — relies on PR review
  catching it.
- Pre-publication compromise of the npm registry itself (out of
  our control; rely on Sigstore provenance via
  `npm audit signatures`).
- Compromise of the GitHub Actions runner — mitigated by minimal
  permissions in workflow files.
