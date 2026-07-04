---
name: skill-creator
description: Use this skill whenever the user wants to build, create, make, set up, write, edit, improve, refine, or fix a Kowork skill, or when they describe a repeatable way they want the agent to work going forward — for example "can you always format my meeting notes like this from now on", "remember these steps so you do them every time", "set up a reusable checklist for X", or "turn this into something you'll reuse". When in doubt, prefer using this skill.
---

# Skill Creator

This skill helps you work alongside the user to build a brand-new skill or polish one they already have. A skill is simply a reusable set of written instructions that you'll follow later — so once it's saved, the user can ask for the same kind of help again and again without re-explaining themselves. Your job here isn't to do the task once; it's to capture what the user wants clearly enough that it works well every future time. Think of yourself as a helpful interviewer who then writes everything down neatly.

## Talk like a human

The person you're helping may not be technical, so keep things warm and simple.

- Skip jargon. If you must use a technical word, explain it in a few plain words right away.
- Keep it a friendly back-and-forth, not a form to fill out.
- Ask before you assume — a quick question beats a wrong guess.
- Play back what you heard in your own words and confirm it before you write anything.

## How this goes

Here's the rough shape of the work. The order isn't strict — meet the user wherever they are, and skip ahead or double back as needed.

- Find out whether they want to **create a new skill** or **improve one they already have**.
- Understand what the skill should do, and just as importantly, *when* it should kick in.
- Write (or revise) the SKILL.md together.
- Save it, then help them turn it on in Kowork.
- They try it out in normal use and come back anytime they'd like to refine it.

## Figure out what they want

**Mine the conversation first.** Often the user is already partway through something and says "turn this into a skill" or "do it like that every time." Before you ask a single question, look back at what just happened — the steps you took, the corrections they made, the format or wording they clearly preferred — and build on that. Then confirm it with them, so they don't have to repeat themselves.

**Draw out the essentials** with a few focused questions, not an interrogation. Three things you really need:

1. **What should it do?** The task or outcome the user wants, in their own words.
2. **When should it kick in?** The kinds of requests, situations, or phrases that should switch it on. Stress that this one matters a lot — it's what later decides whether the skill actually gets used at the right moment.
3. **What should the result look like?** Any format, structure, or style they expect — and ask for a concrete example if they have one.

Then probe lightly for the useful extras:

- Tricky cases or exceptions to handle.
- Anything the skill should *avoid* doing.
- Any example inputs and outputs they can share.

You don't need everything perfect up front. Gather enough to write a solid first draft, fill any gaps with sensible assumptions, and then tell the user which assumptions you made so they can correct them.

## Write the SKILL.md

**The shape of a SKILL.md.** It has two parts:

1. A small header block at the very top, written in YAML (a simple `field: value` format) between `---` fences. It has exactly two fields: `name` and `description`.
2. Below the header, the body — plain Markdown instructions written to the agent, telling it how to do the task.

**The name.** A short, lowercase, hyphenated label of a few words, like `meeting-notes-formatter`. Make it match the skill's folder name. It's just an identifier, so keep it simple.

**The description is the most important line you'll write.** Here's why: up front, Kowork only shows the agent the name and description — not the body. The agent reads that description to decide whether to open the skill and follow it at all. So the description has to do two jobs at once: (1) say plainly what the skill does, and (2) name the concrete situations, request types, and phrasings that should switch it on. Put **all** the "when to use this" cues here — never bury them in the body, because the body isn't seen until the skill has already been chosen.

**Lean toward getting used.** A skill that never activates is useless, and the more common mistake is a skill sitting idle when it should have helped. So make the description a little assertive about when to apply, and name the trigger situations generously.

**Before / after example** (for an imagined "meeting notes" skill):

- **Weak:** "Formats meeting notes." — too vague; the agent won't know when to reach for it.
- **Better:** "Use this whenever the user shares raw meeting notes or asks to tidy up, summarize, or format notes from a meeting, call, or discussion — including phrases like 'clean up these notes', 'write up the meeting', or 'give me the action items'. Turns rough notes into a clear summary with decisions and next steps."

### Write the body

- **Write it as direct instructions to the agent.** Use the imperative voice — "Ask the user for X", "Start by doing Y" — as if you're briefing a capable assistant on how to handle the task.

- **Explain the *why*, don't just bark rules.** The agent follows guidance far better when it understands the purpose behind a step, and it can then handle situations the instructions never anticipated. If you notice yourself piling up shouty ALL-CAPS "ALWAYS" and "NEVER" rules, treat that as a warning sign — usually it's better to explain the reason so the agent genuinely gets why it matters.

- **Show, don't just tell.** Include a concrete example or two of good input → output. If the skill must produce a specific format, give a short template the agent can follow, like:

  ```
  ## Summary
  - What was decided:
  - Action items (who does what, by when):
  ```

- **Keep it focused and general.** Write for the whole family of requests this skill will handle, not just the one example in front of you — otherwise it works once and stumbles on the next, slightly different request. Cut anything that isn't earning its place.

- **Keep it short and skimmable, and split when it grows.** A tight, single page is ideal. If the skill needs a lot of detailed reference material, put that material in separate files inside the skill's folder and point to them by name from the body (e.g. "see pricing-rules.md"), so the agent only opens them when it actually needs them. This keeps the main instructions quick to scan.

- **Then polish.** Write a first draft, reread it with fresh eyes as if you were the agent seeing it cold, and simplify anything confusing.

## Improve an existing skill

Sometimes the user doesn't want a new skill — they want to fix or upgrade one they already have.

- **Start with what's there.** Have the user point you to that skill's folder, then read its current SKILL.md so you understand what it does today.
- **Ask what's off.** Find out what isn't working or what they'd like to be different, and get a concrete example of a time it fell short. Specifics beat vague dissatisfaction — "it ignored the deadline column" tells you far more than "it's not great."
- **Diagnose before rewriting.** The right fix usually depends on the symptom:
  - If the skill **doesn't kick in when it should** (or kicks in when it shouldn't), the fix is almost always in the **description** — adjust which situations and phrasings it names.
  - If the skill **runs but the result isn't right**, the fix is in the **body** — clarify the steps, add a missing rule or example, or explain the reasoning better.
- **Revise with the same principles** as writing a new skill: a clear description that names when to use it, and a direct, example-backed body. Keep the skill's existing name and folder unless the user specifically wants to rename it.
- **Save over the same SKILL.md.** Let the user know they may need to start a fresh request (or reload) for the updated version to take effect — and that it's completely normal to go a couple of rounds: adjust, try it, adjust again.

## Save it and switch it on

- **Save it as a folder.** A skill is a folder named after the skill — for example `meeting-notes-formatter/` — that holds the `SKILL.md` file (plus any extra reference files you split out). Create that folder somewhere the user can easily find, and tell them the exact location, since they'll need to select it in the next step.

- **Turn it on in Kowork.** Walk the user through it, one click at a time:
  1. Open **Settings**.
  2. Go to **Skills**.
  3. Choose **Add custom skill**.
  4. Pick the **Local folder** option.
  5. Select the skill's folder.

  Once it's added, the skill is active.

- **Use it and refine.** From here, the user doesn't need to do anything special to trigger it — they just make the kind of request the skill is built for, and it takes over. Encourage them to try it on something real, and to come back anytime to fine-tune it (that loops right back to improving an existing skill).

Nice work — once it's on, the user gets that same great help on tap, without ever explaining it twice.
