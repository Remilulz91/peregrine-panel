# Contributing to Peregrine

Thank you for your interest in Peregrine. This project is *source-available*:
the code is public for transparency and to let anyone report bugs and security
issues. Contributions in the form of fixes are welcome.

## What the license allows

- **Allowed**: download and install Peregrine to use it.
- **Allowed**: modify the code for your own use, to test it, or to prepare a
  fix intended for the project.
- **Not allowed**: redistribute, publish or sell Peregrine, modified or not.
- **Not allowed**: remove or hide the "Peregrine" name and notices.

See the [`LICENSE`](LICENSE) file for the exact terms.

## Reporting a bug

1. Check that a similar ticket does not already exist in the *Issues*.
2. Open a new *Issue* describing:
   - what you were doing,
   - what you expected,
   - what actually happened,
   - your environment (operating system, Docker version, Peregrine version).

For a **security vulnerability**, do not use a public Issue: follow the process
described in [`SECURITY.md`](SECURITY.md).

## Proposing a fix

1. Describe the problem first in an *Issue*.
2. Submit your changes via a *Pull Request*, clearly explaining what it fixes.
3. By submitting a contribution, you agree that it may be incorporated into the
   project under the Peregrine license.

Pull Requests that aim to circumvent the license or remove attribution will not
be accepted.

## Development setup

Peregrine ships with a few opt-in safety nets for contributors. Activating them
takes one command after cloning the repo:

```bash
bash scripts/setup-dev.sh
```

That script does three things:

1. **Activates the local pre-commit hook** with
   `git config core.hooksPath .githooks`. From this point on, every
   `git commit` runs [`gitleaks`](https://github.com/gitleaks/gitleaks) on the
   staged diff and refuses the commit if a likely secret is detected. CI also
   runs the same scan server-side as a defence-in-depth — see
   [`docs/SUPPLY-CHAIN.md`](docs/SUPPLY-CHAIN.md) for the full chain.
2. **Installs the backend dependencies** with `npm ci --ignore-scripts` so a
   compromised transitive dep cannot execute arbitrary code through a
   `postinstall` payload during install.
3. **Installs the frontend dependencies** with the same flag.

To install `gitleaks` itself (so the local hook actually scans), follow the
[official install guide](https://github.com/gitleaks/gitleaks#installing).
The hook gracefully degrades to a warning if `gitleaks` is missing — your CI
will still catch a leaked secret before it reaches `main`.

If you prefer to run the steps manually instead of using the script:

```bash
git config core.hooksPath .githooks
cd backend && npm ci --ignore-scripts
cd ../frontend && npm ci --ignore-scripts
```

## Running locally

```bash
cd backend && npm run dev      # backend on http://localhost:3000
cd frontend && npm run dev     # frontend on http://localhost:5173
```

The Vite dev server proxies `/api` and the WebSocket to the backend, so the
browser only talks to Vite and there is no CORS surface.
