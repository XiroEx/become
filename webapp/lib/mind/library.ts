// Central Mind content library — the raw material the new linear experience
// draws from. Pure + client-safe (no React/DOM/server imports) so scenes, the
// composer, AND server routes can all import it, and the future AI MoveEngine
// can read/extend it. Add content here; the scenes stay generic.

// ─── Identity statements (identity + mirror scenes) ───────────────────────────

export const IDENTITY_POOL: string[] = [
  "I am someone who does the work even when I don't feel like it.",
  'I am disciplined, focused, and consistent.',
  'I am becoming stronger every single day.',
  'I am the type of person who shows up.',
  'I am in control of my choices and my outcomes.',
  'I am a high performer who protects my standards.',
  "I am building a body and mind I'm proud of.",
  'I am mentally tough.',
  'I am exactly where I need to be to become what I want.',
  'I am someone who finishes what they start.',
  "I am not driven by comfort — I'm driven by purpose.",
  'I am the hardest worker in any room I enter.',
  'I am capable of far more than I currently believe.',
  'I am growing through every challenge placed in front of me.',
  "I am not defined by how I feel — I'm defined by what I do.",
  'I keep the promises I make to myself.',
  'I do hard things on purpose.',
  'I am calm under pressure.',
  'I choose discipline over regret.',
  'I am the kind of person my future self thanks.',
  'I move first and let motivation catch up.',
  'I am patient with progress and relentless with effort.',
  'I own my mornings.',
  'I respond instead of react.',
  'I am proof that consistency beats intensity.',
  'I protect my focus like my most valuable asset.',
  'I bet on myself.',
  'I stay steady when things get hard.',
  'I turn setbacks into setups.',
  "I'm building something most people won't.",
  "I don't negotiate with my excuses.",
  'I am present, on purpose, right now.',
  'I lead myself before I expect to lead anyone else.',
  'I am the standard, not the exception.',
  "I finish what I start, even when no one's watching.",
  'I am grateful and hungry at the same time.',
  'I choose growth over comfort, every time.',
  'I am someone who keeps going.',
  'I trust the work and let go of the outcome.',
  'I am becoming who I was meant to be.',
  // Method-driven (self-image / future-self / act-as-if / capacity / detachment)
  'I act as the person I’m becoming — the feeling follows the action.',
  'I’ve already become him in my mind; now my body catches up.',
  'When I think I’m done, I know I’m only at forty percent.',
  'I lower the stakes and raise the effort — calm attracts what force repels.',
  'I don’t feed the drama; I step back and watch it pass.',
  'My self-image is mine to rewrite — and I’m writing a stronger one.',
  'I hold the aim and release the grip.',
  'I rehearse my best self until it runs on autopilot.',
  'I keep a record of every hard thing I’ve survived, and I draw from it.',
  'A setback is a scar, not a sentence — it happened to me, it isn’t me.',
  'I do the hardest thing first and let it carry the day.',
  'I pour my whole self into the one thing that makes the rest easier.',
  'I am calm, certain, and already on my way.',
  'I callous my mind with every rep I didn’t feel like doing.',
  'I become it first, then I have it.',
]

// ─── Win / reflection prompts (win scene) ─────────────────────────────────────

export const WIN_PROMPTS: string[] = [
  "What's one win from today — big or small?",
  'What did you do today that your past self would be proud of?',
  "Where did you show up when it would've been easier not to?",
  'What did you handle better today than you used to?',
  'Name a moment today you chose discipline over comfort.',
  'What did you finish today?',
  'Who did you help, or what did you give today?',
  'What small step did you take toward your goal?',
  "Where did you stay calm when you could've spiraled?",
  'What did you learn about yourself today?',
  'What did you say no to that protected your standards?',
  "What did you do today that's worth repeating?",
  // Evidence-building (the "cookie jar" — bank proof you can draw on later)
  'What hard thing did you survive or push through today? Add it to the jar.',
  'What did you do today that your future self will draw strength from?',
  'What evidence did you create today that the new you is real?',
  'When did you keep going past the point you wanted to stop?',
]

// ─── Session intros ───────────────────────────────────────────────────────────

