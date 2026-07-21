// Per-tool onboarding intros — the one-time guided flow a user plays the FIRST
// time they open an arsenal tool. Real onboarding (~1–2 min): what the tool is,
// the psychology behind it, how it works here (protocols unlock as you rep),
// one real micro-rep, and the handoff to their first protocol. Completing it
// marks the tool "introduced" (MindProgress.introducedSystems) and writes the
// micro-rep to the journal so the AI can build on it. Client-safe content.

import type { GuidedStep } from '@/components/mind/system/GuidedFlow'

export interface IntroFlow {
  title: string
  steps: GuidedStep[]
}

export const INTRO_FLOWS: Record<string, IntroFlow> = {
  'state-shift': {
    title: 'Welcome to State Shift',
    steps: [
      { title: "Your state decides what you're capable of right now.", body: "Same person, same day: calm and focused, you handle things. Scattered and wired, the same things flatten you. The difference isn't ability. It's state, and state is adjustable." },
      { title: 'First, check where you actually are.', body: "Quick, honest read. No fixing yet, just noticing. This is the move you'll open with every time.", scale: { min: 1, max: 5, minLabel: 'Scattered', maxLabel: 'Locked in' } },
      { title: 'You can shift state faster than you think.', body: "Your body leads and your mind follows. Sixty seconds of slow breathing changes your nervous system. Movement changes your chemistry. Naming what you feel takes the charge out of it. None of this is willpower. It's mechanics." },
      { title: 'Here, a reset takes about two minutes.', body: 'You check in, then run a short reset matched to where you are: breath, presence, or a snap-back to action. Every rep counts, and reps unlock protocols like Cut the Noise, Move to Shift, and Protect the State.' },
      { title: "Try the core move: name what's running.", body: 'Saying it plainly moves it from running you to being seen by you. That alone loosens its grip.', inputPrompt: 'What state are you in right now, and what put you there?', placeholder: 'e.g. Wired and scattered, too much scrolling before this' },
      { title: 'Your first protocol is ready: Name the Next Action.', body: "When your head is noisy, it collapses the whole pile into one physical move. Open this tool any time your state isn't the one you need. That's what it's for." },
    ],
  },
  'self-image': {
    title: 'Welcome to Self-Image',
    steps: [
      { title: 'You never outperform your self-image for long.', body: 'It works like a thermostat. Act above the person you believe you are and something quietly pulls you back down. Diets, routines, streaks, they all snap back to the image. So we change the image.' },
      { title: 'Your self-image was built from evidence, so it can be rebuilt the same way.', body: 'The old story came from old data: things you did, things people said, moments you kept replaying. New actions are new data. Every rep you do is a vote for a different person.' },
      { title: 'Here you collect evidence and install the new identity on purpose.', body: 'Short reps: affirmations said right, present tense and backed by proof. Evidence logs. Story rewrites. As you rep, you unlock protocols like Future Self, Act As If, and Rewrite the Story.' },
      { title: 'Name one piece of evidence from this week.', body: "Not a wish. A fact. Something you actually did that the person you're becoming would do.", inputPrompt: 'What did you do recently that the new you would do?', placeholder: "e.g. Trained on a day I really didn't want to" },
      { title: 'Now be honest about where the image sits today.', body: 'No judgment. This is a baseline, not a verdict.', choices: ['Mostly the old story', 'In between', 'Mostly the new one'] },
      { title: 'Your first protocol is unlocked: Identity Installation.', body: 'Two minutes: one line about who you are, backed by evidence. You just proved you have some. Come back daily and stack it.' },
    ],
  },
  'mission': {
    title: 'Welcome to Mission',
    steps: [
      { title: "Discipline runs out, but a real reason doesn't.", body: "Motivation is weather. It comes and goes and you can't schedule it. A reason that actually matters to you is climate. It's still there on the days nothing else is." },
      { title: 'Most people quit because their reason was never really theirs.', body: "Look better. Should. New year. Surface reasons fold under load. The real one lives a few layers down, and it's usually about who you want to be, or who you want to be it for." },
      { title: 'Here you dig up the real reason and act on it daily.', body: 'Your mission is two things: the purpose underneath, and one forward move a day. Reps unlock protocols like Find Your Why, One Move Forward, and Who You Want to Be.' },
      { title: 'Take the first pull at the thread.', body: "The surface answer is fine. It's the door, not the destination.", inputPrompt: "Why are you really doing this? First honest answer.", placeholder: "e.g. I'm tired of not trusting myself" },
      { title: 'Your first protocol is open: Find Your Why.', body: 'It takes the answer you just gave and pulls the thread two layers deeper. Most people find the real one on the third pull. Run it now, while this one is fresh.' },
    ],
  },
  'vision': {
    title: 'Welcome to Vision',
    steps: [
      { title: "You can't build a life you've never seen.", body: 'Your brain steers toward the clearest picture it holds. Athletes rehearse the race before they run it for the same reason. No picture means drift: busy, effortful, going nowhere in particular.' },
      { title: 'Vision is the powerhouse the other tools plug into.', body: 'Discipline needs a target. Mission needs a picture of where the reason leads. Self-image needs a person to become. This is where all of it points.' },
      { title: 'Your vision covers five domains, not just the gym.', body: 'Habits, mind, body, relationships, environment. They pull on each other: bad sleep breaks training, the wrong room breaks habits. So the picture has to be the whole life, not one corner of it.' },
      { title: 'Give the picture its first line.', body: 'A scene, not a goal. Something concrete enough that you can see it.', inputPrompt: "One year out: what's one scene from your life that tells you it worked?", placeholder: 'e.g. Sunday morning, training done, cooking with people I love' },
      { title: "Pick the domain you'd start with.", body: 'Just an opening bid. The vision you build here will cover all five.', choices: ['Body and habits', 'Mind', 'Relationships', 'Environment'] },
      { title: 'Your first protocol is ready: See the Future You.', body: "A two-minute rehearsal of a normal day as that person. Your nervous system can't tell rehearsal from real. Rehearse it enough and today starts copying it." },
    ],
  },
  'social': {
    title: 'Welcome to Social',
    steps: [
      { title: 'The people around you are shaping you right now.', body: "Habits, standards, and moods are contagious. You sync to your circle without noticing: how they eat, how they talk to themselves, what they let slide. Environment isn't background. It's training." },
      { title: 'This is not about cutting people off.', body: "It's about seeing clearly and choosing on purpose: know what each relationship trains in you, invest in the ones that raise you, and be someone who raises others. Influence flows both ways." },
      { title: 'Here you audit your circle and train connection like a skill.', body: 'Reps: honest circle audits, real conversations, standards you carry into every room. As you rep, you unlock protocols like Circle Audit, Genuine Interest, and Hard Conversation.' },
      { title: 'Do one honest rep right now.', body: "Name the effect, not just the person. What do you do differently when they're around?", inputPrompt: 'Who in your life makes you better, and how?', placeholder: 'e.g. My brother. Around him I actually follow through' },
      { title: 'Which way is your circle mostly pulling right now?', body: "Honest read. It's data, not disloyalty.", choices: ['Raising me', 'Mixed', 'Dragging me'] },
      { title: 'Your first protocol is unlocked: Circle Audit.', body: "It maps your five closest people and what each one trains in you. Ten minutes, and you'll see your environment clearly, maybe for the first time." },
    ],
  },
  'discipline': {
    title: 'Welcome to Discipline',
    steps: [
      { title: 'Discipline is a skill, not a personality trait.', body: "Nobody is born with it. It's built one rep at a time: doing the thing while not wanting to. The wanting is optional. The doing isn't." },
      { title: 'Feelings are data, not instructions.', body: "You will rarely feel like it. That's not a problem to fix, it's the condition you train in. Every time you act anyway, you teach your brain that feelings don't run the schedule." },
      { title: 'Here you set non-negotiables and do the hard thing first.', body: 'Small daily standards you keep no matter what, plus hardest-first reps that win the day early. Showing up unlocks protocols like Do It Anyway, Eat the Frog, and Find Your 40%.' },
      { title: 'Set your first non-negotiable now.', body: "Small enough to keep on your worst day. That's not a compromise, that's the design.", inputPrompt: "One small thing you'll do daily, no matter what?", placeholder: 'e.g. 10 minutes of movement before I touch my phone' },
      { title: 'When today gets hard, what usually wins?', body: 'Baseline, no judgment. We train from wherever this is.', choices: ['I push through', 'I negotiate with myself', 'I fold and regret it'] },
      { title: 'Your first protocol is live: Do It Anyway.', body: "Run it the first moment you don't feel like keeping your non-negotiable. That's exactly the rep it exists for. And the non-negotiable starts today, not Monday." },
    ],
  },
  'anti-sabotage': {
    title: 'Welcome to Anti-Sabotage',
    steps: [
      { title: 'The thing that stops you has a pattern, and patterns can be caught.', body: "Self-sabotage isn't weakness and it isn't random. It's an old protection program that runs on schedule: right when things start working, right before people would notice." },
      { title: "You sabotage to stay safe, not because you're lazy.", body: 'Your brain protects the identity it knows, and progress threatens it. So it flinches: quit before the results, get busy, blow up the streak. Knowing this removes the shame. Shame is what feeds the loop.' },
      { title: 'Here you learn to see the pattern before it runs.', body: 'Reps: naming your patterns, spotting the triggers, interrupting the loop earlier each time. As you rep, you unlock protocols like Pattern Recognition, Stop Lying to Yourself, and Break the Loop.' },
      { title: 'Name your pattern once, right now.', body: 'Patterns run best in the dark. Writing it plainly moves it into the part of your mind that can choose.', inputPrompt: 'How do you usually stop yourself when things start working?', placeholder: 'e.g. Two good weeks, then I get busy and vanish' },
      { title: 'When it runs, when do you usually notice?', body: 'Catching it earlier is the whole skill. That gap is what we train here.', choices: ['As it happens', 'Days later', 'Only after the damage'] },
      { title: 'Your first protocol is unlocked: Pattern Recognition.', body: "It takes what you just named and walks the trigger, the move, and the cost. Next time the pattern starts, you'll see it coming. That changes everything about what happens next." },
    ],
  },
}
