import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {CampaignPillar} from './campaignCollection';
import type {ReviewedCampaign} from './reviewedCampaigns';

export type ReviewedVideoProps = {
  campaign: ReviewedCampaign;
  frameOverride?: number;
};

const colors: Record<CampaignPillar, string> = {
  system: '#F6F4EE',
  training: '#00D26A',
  mindset: '#A55CFF',
  nutrition: '#FF9B28',
  progress: '#4D8DFF',
  coaching: '#FF5578',
};

const ink = '#08080A';
const chalk = '#F6F4EE';
const mutedDark = '#A7A6AD';
const mutedLight = '#5B5B63';
const display = 'Ubuntu Sans, DejaVu Sans, sans-serif';
const body = 'Carlito, Liberation Sans, sans-serif';
const mono = 'Ubuntu Mono, Liberation Mono, monospace';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const enterAt = (frame: number, start: number, fps: number, stiffness = 120) =>
  spring({frame: frame - start, fps, config: {damping: 18, stiffness, mass: 0.72}});

const Base: React.FC<{campaign: ReviewedCampaign; frame: number; accent: string}> = ({
  campaign,
  frame,
  accent,
}) => {
  const foreground = campaign.light ? ink : chalk;
  const line = campaign.light ? 'rgba(8,8,10,.09)' : 'rgba(246,244,238,.09)';
  const drift = (frame * (campaign.tempo === 'snap' ? 0.9 : campaign.tempo === 'build' ? 0.48 : 0.65)) % 96;
  return (
    <AbsoluteFill style={{background: campaign.light ? '#ECEBE6' : ink, color: foreground}}>
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(' + line + ' 1px, transparent 1px), linear-gradient(90deg, ' + line + ' 1px, transparent 1px)',
          backgroundSize: '96px 96px',
          transform: 'translateY(' + drift + 'px)',
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 820,
          height: 820,
          borderRadius: '50%',
          background: accent,
          filter: 'blur(150px)',
          opacity: campaign.light ? 0.1 : 0.14,
          right: -430,
          top: 290 + Math.sin(frame / 35) * 45,
        }}
      />
    </AbsoluteFill>
  );
};

const Wordmark: React.FC<{light: boolean; label: string}> = ({light, label}) => (
  <div
    style={{
      position: 'absolute',
      left: 56,
      right: 56,
      top: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      color: light ? ink : chalk,
      zIndex: 40,
    }}
  >
    <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
      <Img src={staticFile('logo.png')} style={{width: 58, height: 58, borderRadius: 13}} />
      <div style={{fontFamily: display, fontWeight: 900, fontSize: 28, letterSpacing: -1}}>BECOME</div>
    </div>
    <div
      style={{
        fontFamily: mono,
        fontWeight: 700,
        fontSize: 18,
        letterSpacing: 2.5,
        textTransform: 'uppercase',
        opacity: 0.58,
      }}
    >
      {label}
    </div>
  </div>
);

const openingMarks: Record<ReviewedCampaign['motif'], {mark: string; detail: string; rotate?: number}> = {
  'starting-line': {mark: '● ━━━━━', detail: 'START / 00:00'},
  'compound-reps': {mark: 'I  II  III  IIII', detail: 'REPS BECOME EVIDENCE'},
  'bounceback-calendar': {mark: 'MON ×  TUE →', detail: 'MISS / MOVE / CONTINUE', rotate: -3},
  receipt: {mark: 'TOTAL····+12.5', detail: 'PROGRESS RECEIPT  /  KEEP THIS'},
  blueprint: {mark: '○────○────○', detail: 'WEEK 01 / 03 / 06', rotate: -2},
  'mental-reps': {mark: '○  ○  ●', detail: 'DECISION > FEELING'},
  'mood-wave': {mark: '●╱●╲●╱●', detail: 'BODY SIGNAL / READ IT'},
  'macro-gauge': {mark: 'P  C  F', detail: 'FUEL MIX / TODAY'},
  'protein-meter': {mark: '██████░░', detail: '42G REMAINING'},
  'coach-cues': {mark: '01 · 02 · 03', detail: 'CUES ON THE LIFT'},
  trendline: {mark: '▁▂▃▅▆↗', detail: '8 WEEK VIEW'},
  'pocket-card': {mark: '▰', detail: 'TODAY / ONE CARD'},
  countdown: {mark: '30', detail: 'DAYS / START NOW', rotate: 4},
  plates: {mark: '◉━━━◉', detail: '+ 5 LB / SAME FORM'},
  'practice-orbit': {mark: 'TRAIN ↻', detail: 'EAT / REFLECT / REPEAT'},
  'word-morph': {mark: 'BE → BECOME', detail: 'NOUN / VERB'},
  'week-grid': {mark: '■ □ ■ □ ■ ■ □', detail: '4 / 7 SESSIONS'},
  'calendar-sweep': {mark: '06:30 ━ 21:00', detail: 'WEEK / LOCKED'},
  'movement-swap': {mark: 'ROW ⇄ ROW', detail: 'SAME INTENT / NEW MOVE'},
};

