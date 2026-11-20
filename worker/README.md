# Live research assistant

The published Pages site queries a Cloudflare Worker over HTTPS. The Worker reads its own copy of the versioned synthetic benchmark and builds the same six evidence cards as the workbench. It sends the current question, up to six prior messages and those short descriptions to the OpenAI Responses API. Some cards contain public synthetic group diagnostics, including contributor counts and concentration. This research assistant has a different audience and data contract from the release-only export for downstream clients. [Evidence builder](../web/assets/evidence.js) · [release interface](../docs/integration.md)

## Deployment

Use the repository's pinned Wrangler dependency and a Cloudflare account with Workers and SQLite-backed Durable Objects. From the repository root, deploy the Worker and configure its runtime secret through the masked input prompt or Cloudflare's dashboard.

```sh
npx wrangler deploy --config worker/wrangler.toml
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml
```

The default model is `gpt-4.1-mini-2025-04-14`. Connect the resulting Worker URL to the web client. A dedicated OpenAI project can have its own model permissions and enforced monthly spend limit. Keep the key in the server-side secret binding. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [model and API support](https://developers.openai.com/api/docs/models/gpt-4.1-mini) · [OpenAI project controls](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)

| Setting | Default | Scope |
| --- | --- | --- |
| `DAILY_REQUEST_LIMIT` | 24 | All clients of this deployment, per UTC calendar day. Accepts 0–300. Zero disables model calls. |
| `BURST_REQUEST_LIMIT` | 4 | Calls per client in any 60-second window. Accepts 1–20. Clients behind the same public IP share the allowance. |
| `OPENAI_MODEL` | `gpt-4.1-mini-2025-04-14` | Server-selected Responses-compatible model supporting strict structured output. |
| `ALLOWED_ORIGIN` | `https://rongsenzhang.github.io` | Browser origin for questions. The shared quota also applies to callers able to construct their own HTTP headers. |

The Worker reserves one call before contacting OpenAI. A single named Durable Object performs the daily and per-client checks and counter update together inside a SQLite transaction. Failed or interrupted provider calls consume the reservation. There are no automatic model retries. Only a keyed digest of the client address is stored in the quota ledger. Expired records are pruned on subsequent requests. Existing reservations continue to count after restart. Output is capped at 550 tokens. Input is bounded by the evidence pack, request size, question length and conversation length. Actual provider charges depend on input, output and model pricing. [Cloudflare's strict limit guidance](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#strict-limits) · [SQLite-backed Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Request and response

`GET /health` returns `{"ready":true}` when the API key and quota binding are present and configuration allows calls. Health does not contact OpenAI. To verify a credential and model, submit a real question, check its answer and sources, then ask a follow-up in the same conversation.

`POST /chat` accepts `application/json` from the configured origin. The current question is limited to 700 JavaScript string units. Each history entry is capped at 2,000 and the combined history at 7,800. The maximum HTTP body is 40,000 bytes.

```json
{
  "question": "Why is this area withheld?",
  "history": [],
  "context": {"dataset":"turnover","level":"region","metric":"sum","method":"combined","cell":"R04"}
}
```

Successful replies contain `answer` and `citations`. The server chooses links and labels from the evidence cited by the model. It checks numeric literals, units, schema and evidence IDs. These checks catch many unsupported figures. Factual interpretation and translations still require judgement. The server returns an error if the model declines, fails, gives an incomplete answer or supplies an unknown reference. The request uses `store:false` and sends no release keys, underlying contributor records or entire experiment files. [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

## Verification

```sh
node --test tests/worker.test.mjs
npx wrangler deploy --config worker/wrangler.toml --dry-run
```

The automated tests run on Node 24 with its built-in SQLite. They verify the SQL budget logic across concurrent requests, restart and UTC midnight. Provider simulations exercise a two-turn Chinese/English conversation, grounded citations, refusals, input validation, CORS and upstream failures. Actual provider availability requires a live credential check.
