# PRD: Pet Rescue Website

> **Status:** Draft v0.2 · **Last updated:** 2026-05-03 · **Owner:** TBD

## 1. Overview
A web platform that helps reunite lost pets with their owners and supports people who have found stray animals. The site emphasizes a warm, approachable interface, low-friction reporting via guided forms, and one-click sharing to social media to maximize reach during the critical first 24 hours after a pet goes missing.

The core insight: most existing tools (Facebook groups, Nextdoor, scattered shelter intake systems) are fragmented and slow. The fastest reunions happen when a lost report and a found report are matched within hours — not days or weeks. This product collapses that loop.

## 2. Goals (with measurable targets)

### Primary outcome goal
- **Reunite 60% of reported lost pets within 24 hours of the report being submitted, and 85% within 7 days, measured across the pilot city within 6 months of launch.**
  - Baseline reference: PawBoost and informal Facebook groups self-report median reunion times measured in days to weeks; the 24-hour target is ambitious and is the central wedge of the product.

### Supporting goals
- **Form completion under 3 minutes** at the 75th percentile, measured from form open to submit.
- **At least 1 social share per submitted listing** in the first hour, on average.
- **First match alert delivered within 5 minutes** of either side of the match being posted.
- **Helpline / support response within 15 minutes** during staffed hours; within 1 hour outside staffed hours via async channels.
- **Net Promoter Score ≥ 50** from users who completed a reunion.

## 3. Target Users

### Primary: "Panicked Owner" — Maya, 34
Just realized her dog slipped the back gate 20 minutes ago. On her phone, walking the neighborhood, crying. Tech-comfortable but not in a state to read instructions. Will abandon any form longer than 2 minutes. Needs reassurance as much as functionality.

**Design implication:** every screen must work one-handed, in bright sunlight, with shaky input. Copy must be calm, not corporate.

### Secondary: "Reluctant Helper" — David, 52
Found a friendly stray in his front yard. Doesn't own a pet, doesn't know what to do, doesn't want to take it to a shelter where it might be euthanized. Low patience for account creation.

**Design implication:** the Found flow must work without an account. He should be able to post in under 90 seconds.

### Tertiary: "Overwhelmed Shelter Worker" — Priya, intake coordinator
Processes 15–40 intakes per day across paper and PetPoint. Will only adopt this tool if it saves her time, not adds to it. Must integrate with existing software, not replace it.

**Design implication:** shelter integration is API-first and read-only at launch. We pull intake data; she does nothing extra.

### Tertiary: "Community Volunteer" — Marcus
Admins three local lost-pet Facebook groups. Will cross-post listings if it's one click. Can become a force multiplier.

## 4. Core Features

### 4.1 Landing Page
- Two prominent, color-coded CTAs: **"I Lost a Pet"** (red/urgent) and **"I Found a Pet"** (green/calm).
- Friendly visual tone: soft colors, rounded type, real animal photos, no clinical or legal feel.
- ZIP-code search bar above the fold to browse recent nearby listings.
- Reassurance copy: *"You're not alone — most lost pets are found within 5 miles of home, and most reunions happen in the first 24 hours."*
- Live counter of recent reunions (social proof).

### 4.2 Lost Pet Form

**Required fields** (kept minimal so submission can happen in under 2 minutes):
- Species (dog / cat / other) — single tap
- Photo (at least one; camera-roll or live capture)
- Last seen location (auto-filled from geolocation, editable map pin)
- Date and time last seen (defaults to "just now")
- One contact method (email or phone)

**Optional fields** (collected progressively after submission so the alert pipeline starts immediately):
- Pet name, breed, color, size, age
- Distinguishing features (microchip ID, collar, scars, gait)
- Additional photos
- Reward offered

**Submission behavior:**
- The listing goes live and the matching pipeline starts the moment required fields are submitted; optional fields can be added later from the listing page.
- Auto-save draft every 5 seconds.
- Anonymous submission allowed; account creation offered (not required) on the confirmation screen.
- Validation: photo must be an image under 10MB; location must resolve to a real address; phone/email format-checked.

