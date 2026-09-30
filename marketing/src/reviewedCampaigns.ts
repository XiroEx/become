import type {CampaignPillar} from './campaignCollection';

export type Motif =
  | 'starting-line'
  | 'compound-reps'
  | 'bounceback-calendar'
  | 'receipt'
  | 'blueprint'
  | 'mental-reps'
  | 'mood-wave'
  | 'macro-gauge'
  | 'protein-meter'
  | 'coach-cues'
  | 'trendline'
  | 'pocket-card'
  | 'countdown'
  | 'plates'
  | 'practice-orbit'
  | 'word-morph'
  | 'week-grid'
  | 'calendar-sweep'
  | 'movement-swap';

export type ReviewedCampaign = {
  id: string;
  slug: string;
  pillar: CampaignPillar;
  motif: Motif;
  hook: string[];
  proof: string;
  cta: string;
  image: string;
  light: boolean;
  label: string;
  metric: string;
  layout: 'left' | 'center' | 'split' | 'poster';
  tempo: 'snap' | 'steady' | 'build';
};

export const reviewedCampaigns: ReviewedCampaign[] = [
  {id:'Reviewed01',slug:'01-start-smaller',pillar:'system',motif:'starting-line',hook:['START','SMALLER.'],proof:'One clear next move beats a perfect plan you never start.',cta:'Start where you are',image:'dashboard.png',light:true,label:'The first move',metric:'01',layout:'left',tempo:'steady'},
  {id:'Reviewed02',slug:'02-one-rep-becomes-a-record',pillar:'training',motif:'compound-reps',hook:['ONE REP','BECOMES','A RECORD.'],proof:'Small sessions compound when every rep has somewhere to go.',cta:'Build the streak',image:'progress.png',light:false,label:'Consistency',metric:'+1',layout:'poster',tempo:'build'},
  {id:'Reviewed03',slug:'03-tuesday-still-counts',pillar:'training',motif:'bounceback-calendar',hook:['MISSED','MONDAY?'],proof:'Tuesday still counts. The plan survives an imperfect week.',cta:'Take the next session',image:'calendar.png',light:true,label:'Keep moving',metric:'TUE',layout:'split',tempo:'snap'},
  {id:'Reviewed04',slug:'04-progress-paper-trail',pillar:'progress',motif:'receipt',hook:['PROGRESS','LEAVES A','PAPER TRAIL.'],proof:'Sets. Load. Reps. Mood. Your work leaves evidence.',cta:'Keep the receipts',image:'progress.png',light:false,label:'Proof of work',metric:'+12.5 LB',layout:'left',tempo:'steady'},
  {id:'Reviewed05',slug:'05-six-weeks-built',pillar:'training',motif:'blueprint',hook:['YOUR NEXT','6 WEEKS.'],proof:'Phases connect. Sessions progress. The next move is already there.',cta:'Open the blueprint',image:'programs.png',light:false,label:'Program design',metric:'6 WK',layout:'split',tempo:'build'},
  {id:'Reviewed06',slug:'06-motivation-isnt-the-plan',pillar:'mindset',motif:'mental-reps',hook:['MOTIVATION','ISN’T THE','PLAN.'],proof:'Train the decision that happens after motivation disappears.',cta:'Do the mental rep',image:'mindset.png',light:false,label:'Mindset practice',metric:'REPEAT',layout:'center',tempo:'steady'},
  {id:'Reviewed07',slug:'07-feeling-changes-training',pillar:'mindset',motif:'mood-wave',hook:['HOW YOU FEEL','CHANGES HOW','YOU TRAIN.'],proof:'A 60-second check-in turns a feeling into useful context.',cta:'Name the signal',image:'dashboard.png',light:true,label:'Daily state',metric:'3 / 5',layout:'poster',tempo:'steady'},
  {id:'Reviewed08',slug:'08-fuel-todays-work',pillar:'nutrition',motif:'macro-gauge',hook:['FUEL','TODAY’S','WORK.'],proof:'See the target before the day decides for you.',cta:'Set today’s targets',image:'nutrition.png',light:false,label:'Daily nutrition',metric:'2,000',layout:'split',tempo:'snap'},
  {id:'Reviewed09',slug:'09-dinner-has-a-job',pillar:'nutrition',motif:'protein-meter',hook:['42G LEFT.','DINNER HAS','A JOB.'],proof:'Know what remains while there is still time to use the number.',cta:'Finish the day clear',image:'nutrition.png',light:true,label:'Protein target',metric:'42G',layout:'left',tempo:'build'},
  {id:'Reviewed10',slug:'10-cues-on-the-lift',pillar:'coaching',motif:'coach-cues',hook:['KNOW THE','FIRST CUE.'],proof:'Coaching cues sit on the big lifts, inside the session you are doing.',cta:'Open a program',image:'programs.png',light:true,label:'Coach-built',metric:'CUES',layout:'split',tempo:'steady'},
  {id:'Reviewed11',slug:'11-zoom-out-youre-moving',pillar:'progress',motif:'trendline',hook:['ZOOM OUT.','YOU’RE','MOVING.'],proof:'One day is noise. The trend shows what your practice is doing.',cta:'See the direction',image:'progress.png',light:false,label:'Long-view progress',metric:'+8.4%',layout:'poster',tempo:'build'},
  {id:'Reviewed12',slug:'12-open-know-move',pillar:'system',motif:'pocket-card',hook:['OPEN.','KNOW.','MOVE.'],proof:'Your plan should answer the next question before you ask it.',cta:'Carry the plan',image:'dashboard.png',light:true,label:'Always with you',metric:'NEXT',layout:'center',tempo:'snap'},
  {id:'Reviewed13',slug:'13-thirty-days-no-drift',pillar:'training',motif:'countdown',hook:['30 DAYS.','NO DRIFT.'],proof:'A focused block gives every hard day the same direction.',cta:'Enter the block',image:'programs.png',light:false,label:'30-Day Shred',metric:'30',layout:'poster',tempo:'snap'},
  {id:'Reviewed14',slug:'14-add-weight-keep-form',pillar:'training',motif:'plates',hook:['ADD WEIGHT.','KEEP FORM.','REPEAT.'],proof:'Progressive overload is simple. Executing it well is the practice.',cta:'Build serious muscle',image:'programs.png',light:true,label:'Strength and size',metric:'+5',layout:'left',tempo:'build'},
  {id:'Reviewed15',slug:'15-the-practice-loop',pillar:'system',motif:'practice-orbit',hook:['TRAIN. EAT.','REFLECT.','REPEAT.'],proof:'The system works because the pieces keep talking to each other.',cta:'Build the whole practice',image:'dashboard.png',light:false,label:'Body · Mind · Routine',metric:'LOOP',layout:'center',tempo:'steady'},
  {id:'Reviewed16',slug:'16-become-is-a-verb',pillar:'system',motif:'word-morph',hook:['BECOME','IS A VERB.'],proof:'The strongest version of you is built in the doing.',cta:'Start becoming',image:'dashboard.png',light:true,label:'Identity in motion',metric:'BE →',layout:'poster',tempo:'build'},
  {id:'Reviewed17',slug:'17-four-sessions-one-direction',pillar:'training',motif:'week-grid',hook:['4 SESSIONS.','1 DIRECTION.'],proof:'Every workout has a job inside the week.',cta:'Open your week',image:'calendar.png',light:false,label:'Weekly rhythm',metric:'4 / 4',layout:'split',tempo:'steady'},
  {id:'Reviewed18',slug:'18-week-without-surprises',pillar:'training',motif:'calendar-sweep',hook:['YOUR WEEK','SHOULDN’T','SURPRISE YOU.'],proof:'Schedule the work once. Spend the week doing it.',cta:'Set the rhythm',image:'calendar.png',light:true,label:'Plan ahead',metric:'7 DAYS',layout:'left',tempo:'snap'},
  {id:'Reviewed19',slug:'19-change-move-keep-intent',pillar:'training',motif:'movement-swap',hook:['CHANGE','THE MOVE.'],proof:'Missing equipment changes the exercise, not the training intent.',cta:'Keep the session alive',image:'programs.png',light:false,label:'Smart substitutions',metric:'SWAP',layout:'split',tempo:'snap'},
];
