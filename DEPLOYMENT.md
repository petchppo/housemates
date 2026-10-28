# Public demo deployment

Housemates is prepared for Vercel's Next.js runtime, with GitHub checks and automatic deployments through the Vercel Git integration. Configuration in Git does not itself connect an account or create a live deployment. Record the verified production URL and deployed commit only after the owner completes that connection and tests the resulting site.

## Repository and runtime

- Repository: `petchppo/housemates`.
- Production branch: `codex/housemates-mvp`.
- Root directory: repository root (`./`).
- Framework: Next.js; do not use static export because the application includes server routes.
- Node.js: `24.x`, declared in `package.json` and the lockfile. GitHub checks use Node 24 too.
- Install: `npm ci --no-audit --no-fund`, using committed `package-lock.json`.
- Build: `npm run lint && npm run typecheck && npm test && npm run build`.

`vercel.json` supplies the install and build commands. Keep the default Next.js output configuration; do not set a custom output directory, add a catch-all rewrite, or upload an existing local `.next` directory. Vercel supports Node 24 and honors the package engine setting. See [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) and the installed Next deployment guide at `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`.

## Connect once, then deploy on pushes

1. In the existing authorized Vercel account, import the GitHub repository using Vercel's GitHub integration. Grant access only to the intended repository. Do not create an unrelated account, paid resource or destination.
2. Select Next.js, repository root, and Node 24. The committed configuration runs all four checks before a deployment can become ready.
3. In Project Settings → Environments → Production → Branch Tracking, set **`codex/housemates-mvp`**. Verify the branch explicitly rather than assuming `main`.
4. Initially deploy without private local environment files, AI credentials or messaging credentials. The browser planner, optimizer, characters, setup, local household memory and deterministic dialogue work without paid services.
5. Wait for the Vercel build and GitHub **Housemates checks / Lint, types, tests and build** job, then verify the deployed commit and public URL. The orchestrator owns this account/deployment step.
6. Subsequent pushes to the production branch trigger Vercel production builds. Other branches receive preview deployments according to the project's Git integration settings. Do not add a second CLI deployment workflow that publishes the same commit again.