### 4.3 Found Pet Form
Same minimal-required pattern as Lost, plus:
- Current condition (healthy / injured / scared / aggressive)
- Custody status (I have the pet / left it where I found it / took it to a shelter — which?)
- Quick links to nearby vets, shelters, and animal control surfaced based on ZIP
- Anonymous-by-default with privacy-protected contact relay

### 4.4 Listings & Matching

**Listing object** (the canonical data unit):
- Type (lost / found), species, photos, location (lat/lng + radius), event timestamp, attributes, contact handle, status (active / paused / reunited / expired), source (user / shelter API / volunteer)
- Listings auto-expire after 90 days unless renewed; all data anonymized at expiry except aggregate statistics.

**Matching pipeline** (runs on every new listing within seconds):
1. **Hard filters:** species match; geographic distance within 25 miles; date window (lost/found events within 30 days of each other).
2. **Attribute scoring:** weighted similarity on size, color (handled via a tagged color taxonomy + dominant-color extraction from photos), breed, age, distinguishing marks. Weights derived from labeled reunion data once available; rule-based with sensible defaults at launch.
3. **Image similarity:** perceptual-hash and embedding-based comparison of photos using an off-the-shelf vision model (e.g., CLIP or a fine-tuned variant). Returns a similarity score in [0, 1].
4. **Composite confidence score** in [0, 1] combining the above. Thresholds:
   - **≥ 0.75 = high confidence** → instant push/SMS alert
   - **0.50–0.74 = medium** → email alert
   - **0.25–0.49 = low** → daily digest
   - **< 0.25** → suppressed
5. **Feedback loop:** every "this is my pet" / "not a match" response retrains threshold weights weekly.

**Listings UI:**
- Map view of nearby cases (clustered markers).
- Filterable feed (species, date, distance).
- Each listing has a public, shareable URL with rich Open Graph metadata for great social previews.

### 4.5 Social Media Integration
- One-tap share to Facebook, Instagram, X, Nextdoor, WhatsApp, and SMS.
- Auto-generated share image: pet photo + "LOST" or "FOUND" banner + neighborhood + scannable QR code linking back to the listing.
- Pre-filled, editable share copy.
- "Share to local groups" wizard: directory of nearby Facebook lost-pet groups, with copy-paste-ready text and one-click links.
- Tracks share counts per channel (informs which channels actually drive reunions).

### 4.6 Advice Center
Deeply-written guides — written for someone in panic — including:
- **First 24 Hours After Losing a Pet** (checklist format, the flagship article)
- How and where to search (cats vs. dogs behave very differently when lost)
- How to make and post effective flyers (printable templates auto-filled from your listing)
- Talking to neighbors, mail carriers, and delivery drivers
- Working with shelters, vets, and animal control
- Using scent (worn clothing, litter box) to attract pets home
- What to do if you find an injured stray
- Emotional support resources for grieving owners
- **Scam awareness:** common "I have your pet, send money" extortion patterns

Each article: short intro, scannable checklist, expandable detail, "next step" CTA.

### 4.7 Match & Found Alerts

**Triggers:**
- A new listing on the opposite side passes the matching threshold.
- A partner shelter or rescue posts an intake that resembles the user's pet.
- Another community member tags an existing listing as a possible match.
- The listing is marked **"Reunited"** by the user, a moderator, or a verified shelter — celebratory confirmation alert sent.

**Delivery channels** (user-selectable at submission):
- In-app banner and notification inbox
- Email (always on by default)
- SMS (opt-in; reserved for high-confidence matches)
- PWA push notifications

**Alert content:**
- Side-by-side photo comparison
- Confidence score and the matched attributes ("Same breed; found 1.2 miles from last seen location; 2 hours after report")
- One-tap actions: **"This is my pet"**, **"Not a match"**, **"Contact finder/shelter"**
- Negative-match responses feed back into the algorithm

**Frequency controls:**
- Instant for high confidence; digest for low confidence
- User can pause alerts after reunion
- Hard cap of one SMS per hour to prevent fatigue

### 4.8 Help & Support (revised — replaces v0.1 staffed 24/7 helpline)

