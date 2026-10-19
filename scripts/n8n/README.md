# n8n applicant-parse workflow (Miro Exercise 17)

Extracts name, age, contacts and attributes from an applicant's free text or a screenshot, for the
capture form (F3, screen O3) to prefill. A human still confirms every field (G-L4).

**Prototype on synthetic text only.** G-L2, G-B4 and Compliance 9.5 allow no real applicant text
to reach a model until processing is in the EU, a DPA is signed, training is off and the provider is a
listed sub-processor. Do not paste real applications into this workflow.

```
Webhook -> Validate input -> Valid? -> Has image? -> [Image to binary] -> Extract (image | text)
        -> Guard & normalize -> Respond 200          (errors: Respond 400 / Respond 502)
```

- **AI step**: Basic LLM Chain + Structured Output Parser + a chat-model sub-node (Anthropic Claude by
  default; `npx tsx scripts/n8n/build-workflow.ts openai` or `mistral` regenerates the JSON for
  another provider). One chain per input kind, because a chain cannot take an image message without a binary.
- **Guard & normalize** (`guard.js`, deterministic): `messageRaw` is the input text verbatim, never a
  model rewrite; names, contacts and attribute values must be backed by the source, otherwise they
  are dropped; limits mirror `APPLICATION_LIMITS`; only the five contract keys leave (G-L3).
  `collectedFrom` is never produced (FR-3.10).
- Files: `build-workflow.ts` generates `applicant-parse.workflow.json` and embeds `guard.js`;
  `tests/unit/n8n/guard.test.ts` covers the guard. After editing `guard.js` or the builder run
  `npx tsx scripts/n8n/build-workflow.ts` and commit the regenerated JSON.

## Contract

Request (`POST /webhook/applicant-parse`, header `X-Webhook-Secret`):

```json
{ "text": "pasted message (optional if image is given)",
  "image": { "mimeType": "image/png", "dataBase64": "..." } }
```

`image` is optional (png, jpeg or webp, up to ~5 MB). Text up to 20 000 characters.

Response 200 (missing information is `null` or `[]`):

```json
{ "applicantName": "Carla Neumann", "age": 26,
  "contacts": ["carla.neumann@example.test", "+49 30 23125 0103"],
  "messageRaw": "...", "attributes": [{ "label": "Beruf", "value": "Journalistin" }] }
```

Errors: 400 `{"error": "text_or_image_required" | "text_too_long" | "image_type_unsupported" | "image_data_missing" | "image_too_large"}`,
502 `{"error": "extraction_failed"}` (the form then falls back to manual entry).

## Import

1. n8n Cloud: Workflows -> Import from file -> `applicant-parse.workflow.json`.
2. Create credentials and attach them: **Header Auth** (name `X-Webhook-Secret`, any random value) on the
   Webhook node, and the provider's credential (**Anthropic** by default) on both `Chat model (...)`
   nodes. Create the workflow in the same n8n *project* that owns the credentials. To change
   provider, rebuild the JSON for it (above) or swap those two sub-nodes by hand.
3. Check Settings: execution data saving is off for success and error (applicant text must not
   stay in n8n's log). Manual test runs still show data in the editor.
4. Test with the **test URL** (click "Listen for test event"), then publish and use the production URL.

```bash
curl -X POST "$N8N_TEST_URL" -H "X-Webhook-Secret: $SECRET" -H "Content-Type: application/json" \
  -d @scripts/n8n/fixtures/carla.request.json
```

For a screenshot, take one of a **synthetic** text (WG-Gesucht style or WhatsApp) and send it:

```bash
IMG=$(base64 -w0 shot.png)
curl -X POST "$N8N_TEST_URL" -H "X-Webhook-Secret: $SECRET" -H "Content-Type: application/json" \
  -d "{\"image\":{\"mimeType\":\"image/png\",\"dataBase64\":\"$IMG\"}}"
```

## Fixtures

`fixtures/*.request.json` are synthetic inputs; `fixtures/expected.json` lists what the output must
contain (the model is not deterministic, so these are assertions, not golden output):
Carla (full), sparse WhatsApp (name and phone only), no information (all `null`/`[]`), and a prompt
injection (ignored, no `score` key).

## Import log (fill in while testing; the board asks for errors and fixes)

| Error | Fix |
|---|---|
| Creating the workflow failed: credential "not found or not accessible" | The credential belonged to the team project, the new workflow to the personal one. Create the workflow in the credential's project. |
| n8n auto-attached an unrelated workflow's Header Auth credential to the Webhook | Create your own Header Auth credential and select it on the Webhook node. |
| Workflow settings (do not save executions) cannot be set when creating from code | Set "Save successful/failed production executions" to off by hand; the repo JSON already carries it. |
| First image test: "Bad request - please check your parameters" | Test input was a truncated base64 string (my paste error), not a workflow bug. It did prove the chain's error output reaches `Respond 502`. |

Verified on n8n Cloud (2026-10-09) with Anthropic `claude-sonnet-5` and synthetic text only: text
path (Carla), screenshot path (rendered chat image), the guard dropping an invented contact and
attribute, and the error branch. Not yet tested: the OpenAI variant, the production webhook URL
with header auth, and 400 responses.

Observed: the model also extracts lifestyle attributes (smoking, alcohol) that the Carla seed does not
list. Whether to allow them is a product/compliance decision (see the prompt in `build-workflow.ts`).

## EU options still to verify

Mistral (EU vendor; check the vision model ID, DPA, no-training terms) or Claude on AWS Bedrock with an
EU inference profile (the repo already lists AWS eu-central-1; check in-region storage and the n8n
Bedrock node's image support), or a self-hosted open-weights model. Also confirm n8n Cloud's EU
hosting and sign its DPA. The contract and `guard.js` are provider-neutral, so a later move from n8n
to an API route reuses both unchanged.
