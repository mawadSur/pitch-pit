# pitch-pit Growth Playbook

The manual replacement for the (now-removed) X auto-posting crons. Two
recurring rituals you can run by hand every week, plus the tracking
conventions that tell you which one is working.

Everything here points at surfaces that already exist:

- `/leaderboard` — live standings, all-time + per-week tabs, sorted by
  final score (½ AI, ½ crowd). Recomputed every vote, frozen Monday midnight EST.
- `/recap/[weekN]` — the cinematic per-week recap: winner, verdict,
  contenders, build status. Only exists once a week has **closed**.
- `/built` — the Hall of Fame. Every shipped MVP, live, claimed by its
  founder, no equity, no fees. This is your proof wall.
- `/idea/[id]` — a single pitch with its three-judge verdict reveal and the
  vote button.

Cadence at a glance:

| When | Channel | What |
|------|---------|------|
| **Saturday** | Reddit + Indie Hackers | "The Pit Closes Monday" vote-drive thread |
| **Tuesday AM** (week just closed) | Hacker News | Show HN launch, once `/recap/[weekN]` + a `/built` entry exist |

The pit closes Monday at midnight EST. Saturday gives voters ~48h; Tuesday
is the morning after the close, when there's a fresh winner and recap to show.

---

## 1. "The Pit Closes Monday" — recurring Saturday vote-drive

A weekly ritual thread. Same shape every week so it becomes recognizable, but
the finalists, pull-quotes, and proof rotate so it never reads as a bot.

**Goal:** drive votes before Monday midnight EST close.
**Post:** Saturday morning (your timezone), giving voters the full weekend.
**Where:** r/SideProject (primary — most receptive), r/Entrepreneur, and the
Indie Hackers "Show IH" / milestones feed. One subreddit per Saturday on
rotation, not all three the same day (see etiquette).

### Copy-paste template

> **Title:** The pit closes Monday — 3 AI judges already scored this week's finalists, now it's the crowd's turn
>
> ---
>
> pitch-pit is a weekly startup-idea contest. You submit a pitch, three
> AI judges (a YC-style reviewer, an attention/distribution guy, and a
> founder-psychology coach) score it 0–10, and the community votes. Final
> score is **50% AI, 50% votes** — so the crowd genuinely decides half of it.
> The top combined score Monday wins a **free MVP build**. No equity, no fees.
>
> **This week's finalists** (vote link goes straight to each one):
>
> 1. **[Finalist 1 title]** — [one-line pitch]. Judge pull-quote:
>    _"[verdict pull-quote]"_ → vote: `https://pitchpit.app/idea/[id]?ref=reddit`
> 2. **[Finalist 2 title]** — [one-line pitch]. Judge pull-quote:
>    _"[verdict pull-quote]"_ → vote: `https://pitchpit.app/idea/[id]?ref=reddit`
> 3. **[Finalist 3 title]** — [one-line pitch]. Judge pull-quote:
>    _"[verdict pull-quote]"_ → vote: `https://pitchpit.app/idea/[id]?ref=reddit`
>
> Full standings (updates every vote): `https://pitchpit.app/leaderboard?ref=reddit`
>
> **Proof this is real:** last week's winner, **[last winner title]**, is
> already built and live → `https://pitchpit.app/built?ref=reddit`
>
> Voting closes **Monday at midnight EST**. If one of these should win, go
> push it over the line.

### How to fill it each week

- **Finalists:** top 3 from `/leaderboard` (open-week tab). Use the slugged
  idea URL if you have it; bare `/idea/[id]` works too.
- **Pull-quotes:** pull one punchy line from each finalist's verdict reveal on
  its `/idea/[id]` page — the judges write quotable verdicts on purpose. Favor
  a judge's signature beat ("raise your standards", "patience and empathy",
  a sharp YC-style "painkiller vs vitamin" line) — they read as authored, not
  generated.
- **Proof:** grab last week's shipped winner from `/built` (newest card). A
  live, clickable MVP is the single most credible thing in the post.
- **CTA:** always close on the hard Monday-midnight-EST deadline. Urgency is
  the whole point of the thread.

### Anti-spam etiquette (so mods don't nuke it)

- **One subreddit per week**, on rotation. Don't cross-post the identical
  thread to all three the same day — that's the fastest way to a ban.
- **Participate, don't just drop.** Reply to every comment within a few hours.
  Vote-drive posts that the author abandons get removed as spam.
- **Read each sub's self-promo rule first.** r/Entrepreneur and r/SideProject
  both have day-of-week or ratio rules; some want a flair. On Indie Hackers,
  post it as a genuine milestone/update, not an ad.
- **Lead with the mechanic, not the link.** The first two sentences should
  explain the 3-judge / 50-50 format. Links come after the value.