export const INTROS: { title: string; subtitle: string }[] = [
  { title: 'Reset', subtitle: 'A few focused minutes. One move at a time.' },
  { title: "Let's lock in", subtitle: 'Clear the noise. Become who you said you would.' },
  { title: 'Show up', subtitle: 'The work is small. The compounding is not.' },
  { title: 'Take the rep', subtitle: "Nobody's watching. Do it anyway." },
  { title: 'Drop in', subtitle: 'Come home to yourself. Two minutes is enough.' },
  { title: 'Sharpen up', subtitle: 'Small inputs. Big becoming.' },
  { title: 'One honest session', subtitle: 'Meet yourself where you are.' },
  { title: 'Close the gap', subtitle: "Between who you are and who you're becoming." },
]

// ─── Multiple-choice reflections (choice scene) ───────────────────────────────

export const CHOICE_POOL: { q: string; options: { label: string; response: string }[] }[] = [
  {
    q: "What's actually pulling you off course right now?",
    options: [
      { label: 'Comfort', response: "Comfort is the enemy of who you're becoming. Choose the harder right." },
      { label: 'Fear', response: 'Fear means it matters. Move toward it — one small step, now.' },
      { label: 'Other people', response: "Their noise isn't your mission. Get back in your lane." },
      { label: 'No clear plan', response: 'Clarity comes from action. Pick the one next move.' },
    ],
  },
  {
    q: 'Finishing today strong takes what, exactly?',
    options: [
      { label: 'Starting now', response: 'Then start. Momentum is built, not found.' },
      { label: 'Saying no', response: 'Protect the standard. No is a complete sentence.' },
      { label: 'Asking for help', response: 'Strength asks. Reach out today.' },
      { label: 'Just showing up', response: "Showing up is the whole game. You're here." },
    ],
  },
  {
    q: 'Which version of you shows up in the next hour?',
    options: [
      { label: 'The one who follows through', response: 'Good. Let the action prove it.' },
      { label: 'The one who makes excuses', response: 'Name it — then do the opposite.' },
      { label: 'Not sure yet', response: 'You decide. Choose on purpose.' },
    ],
  },
  {
    q: 'When you picture yourself a year from now, what changed?',
    options: [
      { label: 'My habits', response: 'Habits are votes for who you become. Cast one today.' },
      { label: 'My mindset', response: 'Mindset shifts in reps, not insights. This is a rep.' },
      { label: 'My circle', response: 'You become your inputs. Choose them on purpose.' },
      { label: 'My discipline', response: 'Discipline is a muscle. Load it daily.' },
    ],
  },
  {
    q: "What would you do right now if you weren't afraid?",
    options: [
      { label: 'Start the hard thing', response: 'The fear shrinks the moment you move. Go.' },
      { label: 'Have the conversation', response: 'Say the thing. The cost of avoiding it is higher.' },
      { label: 'Bet on myself', response: 'Someone has to. Make it you.' },
    ],
  },
  {
    q: 'What does your best self need from you today?',
    options: [
      { label: 'Effort', response: 'Effort is the one thing fully in your control. Spend it.' },
      { label: 'Patience', response: 'Trust the slope. Compounding is quiet, then loud.' },
      { label: 'Honesty', response: 'Tell yourself the truth. Then act on it.' },
      { label: 'Rest', response: 'Recovery is part of the work, not a break from it.' },
    ],
  },
  {
    q: "What's the story you keep telling yourself that holds you back?",
    options: [
      { label: '“I\'m not ready.”', response: 'Readiness is a myth. You get ready by starting.' },
      { label: '“I always quit.”', response: "Past tense. Today you're someone who keeps going." },
      { label: '“It\'s too late.”', response: 'The best time was then. The second best is now.' },
      { label: '“I\'m not the type.”', response: 'You become the type by acting like it once. Now.' },
    ],
  },
  {
    q: 'How do you want to feel walking out of today?',
    options: [
      { label: 'Proud', response: 'Then do one thing today you can be proud of.' },
      { label: 'Calm', response: 'Calm is built by what you control. Control the next move.' },
      { label: 'Spent in a good way', response: 'Empty the tank on what matters. Hold nothing back.' },
    ],
  },
  {
    q: 'Where are you negotiating with yourself right now?',
    options: [
      { label: 'My workout', response: 'Do it anyway. Especially when you don\'t feel like it.' },
      { label: 'My focus', response: 'Close the tabs. One thing, fully, for 25 minutes.' },
      { label: 'My standards', response: 'Standards you defend become identity. Defend this one.' },
    ],
  },
  {
    q: "What's one thing within your control right now?",
    options: [
      { label: 'My next action', response: 'Then take it. Small and now beats big and someday.' },
      { label: 'My attitude', response: 'Reframe it. You can choose the meaning you give this.' },
      { label: 'My effort', response: 'Pour it in. Outcomes follow inputs you can repeat.' },
    ],
  },
  {
    q: 'What kind of hard are you avoiding?',
    options: [
      { label: 'The boring kind', response: 'Boring + consistent is how it actually gets built.' },
      { label: 'The scary kind', response: 'On the other side of that fear is the version you want.' },
      { label: 'The honest kind', response: 'Face the truth you keep dodging. Then move.' },
    ],
  },
  {
    q: "When you imagine quitting today, what's the real reason?",
    options: [
      { label: 'Tired', response: "Tired is a feeling, not an instruction. One small rep." },
      { label: 'Discouraged', response: 'Progress hides in the boring middle. Keep stacking.' },
      { label: 'Distracted', response: 'Name the one thing that matters. Do only that.' },
      { label: "Honestly, comfort", response: 'Comfort now, regret later. Choose the harder right.' },
    ],
  },
  {
    q: 'What would make today a win no matter what else happens?',
    options: [
      { label: 'Keeping one promise', response: 'Pick it. Then keep it. That\'s the whole game.' },
      { label: 'Moving my body', response: 'Move and the mind follows. Go get it.' },
      { label: 'Being present for someone', response: 'Presence is a gift. Give it fully once today.' },
    ],
  },
  {
    q: "What's the smallest step you could take in the next 5 minutes?",
    options: [
      { label: 'Open the doc / app', response: 'Starting is the win. Open it now.' },
      { label: 'Put my shoes on', response: 'Action lowers the bar. Lace up.' },
      { label: 'Write one line', response: 'One line beats a blank page. Write it.' },
    ],
  },
  {
    q: 'Who are you doing this for?',
    options: [
      { label: 'My future self', response: "They're counting on the choices you make today." },
      { label: 'The people I love', response: 'Become the person they can lean on. Start here.' },
      { label: 'Me — and that\'s enough', response: 'It is. You\'re worth the effort. Prove it once.' },
    ],
  },
  {
    q: "What's the standard you refuse to drop below?",
    options: [
      { label: 'I always finish', response: 'Then finish today\'s rep. No matter how small.' },
      { label: 'I tell the truth', response: 'Start with the truth you owe yourself.' },
      { label: 'I show up daily', response: "You're showing up right now. Keep the streak alive." },
    ],
  },
  // Perspective-shift reflections (detachment / capacity / future-self rehearsal)
  {
    q: 'How tightly are you gripping the outcome right now?',
    options: [
      { label: 'Too tight', response: 'Loosen the grip. Hold the aim, release the desperation — calm attracts what force repels.' },
      { label: 'About right', response: 'Good. Steady hands, steady aim. Take the next step.' },
      { label: 'Not committed enough', response: 'Then decide it’s yours, and move like it already is.' },
    ],
  },
  {
    q: 'You feel out of gas. Where are you really?',
    options: [
      { label: 'Around 40%', response: 'Exactly. The tank has more than the feeling says. One more checkpoint.' },
      { label: 'Genuinely empty', response: 'Then rest on purpose — recovery is part of the work, not a break from it.' },
      { label: "I haven't started", response: 'Starting is the hard part. Two minutes. Go.' },
    ],
  },
  {
    q: 'Who are you rehearsing being today?',
    options: [
      { label: 'My future self', response: 'Then move, speak, and choose like them now — the body believes the rehearsal.' },
      { label: 'My old self', response: 'Catch it. Make one choice your future self would make. Now.' },
      { label: "Haven't decided", response: 'Decide. You install an identity by acting it out once.' },
    ],
  },
  {
    q: 'What story about yourself are you ready to retire?',
    options: [
      { label: 'That I can’t change', response: 'You rewrite the self-image by acting against it once. This is the rep.' },
      { label: 'That I always fail', response: 'A scar isn’t a sentence. The next attempt doesn’t know your past.' },
      { label: 'That it’s too late', response: 'The clock only moves forward. The best move is the next one.' },
    ],
  },
]

