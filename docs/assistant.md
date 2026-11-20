# Grounded research conversations

A reviewer can ask why the current area is withheld, compare publication rules, or follow a question about a displayed population with one about the 32 independent runs. Changing the dataset, geographic level, statistic, policy or selected area changes the evidence for the next reply. Previous messages keep a description of the view in which they were asked.

## What the model sees

The browser sends the question, a bounded recent conversation and identifiers for the selected view. The Worker validates the identifiers and builds six short evidence cards from the research artifact. These cover the selected area, error and coverage, policy comparison, geography, empirical validation and the integration boundary. OpenAI generates an answer in the question's language with structured citation identifiers. The Worker checks the identifiers and numeric forms against the cited evidence, resolves source URLs itself, and rejects unsupported outputs. This check can catch an invented figure. A number can still be attached to the wrong concept, and prose can misinterpret a result. Review the cited evidence before using an answer in a decision.

The workbench is a **public synthetic analyst environment**. Its diagnostic evidence includes counts and dominance, which help explain a withholding decision. The [separate release-only adapter](integration.md) exposes a narrower set of fields and profiles. A confidential service would require its own data-owner decisions and a server-side release boundary.

## Deployment

GitHub Pages serves the workbench. A Cloudflare Worker calls the OpenAI Responses API. Its default configuration permits 24 provider requests per UTC day globally and four per minute per client, with an output ceiling of 550 tokens per call. A Durable Object reserves capacity before each provider call. Set a provider project budget appropriate for the demonstration. Clear the local conversation using the chat control. The model request uses `store: false`; service-level data policies still apply. [Worker, configuration and limits](../worker/README.md) · [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) · [Cloudflare Worker secret bindings](https://developers.cloudflare.com/workers/configuration/secrets/)

Two activation paths are supported. Both keep the API credential outside the public site.

- **Account-authorised deployment.** Sign in to Wrangler, deploy the checked-in Worker and add its `OPENAI_API_KEY` as a Cloudflare Secret. Set the GitHub Actions *variable* `AI_WORKER_URL` to the Worker's public HTTPS base URL. Re-run **Verify and publish Magnitude Lab**. The workflow checks the readiness endpoint before inserting the public address into the Pages artifact.
- **Repository-controlled deployment.** A maintainer can instead configure the repository's GitHub Actions *secrets* `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and `OPENAI_API_KEY`. On trusted main-branch builds the workflow deploys the pinned Worker, sends the model key through standard input to Wrangler's secret manager, checks readiness and builds the Pages artifact. Scope the Cloudflare deployment token to the relevant account. Pull requests run tests without these credentials. [Cloudflare GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

The source checkout ships an empty endpoint for independent reproduction. The build injects the public address into `assistant-config.json` for the hosted version. A successful readiness check confirms configured bindings. A real two-turn browser conversation is a separate end-to-end check.

## Verification

```sh
npm ci
npm run test:ai
npx playwright install --with-deps chromium webkit
npm run test:assistant-browser
npx --no-install wrangler deploy --dry-run --config worker/wrangler.toml
```

The tests cover the entire evidence matrix, missing denominators, changed selections, output validation, provider refusals, quota persistence and concurrent requests. Browser tests cover citation links, two turns, session clearing and the clearly labelled local evidence view. Routine automation substitutes the model transport, so pull requests can exercise these behaviours without incurring model charges. [Evidence tests](../tests/evidence.mjs) · [Worker tests](../tests/worker.test.mjs) · [browser tests](../tests/assistant-browser.cjs)
