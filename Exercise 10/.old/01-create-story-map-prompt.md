### **CONTEXT**

You are helping create a **User Story Map** for *Flatmate.io*, a web app that consolidates the messy, 13-step process of casting a new roommate in a shared flat (WG) — currently scattered across a listing portal, a WhatsApp group, a scheduling tool, and sticky notes — into one place.

This story map will be used in a **teaching context**. Participants will later:

1. Draw an MVP line on top of this map
2. Use AI to challenge and refine that MVP

The product brief, vision, goals, persona, and non-negotiables are provided (see `00-Session-Brief.md`, `01-Problem-Framing.md`, `02-SRD.md`, `03-PRD.md` in this project) and must be strictly respected.

---

### **OBJECTIVE**

Create a **mid-level User Story Map** for Flatmate.io from the **end-user (resident) perspective only** — the people living in the WG who vote and coordinate, not the household admin account and not applicants without an account — suitable for a live workshop.

The output must:

- Be easy to understand at a glance
- Support drawing an MVP line
- Contain enough substance to enable meaningful discussion and AI-driven MVP challenges later

---

### **FORMAT**
Provide as a markdown file

---
### **PERSONA (ROLE)**

Act as a **Senior Product Manager and Product Discovery Coach**, experienced in:

- User Story Mapping (Jeff Patton style)
- Teaching product skills to software engineers
- Designing workshop-ready artifacts

---

### **STYLE**

- Clear, structured, and concise
- Practical over theoretical
- No fluff, no buzzwords

---

### **TONE**

Neutral, professional, and instructional

Optimized for learning and facilitation

---

### **AUDIENCE**

Mid-level software engineers with:

- Limited product management experience
- Strong analytical skills
- Participating in an AI Engineering Bootcamp

---

### **RESPONSE FORMAT (IMPORTANT)**

Output the User Story Map in a **sticky-note-ready structure**, using this hierarchy:

1. **User Activities** (top row, left → right, max 5)
2. **Epics** (grouped under each activity, max 3 per activity)
3. **Example User Stories** (1–5 per epic, lightweight)

Formatting rules:

- Use short, sticky-note-friendly phrasing
- One idea per line
- No markdown tables
- No emojis

---

### **STEPS (FOLLOW IN ORDER)**

1. Identify the **core end-to-end journey** of a Flatmate.io resident (from joining the household to welcoming the person who moves in)
2. Define **User Activities** that describe *what the resident is trying to achieve*
3. Break each activity into **Epics** (still user-centric, not technical)
4. Add **example User Stories** using simple “As a resident, I want…” phrasing, but leave that bit out and start all stories with “…” to keep stickies short
5. Validate that:
    - All stories serve the primary persona (Lukas, the Resident — lives in a seven-person WG in Tuebingen, votes and occasionally moderates a round)
    - All content aligns with Flatmate.io's goals and non-negotiables (channel neutrality, device neutrality, explainable rankings, no AI-driven judgment of applicants, self-redaction on visibility)
6. **Do NOT**:
    - Decide what is MVP
    - Optimize or remove scope
    - Introduce household-admin-account, applicant-only, or system-internal (solver, notification delivery, data retention jobs) stories

This is a **baseline story map**, not an optimized one.

---

### **CONSTRAINTS**

- End users only (residents, including residents acting as moderators)
- Mid-level detail (activities + epics + example stories)
- No technical implementation details
- No acceptance criteria
- No prioritization or MVP slicing
- Use only information consistent with `01-Problem-Framing.md`, `02-SRD.md`, and `03-PRD.md`