// ─── Sabotage patterns (anti-sabotage / pattern scene) ────────────────────────

export const SABOTAGE_PATTERNS: { pattern: string; override: string }[] = [
  { pattern: 'All-or-nothing thinking', override: 'Progress is not linear. One miss changes nothing unless you let it.' },
  { pattern: 'Waiting to feel ready', override: 'Do it now. Even 10%. The feeling comes after you start.' },
  { pattern: 'Perfectionism as avoidance', override: 'A mediocre plan executed beats a perfect plan in your notes app.' },
  { pattern: 'Comparing your start to their finish', override: 'Your only competition is who you were yesterday.' },
  { pattern: 'Comfort over growth', override: "The moment you're about to take the easy path is exactly where the growth is." },
  { pattern: 'Catastrophizing one setback', override: 'One bad rep is data, not a verdict. Reset and run the next one.' },
  { pattern: 'Numbing out (scroll / snack / zone out)', override: 'Name the feeling you\'re avoiding. Then do the small hard thing instead.' },
  { pattern: 'Over-planning, under-doing', override: 'Preparation can be procrastination in disguise. Ship the imperfect version.' },
  { pattern: 'Outsourcing your mood to other people', override: 'Their behavior is theirs. Your response is yours. Take it back.' },
  { pattern: 'Quitting right before the breakthrough', override: 'The dip is the filter. Most quit here — that\'s exactly why you don\'t.' },
  { pattern: 'Negative self-talk on autopilot', override: 'You wouldn\'t talk to a friend like that. Coach yourself instead.' },
  { pattern: '“I\'ll start Monday” thinking', override: 'There is no perfect start date. The next rep is available right now.' },
  // Method-driven pattern interrupts (detachment / desperation / self-image / fear)
  { pattern: 'Feeding the drama until it runs your whole day', override: 'Step out of the scene and watch it like a movie. It only has the power you keep feeding it.' },
  { pattern: 'Wanting it so badly you choke', override: 'Lower the stakes. Hold the aim, release the grip — calm hands hit the target.' },
  { pattern: 'Treating one failure as your identity', override: 'A scar isn’t a sentence. It happened to you; it isn’t you. Run the next rep.' },
  { pattern: 'Self-sabotage right as it starts working', override: 'Sabotage is fear in disguise. Name what you’re protecting yourself from — then go anyway.' },
  { pattern: 'Believing the fatigue signal at 40%', override: 'When you think you’re done, you’ve got 60% left. Push to one more checkpoint.' },
]