The original 24/7 phone helpline has been deferred to v2 due to operating cost (staffing a real round-the-clock line is six figures per year and out of scope for a v1 launch). Replaced with a tiered support model that scales with budget:

**v1 (launch):**
- **In-app AI support assistant** trained on the Advice Center content; available 24/7. Answers common questions, walks users through forms, and escalates urgent cases (injured animals, suspected scams, custody disputes) by flagging them in a human review queue.
- **Async email support** with a 4-hour response SLA during staffed hours (9am–9pm local), 12-hour overnight.
- **Helpline directory:** prominent links on every page to existing 24/7 services that already exist and are well-funded — ASPCA Animal Poison Control, local animal control non-emergency lines, partner shelter after-hours lines.
- **Crisis-care callback form** for users in distress; volunteer responder calls back within 1 hour during staffed hours.

**v1.1 (3–6 months post-launch, if usage justifies):**
- Live chat staffed during peak hours (evenings/weekends), AI fallback overnight.

**v2 (12+ months):**
- Pursue partnership with an existing welfare org to co-brand a real 24/7 phone line, rather than building one in-house.

### 4.9 Trust & Safety (new)

The platform connects emotionally vulnerable users with strangers; safeguards are first-class features, not afterthoughts.

**Identity & accounts:**
- Anonymous submission allowed, but a verified email is required to receive contact from other users.
- Optional account creation unlocks listing edits, alert history, and the Reunion claim flow.
- Phone numbers verified via OTP before enabling SMS alerts.

**Reunion / ownership-claim flow:**
- When a finder and a claimer connect, the platform mediates: claimer must provide *at least two* of {prior photo with metadata, vet record, microchip ID, distinguishing-feature description not shown publicly}.
- Only non-public attributes (e.g., a specific scar, microchip number) count for verification.
- Disputes routed to human moderation queue with 4-hour SLA.

**Anti-abuse:**
- Contact details never exposed publicly; all communication routed through platform relay (email + SMS proxy).
- Rate limits on listing creation and message sending per IP / per account.
- Image hashing to flag duplicate or stock-photo listings.
- One-tap "Report" on every listing and every message; reports triage to moderation queue.

**Scam mitigation:**
- Automated detection of common scam patterns (out-of-area phone numbers replying to local listings, requests for shipping fees or gift cards in relayed messages); flagged messages quarantined with a warning to the recipient.
- Prominent in-flow warnings whenever money is mentioned in a message.

**Moderation model:**
- Automated first pass (scam patterns, image dupes, profanity, obvious spam).
- Human review queue staffed during business hours for flagged content; SLA: 4 hours weekdays, 12 hours weekends.

### 4.10 Shelter Integration (clarified)

Shelters are not expected to do extra data entry. Integration is **read-only and pull-based** at launch:
- Direct API integrations with **PetPoint** and **Shelterluv** (the two largest shelter management systems by US market share) — covers a meaningful share of municipal shelters without per-shelter onboarding.
- For shelters on other systems or paper: a lightweight **shelter portal** with a 4-field intake form (species, photo, intake date, ZIP) and an optional CSV upload.
- Shelter intake records appear in the matching pipeline as first-class listings, marked with a verified-source badge.
- Shelter integration is **out of scope for the MVP launch milestone** but in scope for v1.0 (within 6 months of MVP).

## 5. Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| First contentful paint (mobile 4G) | < 1.5s | Users on the move on phones; slow load = abandonment |
| Form submission round-trip | < 2s | Submission is the conversion event |
| Matching pipeline latency | < 5 min from listing post to alert dispatch | Supports the 24-hour reunion goal |
| Accessibility | WCAG 2.1 AA | Reasonable bar; AAA is impractical for image-heavy UI |
| Uptime | 99.5% | Lost pets don't wait for maintenance windows |
| Data privacy | GDPR + CCPA compliant; contact info never public | Legal floor + user trust |
| Photo storage | Max 10MB/photo, 10 photos/listing; auto-resized | Cost control + mobile upload speed |