const HookSignature: React.FC<{campaign: ReviewedCampaign; frame: number; accent: string}> = ({
  campaign,
  frame,
  accent,
}) => {
  const {fps} = useVideoConfig();
  const reveal = enterAt(frame, 12, fps, 92);
  const signature = openingMarks[campaign.motif];
  const isBig = campaign.motif === 'countdown' || campaign.motif === 'pocket-card';
  return (
    <div
      style={{
        position: 'absolute',
        left: campaign.layout === 'poster' ? 94 : 58,
        right: campaign.layout === 'poster' ? 94 : 58,
        top: 1040,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: campaign.layout === 'poster' ? 'center' : 'space-between',
        gap: 34,
        opacity: reveal,
        transform:
          'translateY(' + interpolate(reveal, [0, 1], [48, 0]) + 'px) rotate(' + (signature.rotate ?? 0) + 'deg)',
      }}
    >
      <div
        style={{
          color: accent,
          fontFamily: mono,
          fontSize: isBig ? 210 : campaign.motif === 'word-morph' ? 72 : 92,
          fontWeight: 800,
          letterSpacing: -5,
          lineHeight: 0.82,
          whiteSpace: 'nowrap',
        }}
      >
        {signature.mark}
      </div>
      <div
        style={{
          color: campaign.light ? ink : chalk,
          fontFamily: mono,
          fontSize: 23,
          fontWeight: 700,
          letterSpacing: 2.5,
          lineHeight: 1.25,
          opacity: 0.7,
          textAlign: 'right',
          maxWidth: 290,
          paddingBottom: 8,
        }}
      >
        {signature.detail}
      </div>
    </div>
  );
};