Vercel's Git integration handles deployment authorization; this workflow needs no `VERCEL_TOKEN`, project ID, organization ID, deploy hook or invented GitHub secret. GitHub Actions checks are separate from Vercel's Git-triggered build: Vercel does not automatically wait for this workflow. Repeating the checks in `vercel.json` prevents an application build from publishing when those checks fail. If desired, configure a repository rule requiring the check before merging; no branch protection rule is claimed to be installed by these files. See [Vercel Git deployment and branch tracking](https://vercel.com/docs/git).

The workflow in `.github/workflows/checks.yml` runs on production-branch pushes, pull requests targeting that branch, and manual dispatch. It has read-only repository permissions, disables persisted checkout credentials, pins official actions by commit, installs the lockfile, and runs lint, types, tests and a production build. It contains no provider secrets and makes no paid model calls. See [GitHub's Node.js build guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) and [setup-node](https://github.com/actions/setup-node).

## Public environment policy

Never copy `.env.local` or `.housemates/` into a deployment. Both are ignored; `.vercel/` project-link metadata is ignored too. Production and preview environments are distinct: set any approved server-only variables in the intended environment and redeploy after changing them. Never prefix a provider credential with `NEXT_PUBLIC_`.

Origin checks retain an exact same-host boundary. If a custom domain reaches Next through HTTP after upstream TLS termination and is absent from Vercel’s server-provided deployment aliases, set optional `HOUSEMATES_TRUSTED_ORIGINS` to its exact HTTPS origin. This is a comma-separated list of at most 16 origins / 4096 characters, with no paths, trailing slash or wildcards. It only permits HTTP-to-HTTPS termination for the same authority; it does not authorize cross-domain requests, trust browser forwarding headers or authenticate visitors. Normally the server-owned `VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` values cover Vercel URLs automatically.

Public AI fails closed to local replies unless the shared atomic quota and provider are both configured. A local process counter does not cap usage across serverless instances. To enable the optional server-side provider, the owner supplies the following approved environment variables privately in Vercel:

| Variable | Purpose |
| --- | --- |
| `HOUSEMATES_DIALOGUE_PROVIDER=openai` | Explicit provider selection. |
| `OPENAI_API_KEY` | Server-only API credential; never commit or expose it in chat/client code. |
| `HOUSEMATES_DIALOGUE_OPENAI_MODEL` | Supported account model ID; see `DIALOGUE.md`. No model is selected automatically. |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST database origin under `*.upstash.io`, without path, query, credentials or custom port. |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only REST credential for the shared quota store. |
| `HOUSEMATES_AI_QUOTA_SECRET` | Stable random secret, 32–256 characters with no whitespace, used to derive quota identities. |
| `HOUSEMATES_AI_DAILY_LIMIT` | Optional integer 1–1000; defaults to 100 attempted requests per UTC day across both dialogue endpoints. |

Keep the same quota store and secret across production, previews and deployments for one shared allowance. Changing either starts a different counter namespace; separate environments with different namespaces multiply the allowance. On Vercel, Housemates additionally limits each validated platform-supplied client IP to six attempts per minute; the stored identity is an HMAC, not the raw IP. This is abuse limiting, not user authentication or a guarantee that legitimate visitors always have capacity.

The quota reserves an attempt atomically before inference using Redis time. Reservations are not refunded after failures or timeouts. Missing/invalid configuration, unavailable storage or an exceeded limit returns local dialogue instead of making an unbudgeted provider request. GET configuration checks do not contact Redis or verify its health. No quota database, paid account, key or live inference is created by the deployment workflow. This caps requests, **not USD spending**; provider spending controls remain separate. The store integration is fixture-tested until a separately authorized live check is recorded.

Vercel's `VERCEL=1` flag activates the public boundary. For an equivalent self-hosted preview use `HOUSEMATES_PUBLIC_DEMO=1`; arbitrary forwarded IP headers are not trusted there, so only the shared daily cap applies. Keep public deployment flags out of the private local bridge environment when testing local phone pairing.

The public iMessage panel is a beta preview. Do not configure the private Mac bridge URL, password, webhook secret or remembered-pairing registry on Vercel. The local bridge uses process memory and a local registry, which are not a durable shared serverless service. Public visitors must not pair with the owner's personal phone. Existing local messaging remains a separate authorized Mac workflow; see `IMESSAGE.md` for its requirements and limitations.

Actual weather uses the existing server adapter and a labeled synthetic fallback. Rates and carbon remain authored synthetic data. Optional photo recognition downloads its local browser model only after an explicit action; photos and household browser storage are not uploaded by the deployment configuration. A different origin has its own browser household memory, so a localhost profile does not automatically appear on the public URL.

## Reproducibility evidence and remaining acceptance

During the October 27–28, 2026 deployment preparation, public npm registry checks confirmed `next@16.4.3`, `react@19.3.0`, `react-dom@19.3.0` and `eslint-config-next@16.4.3` exist. An isolated clean install of the committed lockfile succeeded on macOS with Node `24.22.1` and npm `11.19.1`; the active development installation was untouched. npm reported an existing ESLint deprecation and install-script approval notices for four transitive packages. These were not silently bypassed and no dependencies were upgraded. A Linux CI/Vercel result is still required; local installation alone is not evidence of a successful deployment. The copied source snapshot passed lint, TypeScript, 553 tests (including a repeat with `VERCEL=1`) and a production build using the freshly installed packages. The restricted build stalled; only that isolated process was stopped, and the retry with local worker access passed. The healthy development server was not stopped. This snapshot preceded the final public-quota changes; the lead must run the combined final gates.

Before announcing the production URL, verify:

- Deployment is Ready for the intended commit and branch, with successful install, lint, typecheck, tests and build logs.
- `/`, `/demo`, `/demo/home`, `/judge-demo`, `/household` and `/energy-parliament` load on the public origin. Test keyboard navigation, desktop and phone layout.
- Setup/recruitment, Optimize, objective changes, impossible constraints and explicit simulation approval retain their boundaries. Refresh restores validated household state; Reset clears the relevant local state.
- AI is visibly local/unavailable when public quota or provider configuration is absent. No verification step sends paid model requests unless separately authorized.
- iMessage shows the public beta presentation and cannot pair or send. No personal bridge address or key appears in page source, browser requests or downloaded JavaScript.
- Forecast failures retain a labeled fallback; simulated activity, estimated cost and modeled carbon remain explicit.
- Record the actual URL, commit, check results and any unresolved limitation in `PROGRESS.md`. Do not claim deployment, Git auto-deploy or public AI success before observing it.

If account access, GitHub App authorization, project permissions or an install/build failure prevents deployment, keep the local app usable and record the exact blocker. Do not substitute a guessed domain or change dependencies just to mask the failure.
