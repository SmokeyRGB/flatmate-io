# Operational Risk & Cost Awareness Check (Flatmate.io)

Date: 2026-08-19  
Scope basis: 01-Problem-Framing, 02-SRD, 03-PRD, 04-Domaenenmodell, 05-ADRs, 06-Compliance-Anhang

## 1) Scope Reality Check (Important)

Flatmate.io v1 is intentionally not an AI-heavy product:
- No AI-based ranking or decisioning (P-5).
- No mandatory external model API in v1.
- Rule-based parsing and local/business logic first.

Operationally, this is good for resilience and cost control. The main unstable/costly APIs are therefore likely:
- Auth / email provider APIs
- Hosting and database services
- Optional future model API in v2 (text extraction only)

This plan still includes model-API risk, because the roadmap (v2) introduces it and because your assignment explicitly asks for it.

---

## 2) Risk Register: API Limits, Availability, Latency, Pay-as-you-go

| Risk Area | Trigger | 10x Usage Impact | Business Impact | Mitigation Priority |
|---|---|---|---|---|
| API rate limits (email/auth/model) | Burst traffic, retries, digest fan-out | 429 errors, delayed actions | Missed notifications, broken trust, drop in participation | High |
| Model availability (future v2) | Vendor outage or region issue | Parsing features unavailable | Slower moderation workflow, manual fallback needed | Medium |
| CP-SAT compute saturation (solver load) | Many concurrent scheduling requests, larger slot search space | Solver queue growth, timeouts, high CPU contention | Scheduling becomes slow/unreliable; moderators abandon suggestion feature | High |
| Latency spikes | Peak hours, cold starts, overloaded DB/solver | Slow voting/ranking/slot suggestion UX | Lower completion rate, users switch back to WhatsApp | High |
| Pay-as-you-go cost explosion | Token-heavy calls, unbounded retries, no budget guardrails | Daily spend can exceed monthly plan quickly | Unsustainable non-profit operation | High |

---

## 3) Scenario Answers (Required Questions)

### What happens if usage suddenly 10x increases?

Expected failure pattern:
1. Notification and email queues back up first.
2. API 429/5xx increases for external dependencies.
3. Solver jobs contend for CPU; queue wait time and timeout rate rise.
4. DB latency and overall response times rise.
5. Participation drops because response time worsens.

Required controls:
- Queue-based buffering for all non-critical external calls (especially digest/email).
- Per-household and global rate limits at API gateway.
- Circuit breaker + exponential backoff with jitter for third-party APIs.
- Dedicated solver queue with max concurrency and bounded queue length.
- Fast failover policy for solver: return feasibility-only/manual scheduling mode when queue or timeout threshold is breached.
- Hard timeout budgets per request path.
- Graceful degradation: if optional features fail, voting and core state transitions stay available.

### What happens if the API is down?

Split by dependency:
- If model API down (future v2): switch parser to rule-based/manual mode immediately; show "manual mode active" banner.
- If email API down: keep in-app notifications and queue email for retry.
- If auth provider down: prefer self-hosted/session fallback strategy from ADR direction where possible.

Non-negotiable rule:
- Core WG flow (vote, state updates, round progress) must not depend on model availability.

### What is cost per user/action?

Use this baseline formula set:
- Cost per action = (infra + external API + message delivery + observability + storage growth) / number of successful actions
- Cost per active user per round = total round cost / active residents in round
- Cost per completed round = total monthly variable cost / completed rounds

For model calls (if enabled in v2):
- Cost per parse = (input tokens x input price) + (output tokens x output price) + retry overhead

You should track at least:
- Cost per vote submitted
- Cost per application processed
- Cost per appointment suggestion run
- Cost per completed casting round

### When does this become unsustainable?

Define explicit stoplight thresholds (example, adapt to real budget):
- Green: variable cost <= 20% of monthly funding
- Yellow: 20-35%
- Red: >35% for 2 consecutive months OR cost per completed round grows while participation does not improve

Immediate unsustainable indicators:
- Retry traffic > 20% of total external API calls
- Model/API costs growing faster than completed rounds
- P95 latency > 2.5s on voting-related endpoints for >24h

---

## 4) Cost Controls

1. Budget guardrails
- Monthly hard cap for each external provider.
- Per-feature spend envelopes (notifications, parsing, solver jobs).
- Auto-disable non-critical features when budget threshold is reached.

2. Request efficiency
- Idempotency keys to prevent duplicate paid calls.
- Aggressive deduplication of retries.
- Cache stable data and avoid repeated recomputation.

3. Product-level controls
- Keep digest as default (already aligned with PRD) to reduce per-event email volume.
- Manual-first data entry path always available (already aligned with P-1).
- Keep AI parsing optional and opt-in when introduced.
- Keep CP-SAT appointment suggestion optional and never blocking for appointment confirmation.

4. Governance controls
- Weekly cost review against participation metric (>80% target).
- No rollout of a paid feature without "cost-per-outcome" estimate.

---

## 5) Fallback Strategies

1. Dependency fallback matrix
- Model API unavailable -> rule-based parser + manual confirmation.
- Email API unavailable -> in-app notifications only + retry queue.
- Solver failure/timeout or CPU saturation -> manual slot placement + feasibility-only view (already in spec logic).

2. Degraded mode policy
- Show clear status banners.
- Preserve data integrity over convenience.
- Disable only optional modules first.

3. Recovery policy
- Retries with bounded exponential backoff.
- Dead-letter queue for failed jobs with operator review.
- Post-incident replay for queued operations.

---

## 6) Monitoring Signals (Minimal Operations Dashboard)

### Reliability
- API error rate (overall, by dependency)
- 429 rate and retry volume
- Queue lag (email/digest/background jobs)
- Solver queue depth and queue wait time
- Circuit breaker open duration

### Performance
- P50/P95 latency per critical endpoint (vote submit, round view, ranking, slot suggestion)
- DB query latency and saturation
- Solver runtime distribution
- Solver timeout rate and host CPU saturation during solver bursts

### Cost
- Daily spend by provider
- Cost per action and per completed round
- Token consumption per parse (when v2 parsing exists)

### Product health coupling
- Participation rate per round (core metric)
- Drop-off step in user flow (join -> first vote)
- Completion rate of casting rounds

Alerting baseline:
- Page immediately for prolonged core-flow failure.
- Warning alerts for trend-based cost anomalies.

---

## 7) 30-Day Operational Risk Plan

Week 1
- Define SLOs and cost KPIs.
- Implement provider-level budget caps.
- Add per-dependency health checks.

Week 2
- Add retry policies, circuit breakers, and dead-letter queues.
- Implement degraded-mode banners, solver queue limits, and feature toggles.

Week 3
- Instrument cost-per-action metrics end-to-end.
- Run load test at 10x expected traffic.

Week 4
- Run outage game day: model API down, email API down, high-latency DB.
- Document runbooks and incident response steps.

Exit criteria:
- 10x load test passes with no core-flow outage.
- API outage drills show manual fallback works.
- Cost dashboard can explain cost per round and per user.

---

## 8) Key Recommendation

Because Flatmate.io v1 already avoids AI-critical dependency for core decisions, preserve that architecture discipline:
- Core casting workflow must remain provider-independent.
- Paid/fragile services should be optional accelerators, never hard dependencies.
- Measure cost against participation outcome, not against raw usage volume.