// ─── Accountability actions (social scene) ────────────────────────────────────

export const ACCOUNTABILITY_ACTIONS: string[] = [
  'Text someone your plan for today — before you have the option not to.',
  "Tell one person about a goal you've been keeping to yourself.",
  'Find one person who has what you want. Ask them one specific question this week.',
  'Schedule a check-in with someone who will ask the hard question about your progress.',
  'Be honest with someone about where you actually are — not where you want to appear to be.',
  'Reach out to someone you admire. One genuine message. No agenda.',
  'Ask a friend to hold you to one commitment this week.',
  'Reconnect with someone who pushes you to be better.',
  'Send a thank-you to someone who helped you become who you are.',
  'Share today\'s win with one person who\'ll celebrate it with you.',
  'Have the conversation you\'ve been avoiding. Say the thing kindly and clearly.',
  'Cut the time you spend with one person who drains your standards.',
  'Offer to help someone with the exact thing you\'re working on. Teaching cements it.',
  'Make one plan with someone that gets you out of the house this week.',
  // Connection-driven (genuine interest beats self-promotion)
  'Make one person feel genuinely important today — specific and sincere, not flattery.',
  'Ask someone about their goals and actually listen — no waiting for your turn to talk.',
  'Use someone’s name and give them your full attention in your next conversation.',
  'Lead with appreciation: tell someone exactly what you respect about them.',
]