- **Never use a URL shortener** and never repeat the exact same title two weeks
  running — vary the hook so it doesn't trip duplicate-detection.
- **Disclose you're the founder.** "I built this" up front buys goodwill;
  pretending to be a neutral fan loses it the moment someone checks.

---

## 2. Show HN launch kit

A one-time-feeling launch you can re-run roughly once a month when a build is
genuinely impressive. Don't burn Show HN weekly — it works once or twice.

**Timing:** the **morning after a week closes** (Tuesday EST), and **only once
a fresh `/recap/[weekN]` page and a new `/built` entry both exist**. HN wants
something finished to click. "We scored it, the crowd voted, here's the
delivered MVP" is a complete story; "we're running a contest" is not.

### Title options (pick one)

1. `Show HN: We let 3 AI judges and a crowd vote on startup ideas — the winner gets built`
2. `Show HN: pitch-pit – weekly idea contest, scored 50% by AI judges and 50% by votes`
3. `Show HN: Three adversarial AI judges rate your startup pitch 0–10, then we build the winner`

### Founder first comment (post immediately after submitting)

> I built pitch-pit because "get feedback on your idea" usually means one
> biased opinion or a dead Google Form. Here the pitch goes through **three
> adversarial AI judges** with different lenses — a YC-office-hours reviewer,
> an attention/distribution operator, and a founder-psychology coach — each
> scoring 0–10 with a written verdict. That's half the score.
>
> The other half is community votes, recomputed live. **Final score is a
> hard 50/50 split**, so neither the AI nor the crowd can crown a winner
> alone. The pit closes Monday at midnight EST; the top combined score wins a
> **free MVP build** — no equity, no fees.
>
> It's not vaporware: last week's winner is already shipped and live in the
> Hall of Fame → `https://pitchpit.app/built?ref=hn`. The full recap of the
> week that just closed (verdict, contenders, the build) is here →
> `https://pitchpit.app/recap/[weekN]?ref=hn`.
>
> Happy to go deep on the judge prompts, the scoring math, or how the build
> pipeline works. Roast it.

### What to lead with

In this order — this is the differentiated story:

1. **Three adversarial AI judges**, distinct lenses, written verdicts (not a
   single number).
2. **50/50 AI-vs-votes** scoring — the structural hook nobody else has.
3. **A delivered free MVP** — the proof. Link `/built` and the fresh
   `/recap/[weekN]` so the first click lands on something finished.

### Handling "is this just a gimmick" pushback

It will come up. Answer with substance, not defensiveness:

- **"AI judges are a gimmick."** → "They're not the whole score — they're
  half. And the verdicts are specific and adversarial, not a rubber stamp;
  read one on any `/idea/[id]` page. The point is fast, structured, multi-lens
  feedback you'd otherwise wait weeks for."
- **"The winner being 'built' is probably a landing page."** → drop a direct
  `/built` MVP link. Live, clickable, claimed by the founder. Let it speak.
- **"Crowds just upvote their friends."** → "That's exactly why it's only
  half. The AI half is blind to who you know. A weak pitch with a big network
  still can't win on votes alone."
- **"Why would I trust an AI score?"** → "You don't have to — it's
  transparent. Every verdict shows its reasoning and the dimensions it scored.
  Disagree with a judge? The crowd half is your counterweight."

Stay in the thread for the first few hours. HN rewards founders who engage.

---

## 3. Tracking conventions

Tag every outbound link so you can see which channel actually moves votes and
sign-ups. These are net-new conventions — apply them consistently from now on.

| Channel | Convention | Example |
|---------|-----------|---------|
| Reddit (all subs) | `?ref=reddit` | `https://pitchpit.app/leaderboard?ref=reddit` |
| Hacker News | `?ref=hn` | `https://pitchpit.app/built?ref=hn` |
| Email / newsletter | `?utm_source=email` | `https://pitchpit.app/recap/12?utm_source=email` |
| Indie Hackers | `?ref=ih` | `https://pitchpit.app/idea/abc?ref=ih` |

Rules:

- **`?ref=` for social/community** (reddit, hn, ih) — short, human-readable,
  survives copy-paste.
- **`?utm_source=` for email** — keeps it in the standard UTM namespace so it
  groups cleanly in analytics alongside any future `utm_campaign`.
- **One param per link.** Don't stack `?ref=reddit&utm_source=...` — pick the
  one that matches the channel.
- **Tag every link in the post**, including the `/built` proof link and the
  `/leaderboard` link — not just the primary CTA. Otherwise you can't tell
  whether the proof or the standings is what converts.
- Optional per-week campaign: append `&utm_campaign=week-[N]` on email blasts
  if you want week-over-week attribution.