const Hook: React.FC<{campaign: ReviewedCampaign; frame: number; accent: string}> = ({
  campaign,
  frame,
  accent,
}) => {
  const {fps} = useVideoConfig();
  const foreground = campaign.light ? ink : chalk;
  const inValue = enterAt(frame, 2, fps, campaign.tempo === 'snap' ? 165 : 112);
  const opacity = interpolate(frame, [56, 78], [1, 0], clamp);
  const longest = Math.max(...campaign.hook.map((line) => line.length));
  const maxSize = campaign.layout === 'poster' ? 158 : campaign.layout === 'center' ? 138 : 146;
  const fontSize = Math.min(maxSize, Math.floor(910 / Math.max(longest * 0.49, 4.5)));
  const centered = campaign.layout === 'center' || campaign.layout === 'poster';
  const top = campaign.layout === 'poster' ? 280 : campaign.layout === 'split' ? 245 : 315;
  return (
    <AbsoluteFill
      style={{
        color: foreground,
        opacity,
        transform: 'translateY(' + interpolate(inValue, [0, 1], [110, 0]) + 'px)',
      }}
    >
      <div style={{position: 'absolute', left: 58, right: 58, top, textAlign: centered ? 'center' : 'left'}}>
        <div
          style={{
            fontFamily: mono,
            color: accent,
            fontSize: 23,
            fontWeight: 800,
            letterSpacing: 4.5,
            textTransform: 'uppercase',
            marginBottom: 34,
          }}
        >
          {campaign.label}
        </div>
        <div
          style={{
            fontFamily: display,
            fontSize,
            lineHeight: 0.87,
            fontWeight: 950,
            letterSpacing: -fontSize * 0.068,
            textTransform: 'uppercase',
          }}
        >
          {campaign.hook.map((line, index) => (
            <div
              key={line}
              style={{
                paddingBottom: fontSize * 0.035,
                transform:
                  'translateX(' +
                  interpolate(inValue, [0, 1], [(index % 2 ? 1 : -1) * (campaign.layout === 'poster' ? 150 : 70), 0]) +
                  'px)',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: centered ? 265 : 58,
          bottom: 126,
          width: interpolate(inValue, [0, 1], [0, centered ? 550 : 790]),
          height: 10,
          background: accent,
          borderRadius: 99,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 50,
          bottom: 48,
          fontFamily: mono,
          fontSize: 122,
          fontWeight: 800,
          opacity: 0.08,
        }}
      >
        {campaign.metric}
      </div>
      <HookSignature campaign={campaign} frame={frame} accent={accent} />
    </AbsoluteFill>
  );
};

const Screen: React.FC<{
  campaign: ReviewedCampaign;
  frame: number;
  accent: string;
  style?: React.CSSProperties;
  crop?: number;
}> = ({campaign, frame, accent, style, crop = 690}) => {
  const {fps} = useVideoConfig();
  const comeIn = enterAt(frame, 64, fps, 105);
  return (
    <div
      style={{
        position: 'absolute',
        width: 620,
        height: crop,
        borderRadius: 42,
        border: '3px solid ' + accent,
        background: '#121215',
        overflow: 'hidden',
        boxShadow: '0 38px 110px rgba(0,0,0,.35)',
        opacity: comeIn,
        transform:
          'translateY(' + interpolate(comeIn, [0, 1], [180, 0]) + 'px) scale(' + interpolate(comeIn, [0, 1], [0.9, 1]) + ')',
        ...style,
      }}
    >
      <Img src={staticFile(campaign.image)} style={{display: 'block', width: '100%'}} />
    </div>
  );
};

const Ring: React.FC<{size: number; color: string; progress: number; width?: number}> = ({
  size,
  color,
  progress,
  width = 20,
}) => {
  const radius = size / 2 - width;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(128,128,128,.2)" strokeWidth={width} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
      />
    </svg>
  );
};

const Instrument: React.FC<{campaign: ReviewedCampaign; frame: number; accent: string}> = ({
  campaign,
  frame,
  accent,
}) => {
  const {fps} = useVideoConfig();
  const t = enterAt(frame, 64, fps, campaign.tempo === 'snap' ? 150 : 105);
  const foreground = campaign.light ? ink : chalk;
  const soft = campaign.light ? 'rgba(8,8,10,.13)' : 'rgba(246,244,238,.17)';
  const card = campaign.light ? 'rgba(255,255,255,.88)' : 'rgba(25,25,29,.95)';
  const holdDrift = Math.sin((frame + campaign.motif.length * 7) / 22);
  const common: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    color: foreground,
    transform: 'translateY(' + holdDrift * 4 + 'px) scale(' + (1 + holdDrift * 0.0015) + ')',
    transformOrigin: '50% 54%',
  };

  if (campaign.motif === 'starting-line') {
    return (
      <div style={common}>
        {[0, 1, 2, 3, 4].map((lane) => (
          <div key={lane} style={{position:'absolute',left:90 + lane * 188,top:430,width:2,height:970,background:soft}} />
        ))}
        <div style={{position:'absolute',left:92,top:1200,width:790,height:12,background:foreground}} />
        <div style={{position:'absolute',left:80 + interpolate(t,[0,1],[0,690]),top:1148,width:104,height:104,borderRadius:'50%',background:accent,boxShadow:'0 0 0 18px ' + soft}} />
        <div style={{position:'absolute',left:90,top:1340,fontFamily:mono,fontSize:25,letterSpacing:3}}>STARTING LINE ≠ FINISH LINE</div>
      </div>
    );
  }
  if (campaign.motif === 'compound-reps') {
    return (
      <div style={common}>
        {[0,1,2,3,4,5].map((i) => {
          const local = enterAt(frame, 70 + i * 6, fps, 150);
          return <div key={i} style={{position:'absolute',left:90 + (i % 3) * 300,top:450 + Math.floor(i / 3) * 320,width:240,height:250,borderRadius:30,background:i === 5 ? accent : card,border:'2px solid ' + soft,transform:'scale(' + local + ')'}}>
            <div style={{fontFamily:mono,fontSize:22,padding:24,opacity:.65}}>SET {String(i + 1).padStart(2,'0')}</div>
            <div style={{fontFamily:display,fontSize:100,fontWeight:950,textAlign:'center',marginTop:38}}>{i + 1}</div>
          </div>;
        })}
        <div style={{position:'absolute',left:120,top:1150,fontFamily:display,fontSize:118,fontWeight:950,letterSpacing:-7}}>1 + 1 + 1</div>
        <div style={{position:'absolute',left:310,top:1300,color:accent,fontFamily:display,fontSize:92,fontWeight:950}}>BECOMES PROOF.</div>
      </div>
    );
  }
  if (campaign.motif === 'bounceback-calendar') {
    return (
      <div style={common}>
        {['MON','TUE','WED'].map((day,i) => {
          const local = enterAt(frame, 72 + i * 8, fps, 145);
          const active = i === 1;
          return <div key={day} style={{position:'absolute',left:72 + i * 326,top:520,width:282,height:540,borderRadius:34,background:active ? accent : card,border:'3px solid ' + (active ? accent : soft),transform:'translateY(' + interpolate(local,[0,1],[150,0]) + 'px)'}}>
            <div style={{fontFamily:mono,fontSize:24,padding:28,opacity:.65}}>{day}</div>
            <div style={{fontFamily:display,fontSize:150,fontWeight:950,textAlign:'center',marginTop:95}}>{i + 17}</div>
            {i === 0 ? <div style={{position:'absolute',left:30,right:30,top:265,height:10,background:'#FF5578',transform:'rotate(-18deg)'}} /> : null}
            {active ? <div style={{fontFamily:mono,fontSize:22,fontWeight:800,textAlign:'center',marginTop:70}}>NEXT SESSION</div> : null}
          </div>;
        })}
        <div style={{position:'absolute',left:95,top:1170,fontFamily:display,fontWeight:950,fontSize:95,letterSpacing:-5}}>THE WEEK ISN’T OVER.</div>
      </div>
    );
  }
  if (campaign.motif === 'receipt') {
    const rows = [['BENCH PRESS','4 × 8'],['SQUAT','5 × 5'],['TOTAL LOAD','12,480'],['PERSONAL BEST','YES']];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:170,top:370,width:740,minHeight:1080,background:'#F3F0E8',color:ink,padding:'58px 62px',boxShadow:'0 45px 120px rgba(0,0,0,.45)',transform:'translateY(' + interpolate(t,[0,1],[260,0]) + 'px) rotate(-2deg)'}}>
          <div style={{fontFamily:mono,fontSize:24,letterSpacing:4,textAlign:'center'}}>BECOME / PROOF OF WORK</div>
          <div style={{borderTop:'4px dashed #19191C',margin:'38px 0'}} />
          {rows.map(([key,value],i) => <div key={key} style={{display:'flex',justifyContent:'space-between',fontFamily:mono,fontSize:31,margin:'34px 0',fontWeight:i === 3 ? 900 : 500,color:i === 3 ? accent : ink}}><span>{key}</span><span>{value}</span></div>)}
          <div style={{borderTop:'4px dashed #19191C',margin:'42px 0 28px'}} />
          <div style={{fontFamily:display,fontSize:86,fontWeight:950,letterSpacing:-5,textAlign:'center'}}>KEEP THIS.</div>
          <div style={{fontFamily:mono,fontSize:22,textAlign:'center',marginTop:30}}>THE WORK HAPPENED.</div>
        </div>
      </div>
    );
  }
  if (campaign.motif === 'blueprint') {
    const nodes = [{x:120,y:490,w:350,label:'PHASE 01'},{x:610,y:720,w:350,label:'PHASE 02'},{x:120,y:970,w:350,label:'PHASE 03'}];
    return (
      <div style={common}>
        <svg style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
          <path d="M470 590 C650 590 520 820 610 820 C740 820 590 1070 470 1070" fill="none" stroke={accent} strokeWidth="9" strokeDasharray="900" strokeDashoffset={900 * (1 - t)} />
        </svg>
        {nodes.map((node,i) => <div key={node.label} style={{position:'absolute',left:node.x,top:node.y,width:node.w,height:190,border:'3px solid ' + accent,background:card,padding:28,transform:'scale(' + enterAt(frame,75+i*10,fps,130) + ')'}}>
          <div style={{fontFamily:mono,color:accent,fontSize:21,letterSpacing:3}}>{node.label}</div>
          <div style={{fontFamily:display,fontSize:42,fontWeight:900,marginTop:28}}>{['FOUNDATION','BUILD','PERFORM'][i]}</div>
        </div>)}
        <div style={{position:'absolute',left:120,top:1270,fontFamily:mono,fontSize:23,letterSpacing:3}}>EVERY BLOCK EARNS THE NEXT.</div>
      </div>
    );
  }
  if (campaign.motif === 'mental-reps') {
    return (
      <div style={common}>
        {[420,310,205].map((size,i) => <div key={size} style={{position:'absolute',left:540-size/2,top:760-size/2,width:size,height:size,borderRadius:'50%',border:(i === 2 ? 18 : 4) + 'px solid ' + (i === 2 ? accent : soft),transform:'scale(' + enterAt(frame,72+i*8,fps,95) + ')'}} />)}
        <div style={{position:'absolute',left:0,right:0,top:705,textAlign:'center',fontFamily:mono,fontSize:26,fontWeight:800,color:accent}}>DO THE NEXT REP</div>
        {['NOTICE','NAME','CHOOSE','MOVE'].map((word,i) => <div key={word} style={{position:'absolute',left:80 + i*245,top:1120 + (i%2)*90,fontFamily:display,fontWeight:900,fontSize:34,opacity:interpolate(frame,[78+i*5,92+i*5],[0,1],clamp)}}>{word}</div>)}
      </div>
    );
  }
  if (campaign.motif === 'mood-wave') {
    const values = [2,4,3,5,3,4,2];
    const points = values.map((v,i) => (100+i*145)+','+(1000-v*115)).join(' ');
    return (
      <div style={common}>
        <svg style={{position:'absolute',left:0,top:200,width:1080,height:1050}} viewBox="0 0 1080 1050">
          <polyline points={points} fill="none" stroke={accent} strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-t} />
          {values.map((v,i) => <circle key={i} cx={100+i*145} cy={1000-v*115} r={22} fill={campaign.light ? ink : chalk} />)}
        </svg>
        <div style={{position:'absolute',left:90,top:1235,fontFamily:display,fontSize:96,fontWeight:950,letterSpacing:-6}}>FEELING → SIGNAL</div>
      </div>
    );
  }
  if (campaign.motif === 'macro-gauge') {
    const gauges = [{label:'PROTEIN',value:.72,color:'#00D26A'},{label:'CARBS',value:.48,color:'#4D8DFF'},{label:'FATS',value:.61,color:accent}];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:90,right:90,top:410,display:'flex',gap:30,justifyContent:'center'}}>
          {gauges.map((g,i) => <div key={g.label} style={{position:'relative',width:280,height:410,transform:'translateY(' + interpolate(enterAt(frame,72+i*7,fps,120),[0,1],[150,0]) + 'px)'}}>
            <Ring size={280} color={g.color} progress={g.value*t} width={22} />
            <div style={{position:'absolute',left:0,right:0,top:108,textAlign:'center',fontFamily:display,fontSize:52,fontWeight:950}}>{Math.round(g.value*100)}%</div>
            <div style={{fontFamily:mono,fontSize:20,letterSpacing:3,textAlign:'center',marginTop:28}}>{g.label}</div>
          </div>)}
        </div>
        <div style={{position:'absolute',left:120,right:120,top:1030,padding:'40px 46px',borderRadius:32,background:card,border:'2px solid ' + soft,fontFamily:display,fontSize:57,fontWeight:900,textAlign:'center'}}>KNOW THE TARGET.<br/><span style={{color:accent}}>THEN LIVE YOUR DAY.</span></div>
      </div>
    );
  }
  if (campaign.motif === 'protein-meter') {
    const fill = interpolate(t,[0,1],[0,0.72]);
    return (
      <div style={common}>
        <div style={{position:'absolute',left:130,top:400,width:820,height:820,borderRadius:'50%',background:card,border:'3px solid ' + soft}}>
          <div style={{position:'absolute',inset:70}}><Ring size={680} color={accent} progress={fill} width={48} /></div>
          <div style={{position:'absolute',left:0,right:0,top:290,textAlign:'center',fontFamily:display,fontSize:150,fontWeight:950,letterSpacing:-9}}>42G</div>
          <div style={{position:'absolute',left:0,right:0,top:465,textAlign:'center',fontFamily:mono,fontSize:25,letterSpacing:4}}>LEFT TODAY</div>
        </div>
        <div style={{position:'absolute',left:210,top:1320,fontFamily:display,fontSize:78,fontWeight:950}}>DINNER HAS A JOB.</div>
      </div>
    );
  }
  if (campaign.motif === 'coach-cues') {
    const cues = ['Brace before you unrack.', 'Knees track over the toes.', 'Drive the floor away.'];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:62,right:62,top:365,bottom:230,borderRadius:50,background:card,border:'2px solid ' + soft,padding:'70px 45px'}}>
          {cues.map((text,i) => <div key={text} style={{display:'flex',alignItems:'baseline',gap:26,marginTop:i?46:0,opacity:enterAt(frame,70+i*18,fps,150),transform:'translateY(' + interpolate(enterAt(frame,70+i*18,fps,150),[0,1],[60,0]) + 'px)'}}>
            <span style={{fontFamily:mono,fontSize:26,letterSpacing:2,color:accent}}>{'0' + (i + 1)}</span>
            <span style={{fontFamily:body,fontSize:38,lineHeight:1.2,color:foreground,fontWeight:700}}>{text}</span>
          </div>)}
          <div style={{position:'absolute',left:46,bottom:38,fontFamily:mono,fontSize:21,letterSpacing:2,opacity:.52}}>BACK SQUAT / COACHING CUES<span style={{color:accent}}> •</span></div>
        </div>
      </div>
    );
  }
  if (campaign.motif === 'trendline') {
    const path = 'M80 1040 C190 990 225 1045 325 885 C430 720 505 820 600 625 C690 450 780 590 980 350';
    return (
      <div style={common}>
        {[0,1,2,3].map(i => <div key={i} style={{position:'absolute',left:80,right:80,top:430+i*240,height:2,background:soft}} />)}
        <svg style={{position:'absolute',inset:0,width:'100%',height:'100%'}} viewBox="0 0 1080 1920">
          <path d={path} fill="none" stroke={accent} strokeWidth="16" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-t} />
        </svg>
        <div style={{position:'absolute',right:86,top:325,padding:'18px 25px',borderRadius:18,background:accent,color:ink,fontFamily:mono,fontWeight:900,fontSize:26}}>{campaign.metric}</div>
        <div style={{position:'absolute',left:80,top:1250,fontFamily:display,fontSize:92,fontWeight:950,letterSpacing:-6}}>DIRECTION<br/>BEATS NOISE.</div>
      </div>
    );
  }
  if (campaign.motif === 'pocket-card') {
    return (
      <div style={common}>
        <div style={{position:'absolute',left:170,right:170,top:350,bottom:240,borderRadius:'0 0 110px 110px',background:campaign.light?ink:'#151519',boxShadow:'inset 0 0 0 3px ' + accent,overflow:'hidden'}}>
          <Screen campaign={campaign} frame={frame} accent={accent} crop={920} style={{left:60,top:150,width:620,transform:'translateY(' + interpolate(t,[0,1],[820,0]) + 'px)'}} />
        </div>
        <div style={{position:'absolute',left:0,right:0,top:1325,textAlign:'center',fontFamily:mono,fontSize:25,fontWeight:800,letterSpacing:5,color:accent}}>THE NEXT MOVE / ON HAND</div>
      </div>
    );
  }
  if (campaign.motif === 'countdown') {
    const shown = Math.max(1,30-Math.floor(Math.max(0,frame-72)/3));
    return (
      <div style={common}>
        <div style={{position:'absolute',left:0,right:0,top:330,textAlign:'center',fontFamily:display,fontSize:570,fontWeight:950,letterSpacing:-45,lineHeight:1,color:accent}}>{String(shown).padStart(2,'0')}</div>
        <div style={{position:'absolute',left:0,right:0,top:940,textAlign:'center',fontFamily:mono,fontSize:30,letterSpacing:8}}>DAYS / ONE DIRECTION</div>
        <div style={{position:'absolute',left:150,right:150,top:1110,height:18,background:soft,borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:(t*100)+'%',background:accent}} /></div>
        <div style={{position:'absolute',left:150,top:1200,fontFamily:display,fontSize:84,fontWeight:950}}>THE CLOCK MOVES.<br/>MOVE WITH IT.</div>
      </div>
    );
  }
  if (campaign.motif === 'plates') {
    const plates = [{w:100,h:480},{w:80,h:390},{w:62,h:315}];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:90,right:90,top:810,height:24,borderRadius:99,background:foreground}} />
        {[0,1].map(side => plates.map((p,i) => {
          const local=enterAt(frame,72+i*9,fps,135);
          const x=side===0?480-(i+1)*p.w:500+i*p.w;
          return <div key={side+'-'+i} style={{position:'absolute',left:x,top:822-p.h/2,width:p.w,height:p.h,borderRadius:25,background:i===0?accent:card,border:'4px solid ' + (i===0?accent:soft),transform:'translateX(' + interpolate(local,[0,1],[(side===0?-1:1)*400,0]) + 'px)'}} />;
        }))}
        <div style={{position:'absolute',left:0,right:0,top:1150,textAlign:'center',fontFamily:display,fontSize:130,fontWeight:950,letterSpacing:-9}}>+5 LB</div>
        <div style={{position:'absolute',left:0,right:0,top:1300,textAlign:'center',fontFamily:mono,fontSize:25,letterSpacing:5}}>EARNED · NOT GUESSED</div>
      </div>
    );
  }
  if (campaign.motif === 'practice-orbit') {
    const words = ['TRAIN','EAT','REFLECT','REPEAT'];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:180,top:420,width:720,height:720,borderRadius:'50%',border:'4px solid ' + soft,transform:'rotate(' + frame*.45 + 'deg)'}}>
          {words.map((word,i) => {
            const angle=(i/4)*Math.PI*2;
            return <div key={word} style={{position:'absolute',left:330+Math.cos(angle)*340,top:330+Math.sin(angle)*340,width:170,height:70,marginLeft:-85,marginTop:-35,borderRadius:99,background:i===3?accent:card,border:'2px solid '+soft,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:mono,fontWeight:900,fontSize:20,transform:'rotate(' + (-frame*.45) + 'deg)'}}>{word}</div>;
          })}
        </div>
        <div style={{position:'absolute',left:340,top:660,width:400,height:240,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:display,fontSize:74,fontWeight:950,textAlign:'center'}}>ONE<br/>PRACTICE</div>
        <div style={{position:'absolute',left:115,top:1280,fontFamily:display,fontSize:78,fontWeight:950}}>THE PARTS<br/><span style={{color:accent}}>KEEP TALKING.</span></div>
      </div>
    );
  }
  if (campaign.motif === 'word-morph') {
    const words=['BE','BECOME','BECOMING','BECAME','BECOME'];
    const idx=Math.min(words.length-1,Math.floor(Math.max(0,frame-72)/22));
    return (
      <div style={common}>
        <div style={{position:'absolute',left:0,right:0,top:480,textAlign:'center',fontFamily:display,fontSize:idx===0?340:idx===2?180:230,fontWeight:950,letterSpacing:-16,color:idx===4?accent:foreground}}>{words[idx]}</div>
        <div style={{position:'absolute',left:150,right:150,top:860,height:4,background:soft}} />
        <div style={{position:'absolute',left:150,top:930,fontFamily:mono,fontSize:27,lineHeight:1.55,letterSpacing:3}}>NOT A DESTINATION.<br/>A THING YOU DO.</div>
        <div style={{position:'absolute',left:150,top:1190,fontFamily:display,fontSize:112,fontWeight:950,letterSpacing:-8}}>VERBS<br/>MOVE.</div>
      </div>
    );
  }
  if (campaign.motif === 'week-grid') {
    const days=['M','T','W','T','F','S','S'];
    const active=[true,false,true,false,true,true,false];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:58,right:58,top:430,display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:14}}>
          {days.map((day,i)=><div key={day+i} style={{height:700,borderRadius:28,background:active[i]?accent:card,border:'2px solid '+soft,transform:'translateY(' + interpolate(enterAt(frame,72+i*5,fps,130),[0,1],[180,0]) + 'px)'}}>
            <div style={{fontFamily:mono,fontSize:25,fontWeight:900,textAlign:'center',paddingTop:28}}>{day}</div>
            {active[i]?<div style={{width:34,height:34,borderRadius:'50%',background:ink,margin:'505px auto 0'}}/>:null}
          </div>)}
        </div>
        <div style={{position:'absolute',left:80,top:1250,fontFamily:display,fontSize:112,fontWeight:950,letterSpacing:-8}}>4 / 4<br/><span style={{color:accent}}>ON PURPOSE.</span></div>
      </div>
    );
  }
  if (campaign.motif === 'calendar-sweep') {
    const items=[['06:30','TRAIN'],['12:00','MEAL'],['18:30','CHECK-IN'],['21:00','RESET']];
    return (
      <div style={common}>
        <div style={{position:'absolute',left:135,top:365,bottom:280,width:8,background:soft}}><div style={{width:'100%',height:(t*100)+'%',background:accent}} /></div>
        {items.map(([time,label],i)=> {
          const local=enterAt(frame,72+i*10,fps,140);
          return <div key={time} style={{position:'absolute',left:100,top:410+i*255,width:840,height:165,borderRadius:28,background:card,border:'2px solid '+soft,display:'flex',alignItems:'center',gap:55,padding:'0 38px',opacity:local,transform:'translateX(' + interpolate(local,[0,1],[150,0]) + 'px)'}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:accent,boxShadow:'0 0 0 10px '+(campaign.light?'#ECEBE6':ink)}}/>
            <div style={{fontFamily:mono,fontSize:27,color:accent}}>{time}</div>
            <div style={{fontFamily:display,fontSize:53,fontWeight:950}}>{label}</div>
          </div>;
        })}
      </div>
    );
  }
  if (campaign.motif === 'movement-swap') {
    const swap=interpolate(t,[0,1],[0,1],clamp);
    return (
      <div style={common}>
        <div style={{position:'absolute',left:70 + swap*530,top:450,width:410,height:620,borderRadius:40,background:card,border:'3px solid '+soft,padding:40,transform:'rotate(' + interpolate(swap,[0,1],[-5,4]) + 'deg)'}}>
          <div style={{fontFamily:mono,fontSize:21,color:mutedDark}}>NO CABLE?</div><div style={{fontFamily:display,fontSize:68,fontWeight:950,marginTop:55}}>CABLE<br/>ROW</div><div style={{position:'absolute',left:40,right:40,bottom:45,height:12,background:'#FF5578'}}/>
        </div>
        <div style={{position:'absolute',left:600 - swap*530,top:530,width:410,height:620,borderRadius:40,background:accent,color:ink,padding:40,transform:'rotate(' + interpolate(swap,[0,1],[5,-4]) + 'deg)'}}>
          <div style={{fontFamily:mono,fontSize:21}}>SAME INTENT</div><div style={{fontFamily:display,fontSize:68,fontWeight:950,marginTop:55}}>DUMBBELL<br/>ROW</div><div style={{position:'absolute',left:40,right:40,bottom:45,fontFamily:mono,fontSize:21,fontWeight:900}}>BACK · HORIZONTAL PULL</div>
        </div>
        <div style={{position:'absolute',left:0,right:0,top:1240,textAlign:'center',fontFamily:display,fontSize:92,fontWeight:950}}>KEEP THE GOAL.</div>
      </div>
    );
  }
  return <Screen campaign={campaign} frame={frame} accent={accent} style={{left:230,top:470}} />;
};