// ─── Daily discipline challenges (discipline scene / api) ─────────────────────

export const DISCIPLINE_CHALLENGES: string[] = [
  'No complaining — not once — for the next 24 hours.',
  'No social media before 10am. Protect your first hours.',
  'Cold shower. End on cold. No negotiating.',
  'Write 5 minutes of uncensored thoughts immediately after waking.',
  'Zero processed food or alcohol today. Whole foods only.',
  "Reach out to someone you've been putting off. Text, call, or meet.",
  'Wake up 45 minutes earlier than usual. Use the time intentionally.',
  '100 push-ups before you leave the house. Any rep scheme.',
  'No phone for the first 60 minutes of your day.',
  'Sit in silence for 10 minutes. No music, no podcast, no distraction.',
  "Write down 10 things you're grateful for — specific, not generic.",
  'Prepare all your meals for tomorrow before you go to sleep.',
  'Be in bed with lights off by 10:30pm. Sleep is the weapon.',
  'Do something today that makes you slightly uncomfortable.',
  'Drink 3 liters of water. Track it.',
  'Write your mission statement from memory. Then read it twice.',
  'No complaining, no excuses. Own everything that happens today.',
  'Make your bed the moment you get up. Start with a win.',
  'Go for a 30-minute walk outside. No phone, no music.',
  'Identify your one most important task today and do it first.',
  'Send a genuine thank-you to someone who has helped you.',
  'Read for 30 minutes — a real book, not an article.',
  'Track every calorie you eat today. Awareness is the first step.',
  'Cut out caffeine after noon. Test your energy management.',
  "Write down three fears you've been avoiding. Expose them.",
  "Do your workout even if you don't feel like it. Especially then.",
  "Have one difficult conversation you've been avoiding.",
  'Log off social media entirely until tomorrow morning.',
  'Spend 10 minutes visualizing your ideal day in detail.',
  "Say no to something that doesn't align with your goals.",
  'Eat your hardest, healthiest meal first. No dessert today.',
  'Do 50 bodyweight squats spread through the day.',
  'Tidy one space completely — desk, car, or room. Done, not started.',
  'No music or podcasts on your commute. Just think.',
  'Plan tomorrow on paper before bed: top 3 tasks.',
  'Hold a 2-minute plank. Break it up if you must.',
  'Compliment three people genuinely and specifically.',
  'Delete one app that steals your time. At least for today.',
  'Take the stairs every time today. No exceptions.',
  'Finish the task you most want to avoid — first thing.',
  'Stretch for 10 minutes before bed. Phone in another room.',
  'Write a letter to your future self, one year out.',
  'Eat slowly today — no screens at any meal.',
  'Do one act of service expecting nothing back.',
  'Go 24 hours without numbing — no scroll, no snack-to-cope.',
  'Walk 10,000 steps. Find the gaps in your day.',
  "Say what you actually mean today — no softening, no people-pleasing.",
  'Spend 20 minutes learning something hard. Sit in the confusion.',
  'No buying anything non-essential today. Notice the urge.',
  'Wake without snoozing. Feet on the floor at the first alarm.',
  'Do the 5-second rule once: count 5-4-3-2-1 and move on something you\'re dreading.',
  'Put your phone on grayscale for the whole day.',
  'Journal one page tonight: what went well, what you\'ll fix.',
  'Give your full attention to one person for an entire conversation.',
  'Train fasted or train at the hardest time of your day.',
  'Audit your last 24 hours of screen time. Sit with the number.',
  'End every meal slightly hungry today. Stop at 80%.',
  'Do something kind anonymously today.',
  'Pick your single most important goal and take one bold step toward it.',
  'Reflect for 5 minutes: who do you want to be tomorrow?',
  // Method-driven challenges
  'When you want to quit today, find your 40% — do one more rep past it.',
  'Stand at the mirror and say out loud the one thing you’re avoiding. Then go do it.',
  'List 3 hard things you’ve already survived. Read them, then attack today.',
  'Eat the frog: your ugliest task gets done before anything else touches your day.',
  'Pick the ONE thing that makes everything else easier — do only that, first.',
  'Spend 10 minutes rehearsing tomorrow as your future self, in vivid detail.',
  'Catch yourself making it life-or-death. Say “this is not life or death,” then act calm.',
  'Ask “why does this goal matter” three times — until you hit the answer that moves you.',
  'Name one excuse out loud, then ask: is it true, or just discomfort talking?',
  'Choose your hardest training time today on purpose. Show up there.',
]

