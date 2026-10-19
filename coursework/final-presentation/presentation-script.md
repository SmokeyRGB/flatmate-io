### 0 · Title
Hi everyone. Today I'll show you my journey with flatmate.io, and what I learned building an app agentic first.

### 1 · Idea recap
A quick recap. In big flat shares, choosing a new flatmate happens in a crowded group chat. People lose track, and one or two people do all the work.
These are real messages from our chat. One person doesn't know when the casting is. Others feel strange deciding for 13 people with only four of them. That doesn't feel fair.
My idea: one app for the whole process. Everyone sees the same applicants, everyone votes, and every vote counts.

### 2 · Hypotheses
My first hypotheses: a new user can join with an invite link and vote within three minutes, without help. And one clear next step works better than a dashboard.
User tests confirmed both. The vote scale was only partly clear, so I improved it.
Still open: does a hidden ranking motivate people, and do more than 80 % of a flat vote? I need real casting data for that, and my database must be GDPR-safe first.
AI persona tests find bugs early, but only real people can confirm a hypothesis.

### 3 · Journey
Until mid-September I mostly planned: detailed specs with AI, and a prototype. The first code came on September 16. Two days later I switched to OpenSpec, with smaller specs.
About two thirds of my work was planning, one third was building. That's the shift with agentic coding: the main work is designing the idea, not writing code.
The result: about 650 commits, 23,000 lines of code, 1,800 tests, and one developer: me.

### 4 · Slices
At first I built every feature completely before the next. After three features I still couldn't show a complete flow.
So from F3 on, I built only the core of each feature first. Then I improved them in parallel. They touched different parts of the app, so several agents could work at the same time. On October 2 the core flow worked for the first time. I should have done this from the start.

### 5 · Loop
This is how I built each slice. My loop: agents explore the code, Opus proposes a plan, and I review the specs. A separate agent attacks the plan. Sonnet implements, Opus reviews, checks run, and I click through it myself. If I want changes, it goes back. Then code review and a Copilot review.

### 6 · Specs
Precise specs help, but rigid specs are a problem. When I changed a decision, the AI kept pointing to the old specs.
Testers wanted to change their vote. My specs said no, to avoid social pressure. So Claude said: "But you don't want this." And I said: "I know. Do it anyway."
The AI follows specs very literally. So my lesson: detailed, yes, but flexible. A new decision must beat an old spec.

### 7 · Tests
At first, all tests ran against my live database in the EU. But GitHub's runners are in the US, so CI had timeouts.
So CI now uses a database inside the runner, and locally I test against the live one. That found bugs that only happen on the real platform. But with parallel features, the live database got overloaded again.
Next time: local by default, live only regularly.

### 8 · Mistakes → rules
In the reviews I saw the same mistakes again and again. So I wrote them into hazard files and CLAUDE.md.
At the end, reviews found far fewer problems, and pull requests needed fewer rounds. And the remaining mistakes moved: the code did what the plan said, so if something was wrong, it was the plan.

### 9 · Budget
At the start, I sometimes ran out of tokens in the middle of the week, with half-finished features. Later I planned the whole week: which features do I start, and which do I really finish? Some ideas I just wrote down for later.

### 10 · AI stance
In the product, I kept AI out of every automatic evaluation. Under the EU AI Act, AI in areas like housing assistance counts as high-risk, and picking tenants is very close to that.
But to learn, I built two tools.

### 11 · Parser
First, an application parser in n8n. A request comes in as text or as a screenshot. Here it's text: the free text of an applicant becomes structured fields the app can use.

### 12 · RAG
Second, a search over my specs for Claude, so it finds information faster. Current docs come first, old docs only if needed. That way outdated specs are used much less. Haiku answered as well as Opus, for a fraction of the cost. One problem: some questions the docs can't answer looked as close as real ones.

### 13 · Vision
What's next? First I finish v0.1, with a few security changes in the database.
Then the first real household: a friend will soon start a casting in his flat. It's a smaller flat, so it's a good first test.
After that, bigger flat shares, once I'm sure it's secure and I won't end up in jail. That's why it's v0.1, not v1.

### 14 · Takeaways
Five things I'd tell myself on day one:
Build a thin slice first.
Keep specs detailed, but flexible.
Turn every mistake into a rule.
Plan your budget and pick the right model.
And go to real users early. Only they give you real feedback.
Thank you! Questions?