## 6. Out of Scope (v1)
- Adoption marketplace
- Paid promotion of listings
- Native mobile apps (PWA at launch)
- Languages other than English (Spanish targeted for v1.1)
- Staffed 24/7 phone helpline (deferred to v2 — see §4.8)
- Shelter API integrations (deferred to v1.0 — see §4.10)
- International expansion (US only at launch)

## 7. Success Metrics

| Metric | Target | Measurement window |
|---|---|---|
| % of lost-pet reports reunited within 24h | 60% | Pilot city, 6 months post-launch |
| % of lost-pet reports reunited within 7d | 85% | Pilot city, 6 months post-launch |
| Median time from report to reunion | < 18 hours | Rolling 30-day |
| Form completion rate (start → submit) | ≥ 80% | Rolling 7-day |
| Median form submission time | < 3 min (75th percentile) | Rolling 7-day |
| Match alert latency (listing → alert) | < 5 min, p95 | Rolling 7-day |
| Average shares per listing in first hour | ≥ 1 | Rolling 30-day |
| False-match rate (user marks "not a match") | < 25% of high-confidence alerts | Rolling 30-day |
| NPS from reunited users | ≥ 50 | Rolling 90-day |
| Trust & safety: scam reports per 1000 listings | < 5 | Rolling 30-day |

## 8. Competitive Landscape

| Competitor | Strength | Weakness we exploit |
|---|---|---|
| **PawBoost** | Large user base, paid alerts | Pay-to-play model puts urgency behind a paywall |
| **Petco Love Lost** | Facial recognition for pets, brand trust | Limited social sharing; clinical UX |
| **Nextdoor** | Hyper-local reach | Not pet-specific; lost-pet posts buried in a general feed |
| **Facebook lost-pet groups** | Where users actually go today | Fragmented per city; no matching; algorithmic burial |

**Our wedge:** the only product that combines (a) instant cross-listing matching, (b) one-click sharing into the Facebook groups users already use, and (c) genuinely helpful in-the-moment guidance — for free.

## 9. Phased Rollout

- **MVP (Month 0–3):** Lost/Found forms, basic listings, social sharing, advice center, email alerts, anonymous use, AI support assistant. Single pilot city.
- **v1.0 (Month 3–6):** Matching pipeline with image similarity, SMS alerts, accounts, ownership-claim flow, shelter API integrations (PetPoint, Shelterluv).
- **v1.1 (Month 6–12):** Spanish localization, peak-hours live chat, expanded city coverage.
- **v2 (Month 12+):** 24/7 helpline via partner org, native apps if PWA proves limiting, additional shelter system integrations.

## 10. Open Questions

1. **Pilot geography:** which city? Selection criteria: intermediate size (~250k–750k), at least one large municipal shelter willing to partner, active local Facebook lost-pet groups for distribution.
2. **Funding model:** non-profit / donation-supported, or a freemium model with paid features for shelters? This affects everything from hosting costs to whether the helpline is feasible.
3. **Microchip registry integration:** can we partner with AKC Reunite, HomeAgain, or 24PetWatch to look up chips on found-pet submissions? Would dramatically increase reunion rate but requires legal agreements.
4. **Photo similarity model:** off-the-shelf (CLIP) vs. fine-tuned (Petco Love Lost reportedly uses a custom model)? Cost vs. accuracy tradeoff to validate during MVP.
5. **Shelter euthanasia disclosure:** if a found pet is in a shelter, should we display a stay-deadline countdown? Useful but emotionally heavy and could deter shelter participation.
6. **Verification cost vs. friction:** how strict is the ownership-claim flow before legitimate owners drop off? Needs user testing.
7. **Moderation staffing:** automated-first works for bulk spam, but ownership disputes and scam reports need humans. Volunteer moderators (cheaper, slower, harder to scale) vs. paid (faster, expensive)?
8. **Liability:** what's our exposure if someone uses the platform to claim a pet that isn't theirs, or harms a finder they met through us? Needs legal review before launch.
9. **Data retention:** how long do we keep listing data after a reunion? Useful for training the matching model; in tension with privacy.
10. **Founder/team:** who builds this? A two-person engineering team can probably build the MVP in a quarter, but the matching pipeline and trust & safety work in v1.0 need ML and ops capacity that doesn't exist yet.