// ─── Compose templates (the "Fill it in" modality) ────────────────────────────
// A mostly-written affirmation with {0},{1}… blanks; each blank has a few POSITIVE
// word choices. There are no wrong answers — every option finishes a true,
// empowering sentence; the pick just makes it yours. Replaces the word-scramble.
export interface ComposeTemplate {
  template: string // e.g. "I show up {0}, even when {1}."
  blanks: string[][] // options for {0}, {1}, …
}

export const COMPOSE_TEMPLATES: ComposeTemplate[] = [
  {
    template: 'I show up {0}, even when {1}.',
    blanks: [
      ['with intention', 'ready to work', 'fully present', 'like it matters'],
      ["it's hard", "I'm tired", "no one's watching", "I don't feel like it"],
    ],
  },
  {
    template: 'Today, I lead with {0}.',
    blanks: [['discipline', 'courage', 'focus', 'gratitude', 'calm']],
  },
  {
    template: 'I am becoming someone who {0}.',
    blanks: [
      ['finishes what they start', 'keeps promises to themselves', 'does the hard thing', 'shows up daily'],
    ],
  },
  {
    template: 'When it gets tough, I {0}.',
    blanks: [['dig in', 'breathe and push', 'remember my why', 'stay steady']],
  },
  {
    template: 'My body is {0} and my mind is {1}.',
    blanks: [
      ['strong', 'capable', 'resilient', 'getting better'],
      ['focused', 'steady', 'clear', 'unshakeable'],
    ],
  },
  {
    template: 'I choose {0} over {1}.',
    blanks: [
      ['effort', 'discipline', 'growth', 'courage'],
      ['comfort', 'excuses', 'doubt', 'the easy way'],
    ],
  },
  {
    template: 'Right now, I bring {0} to everything I do.',
    blanks: [['energy', 'focus', 'heart', 'intensity', 'calm']],
  },
  {
    template: 'I do hard things {0}.',
    blanks: [['on purpose', 'because they grow me', 'without flinching', "and I'm proud of it"]],
  },
  {
    template: "I'm the kind of person who {0}.",
    blanks: [['never quits', 'stays consistent', 'leads by example', 'earns it daily']],
  },
  {
    template: "This season, I'm building {0}.",
    blanks: [['unbreakable habits', 'real strength', 'quiet confidence', 'momentum']],
  },
  {
    template: 'I forgive the slip and {0}.',
    blanks: [['start again', 'keep going', 'reset now', 'move forward']],
  },
  {
    template: 'I am {0}, I am {1}.',
    blanks: [
      ['disciplined', 'focused', 'relentless', 'grounded'],
      ['consistent', 'unshaken', 'capable', 'ready'],
    ],
  },
  {
    template: 'I’ve already become the person who {0}.',
    blanks: [['does the work', 'stays calm under pressure', 'finishes', 'keeps their word']],
  },
  {
    template: 'This isn’t life or death — I {0}.',
    blanks: [['stay calm and move', 'lower the stakes', 'act with steady hands', 'take the next step']],
  },
]

// ─── Non-affirm registers ─────────────────────────────────────────────────────
// Pure positivity is limiting (forced affirmation backfires when you don't believe
// it). These give the Mind rotation other voices — especially for off days:
// ACKNOWLEDGE (validate + self-compassion, don't deny), INTERROGATIVE (ask, don't
// declare — Senay-style "Will you?"), and CONTRAST content (vision + obstacle).