const Proof: React.FC<{campaign: ReviewedCampaign; frame: number; accent: string}> = ({
  campaign,
  frame,
  accent,
}) => {
  const opacity = interpolate(frame, [58, 78, 176, 198], [0, 1, 1, 0], clamp);
  const exitLift = interpolate(frame, [164, 198], [0, -58], clamp);
  const exitScale = interpolate(frame, [164, 198], [1, 0.965], clamp);
  return (
    <AbsoluteFill style={{opacity, transform: 'translateY(' + exitLift + 'px) scale(' + exitScale + ')'}}>
      <Instrument campaign={campaign} frame={frame} accent={accent} />
      <div
        style={{
          position: 'absolute',
          left: 58,
          right: 58,
          bottom: 68,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: campaign.light ? ink : chalk,
          borderTop: '2px solid ' + (campaign.light ? 'rgba(8,8,10,.18)' : 'rgba(246,244,238,.2)'),
          paddingTop: 26,
        }}
      >
        <div style={{width: 735, fontFamily: body, fontSize: 39, lineHeight: 1.16, fontWeight: 700, letterSpacing: -0.5}}>{campaign.proof}</div>
        <div style={{width:82,height:82,borderRadius:'50%',background:accent,color:ink,display:'flex',alignItems:'center',justifyContent:'center',fontSize:46,fontWeight:900}}>→</div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{campaign: ReviewedCampaign; frame: number; accent: string}> = ({
  campaign,
  frame,
  accent,
}) => {
  const {fps} = useVideoConfig();
  const value = enterAt(frame, 188, fps, 115);
  const foreground = campaign.light ? ink : chalk;
  const signature = openingMarks[campaign.motif];
  const signatureSize = campaign.motif === 'countdown' ? 210 : campaign.motif === 'word-morph' ? 74 : 96;
  return (
    <AbsoluteFill
      style={{
        color: foreground,
        opacity: interpolate(frame, [182, 203], [0, 1], clamp),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{position:'absolute',left:540,top:250,width:8,height:interpolate(value,[0,1],[0,400]),background:accent}} />
      <div style={{position:'absolute',left:522,top:245,width:36,height:36,borderLeft:'8px solid '+accent,borderTop:'8px solid '+accent,transform:'rotate(45deg) scale('+value+')'}} />
      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          top: 470,
          color: accent,
          fontFamily: mono,
          fontSize: signatureSize,
          fontWeight: 800,
          letterSpacing: -5,
          lineHeight: 0.9,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          opacity: interpolate(value, [0, 1], [0, 0.24]),
          transform: 'scale(' + interpolate(value, [0, 1], [0.72, 1]) + ') rotate(' + (signature.rotate ?? 0) + 'deg)',
        }}
      >
        {signature.mark}
      </div>
      <div style={{width:930,textAlign:'center',marginTop:330,transform:'translateY('+interpolate(value,[0,1],[100,0])+'px)'}}>
        <div style={{fontFamily:mono,color:accent,fontSize:23,fontWeight:900,letterSpacing:5}}>YOUR NEXT MOVE</div>
        <div style={{fontFamily:display,fontSize:104,lineHeight:.92,fontWeight:950,letterSpacing:-7,textTransform:'uppercase',marginTop:34}}>{campaign.cta}.</div>
        <div style={{display:'inline-flex',alignItems:'center',gap:30,marginTop:58,padding:'26px 42px',borderRadius:999,background:campaign.light?ink:chalk,color:campaign.light?chalk:ink,fontFamily:mono,fontSize:30,letterSpacing:.5,fontWeight:900}}>BECOMEURBEST.COM <span>→</span></div>
      </div>
    </AbsoluteFill>
  );
};

export const ReviewedVideo: React.FC<ReviewedVideoProps> = ({campaign, frameOverride}) => {
  const liveFrame = useCurrentFrame();
  const frame = frameOverride ?? liveFrame;
  const {durationInFrames} = useVideoConfig();
  const rawAccent = colors[campaign.pillar];
  const accent = campaign.light && rawAccent === chalk ? ink : rawAccent;
  return (
    <AbsoluteFill style={{fontFamily: body, overflow:'hidden'}}>
      <Base campaign={campaign} frame={frame} accent={accent} />
      <Wordmark light={campaign.light} label={campaign.label} />
      <Hook campaign={campaign} frame={frame} accent={accent} />
      <Proof campaign={campaign} frame={frame} accent={accent} />
      <EndCard campaign={campaign} frame={frame} accent={accent} />
      <div style={{position:'absolute',left:0,bottom:0,height:8,width:(frame/(durationInFrames-1))*1080,background:accent,zIndex:50}} />
      <AbsoluteFill style={{pointerEvents:'none',opacity:campaign.light?.025:.045,mixBlendMode:campaign.light?'multiply':'screen',backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=%220 0 180 180%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%221.2%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%22.9%22/%3E%3C/svg%3E")'}} />
    </AbsoluteFill>
  );
};