// Choice-shaped (q + options{label, response}) so they reuse the Choice scene.
export const ACKNOWLEDGE_POOL: { q: string; options: { label: string; response: string }[] }[] = [
  {
    q: "What's actually here right now?",
    options: [
      { label: "I'm tired", response: 'Tired is real, not weakness. Lower the bar, do the next small thing.' },
      { label: "I'm anxious", response: 'Anxiety is energy without a target. Name one thing you can control.' },
      { label: "I'm frustrated", response: 'Frustration means you care. Let it sharpen you, not stop you.' },
      { label: "I'm flat", response: 'Flat days count too. Show up small — that keeps the identity alive.' },
    ],
  },
  {
    q: 'Rough moment. How do you want to meet it?',
    options: [
      { label: 'With patience', response: 'Patience with yourself is still discipline.' },
      { label: 'With honesty', response: 'You just named it. That was the hard part.' },
      { label: 'With one small step', response: 'One small step beats a perfect plan. Take it.' },
    ],
  },
  {
    q: 'You slipped. What now?',
    options: [
      { label: 'Forgive and reset', response: 'One miss is data, not identity. Begin again now.' },
      { label: 'Learn from it', response: 'What was the trigger? Name it — that’s how it loses power.' },
      { label: 'Just keep going', response: 'Streaks survive misses. The comeback is the rep.' },
    ],
  },
  {
    q: 'Be honest — how heavy is today?',
    options: [
      { label: 'Heavy', response: 'Then today’s win is just showing up. That’s enough.' },
      { label: 'Manageable', response: 'Good. Use the steadiness — do one thing that future-you thanks you for.' },
      { label: 'Light', response: 'Ride it. Bank a little extra while it’s easy.' },
    ],
  },
  {
    q: 'That failure is loud right now. What is it, really?',
    options: [
      { label: 'Proof I’m not enough', response: 'No — it’s a scar, not a sentence. It happened to you; it isn’t you.' },
      { label: 'A lesson', response: 'Then take the lesson and set down the weight.' },
      { label: 'Just heavy', response: 'You can carry the lesson without the shame. Put the shame down.' },
    ],
  },
]

export const INTERROGATIVE_POOL: { q: string; options: { label: string; response: string }[] }[] = [
  {
    q: 'Will you keep one promise to yourself today?',
    options: [
      { label: 'Yes', response: 'Then it’s already different. Name the promise and go.' },
      { label: "I'll try", response: "Trade 'try' for 'one'. One promise, kept. That’s the whole game." },
      { label: 'Not sure', response: 'Start smaller than feels worth it. Certainty follows action.' },
    ],
  },
  {
    q: 'How will you show up when it gets hard today?',
    options: [
      { label: 'I dig in', response: 'Decide it now — before the moment tests you.' },
      { label: 'I pause, then push', response: 'A breath, then a step. That’s a plan.' },
      { label: 'I ask for help', response: 'Reaching out is strength. Who will you tell?' },
    ],
  },
  {
    q: 'What kind of person will today’s choices build?',
    options: [
      { label: 'A consistent one', response: 'Then let one boring, repeatable action prove it.' },
      { label: 'A disciplined one', response: 'Discipline is just promises kept. Keep one.' },
      { label: 'A resilient one', response: 'Resilience is built on resets. Reset well today.' },
    ],
  },
  {
    q: 'Look in the mirror — do your actions match your talk today?',
    options: [
      { label: 'Yes', response: 'Then keep the receipts. Do one more thing that proves it.' },
      { label: 'Not yet', response: 'Name the gap out loud. Then close it with one action.' },
      { label: 'I’m avoiding the mirror', response: 'Look anyway. The truth is where the change starts.' },
    ],
  },
]

// Mental contrasting (WOOP-lite) — used by the Contrast scene directly.
export const CONTRAST_OBSTACLES: string[] = [
  'Low energy / tiredness',
  'Getting distracted',
  'Putting it off',
  'Stress or overwhelm',
  'Other people / interruptions',
  'Not feeling like it',
  'Old habit pulling me back',
]

export const CONTRAST_PLANS: string[] = [
  'I’ll do just the first 2 minutes.',
  'I’ll remove the distraction before I start.',
  'I’ll do it before anything else.',
  'I’ll take one breath and begin anyway.',
  'I’ll tell someone I’m doing it.',
  'I’ll act first; motivation can catch up.',
  'I’ll notice the pull and choose different.',
]
