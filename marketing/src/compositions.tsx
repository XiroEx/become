import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  ink: '#08080A',
  panel: '#151518',
  white: '#F7F7F5',
  muted: '#A1A1AA',
  line: '#2C2C31',
  green: '#00D26A',
  purple: '#9818FF',
  orange: '#FF981A',
};

const sans = 'Arial, Helvetica, sans-serif';

const background: React.CSSProperties = {
  backgroundColor: C.ink,
  color: C.white,
  fontFamily: sans,
  overflow: 'hidden',
};

const Grid: React.FC<{opacity?: number}> = ({opacity = 1}) => (
  <AbsoluteFill
    style={{
      opacity,
      backgroundImage:
        'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
      backgroundSize: '80px 80px',
      maskImage: 'linear-gradient(to bottom, black, transparent 82%)',
    }}
  />
);

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      opacity: 0.055,
      backgroundImage:
        'url("data:image/svg+xml,%3Csvg viewBox=%220 0 180 180%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%221.1%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%22.85%22/%3E%3C/svg%3E")',
      mixBlendMode: 'screen',
      pointerEvents: 'none',
    }}
  />
);

const ArrowRail: React.FC<{
  left?: number;
  top?: number;
  height?: number;
  color?: string;
  progress?: number;
}> = ({left = 78, top = 160, height = 1320, color = C.white, progress = 1}) => {
  const drawnHeight = Math.max(0, height * progress);
  return (
    <div style={{position: 'absolute', left, top, width: 40, height}}>
      <div
        style={{
          position: 'absolute',
          left: 17,
          bottom: 0,
          width: 5,
          height: drawnHeight,
          background: color,
        }}
      />
      {progress > 0.96 ? (
        <div
          style={{
            position: 'absolute',
            left: 1,
            top: -2,
            width: 34,
            height: 34,
            borderLeft: `5px solid ${color}`,
            borderTop: `5px solid ${color}`,
            transform: 'rotate(45deg)',
          }}
        />
      ) : null}
    </div>
  );
};

const Brand: React.FC<{size?: number; compact?: boolean}> = ({size = 76, compact = false}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
    <Img
      src={staticFile('logo.png')}
      style={{width: size, height: size, borderRadius: size * 0.18, objectFit: 'cover'}}
    />
    {!compact ? (
      <div style={{fontSize: size * 0.48, fontWeight: 900, letterSpacing: -1}}>BECOME</div>
    ) : null}
  </div>
);

const Eyebrow: React.FC<{children: React.ReactNode; color?: string}> = ({children, color = C.muted}) => (
  <div style={{fontSize: 25, fontWeight: 800, letterSpacing: 5, color, textTransform: 'uppercase'}}>
    {children}
  </div>
);

const Phone: React.FC<{
  src: string;
  width: number;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({src, width, rotate = 0, style}) => (
  <div
    style={{
      width,
      padding: Math.round(width * 0.018),
      borderRadius: Math.round(width * 0.12),
      background: '#050505',
      boxShadow: '0 36px 110px rgba(0,0,0,.62), 0 0 0 2px rgba(255,255,255,.13)',
      transform: `rotate(${rotate}deg)`,
      ...style,
    }}
  >
    <div style={{borderRadius: Math.round(width * 0.1), overflow: 'hidden'}}>
      <Img src={staticFile(src)} style={{width: '100%', display: 'block'}} />
    </div>
  </div>
);

const Pill: React.FC<{children: React.ReactNode; color: string}> = ({children, color}) => (
  <div
    style={{
      padding: '14px 24px',
      borderRadius: 999,
      border: `2px solid ${color}`,
      color,
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: 2,
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const Footer: React.FC<{dark?: boolean}> = ({dark = true}) => (
  <div
    style={{
      position: 'absolute',
      left: 72,
      right: 72,
      bottom: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 3,
      color: dark ? C.muted : '#4C4C54',
    }}
  >
    <span>BECOME.REDbtn.IO</span>
    <span>BODY · MIND · ROUTINE</span>
  </div>
);

export const SocialSquare: React.FC = () => (
  <AbsoluteFill style={background}>
    <Grid />
    <div style={{position: 'absolute', left: 64, top: 54}}>
      <Brand size={68} />
    </div>
    <ArrowRail left={74} top={234} height={620} color={C.green} />
    <div style={{position: 'absolute', left: 142, top: 245, width: 600, zIndex: 2}}>
      <Eyebrow color={C.green}>Coach-built</Eyebrow>
      <div style={{fontSize: 102, lineHeight: 0.88, fontWeight: 950, letterSpacing: -7, marginTop: 26}}>
        BUILD
        <br />
        THE NEXT
        <br />
        YOU.
      </div>
      <div style={{marginTop: 34, fontSize: 28, lineHeight: 1.35, color: C.muted, width: 440}}>
        Training, nutrition, and mindset. One system built for real progress.
      </div>
    </div>
    <Phone
      src="programs.png"
      width={360}
      rotate={-5}
      style={{position: 'absolute', right: -18, bottom: -220}}
    />
    <div style={{position: 'absolute', right: 56, top: 72, display: 'flex', gap: 12}}>
      <div style={{width: 13, height: 13, borderRadius: 99, background: C.green}} />
      <div style={{width: 13, height: 13, borderRadius: 99, background: C.purple}} />
      <div style={{width: 13, height: 13, borderRadius: 99, background: C.orange}} />
    </div>
    <Footer />
    <Grain />
  </AbsoluteFill>
);

export const StoryPoster: React.FC = () => (
  <AbsoluteFill style={background}>
    <Grid opacity={0.8} />
    <div style={{position: 'absolute', left: 68, top: 68}}>
      <Brand size={74} />
    </div>
    <div style={{position: 'absolute', left: 68, top: 270, width: 880}}>
      <Eyebrow color={C.green}>Your whole practice</Eyebrow>
      <div style={{fontSize: 124, lineHeight: 0.89, fontWeight: 950, letterSpacing: -9, marginTop: 32}}>
        SHOW UP.
        <br />
        TRACK IT.
        <br />
        BECOME.
      </div>
    </div>
    <ArrowRail left={86} top={795} height={825} color={C.white} />
    <div style={{position: 'absolute', left: 150, top: 825, display: 'flex', gap: 22}}>
      <Pill color={C.green}>Train</Pill>
      <Pill color={C.purple}>Mind</Pill>
      <Pill color={C.orange}>Fuel</Pill>
    </div>
    <Phone
      src="mindset.png"
      width={386}
      rotate={-7}
      style={{position: 'absolute', left: 202, top: 1015, zIndex: 1}}
    />
    <Phone
      src="nutrition.png"
      width={386}
      rotate={6}
      style={{position: 'absolute', right: -14, top: 925, zIndex: 2}}
    />
    <div
      style={{
        position: 'absolute',
        left: 68,
        bottom: 135,
        width: 550,
        padding: '28px 34px',
        borderRadius: 28,
        background: C.white,
        color: C.ink,
        fontSize: 31,
        lineHeight: 1.2,
        fontWeight: 850,
        zIndex: 5,
      }}
    >
      Start your transformation →
    </div>
    <Footer />
    <Grain />
  </AbsoluteFill>
);

export const OpenGraph: React.FC = () => (
  <AbsoluteFill style={background}>
    <Grid opacity={0.75} />
    <div style={{position: 'absolute', left: 58, top: 48}}>
      <Brand size={62} />
    </div>
    <ArrowRail left={61} top={185} height={310} color={C.green} />
    <div style={{position: 'absolute', left: 122, top: 194, width: 650}}>
      <Eyebrow color={C.green}>One system. Real progress.</Eyebrow>
      <div style={{fontSize: 82, lineHeight: 0.92, fontWeight: 950, letterSpacing: -6, marginTop: 20}}>
        TRAIN TO
        <br />
        BECOME.
      </div>
      <div style={{fontSize: 24, color: C.muted, marginTop: 24}}>
        Programs · nutrition · mindset · coaching
      </div>
    </div>
    <Phone
      src="dashboard.png"
      width={314}
      rotate={-5}
      style={{position: 'absolute', right: 80, top: 88}}
    />
    <div style={{position: 'absolute', right: 56, bottom: 44, display: 'flex', gap: 9}}>
      {[C.green, C.purple, C.orange].map((color) => (
        <div key={color} style={{width: 11, height: 11, borderRadius: 99, background: color}} />
      ))}
    </div>
    <Grain />
  </AbsoluteFill>
);

const ReelIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 18, mass: 0.8}});
  const exit = interpolate(frame, [54, 70], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: exit}}>
      <div style={{transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px) scale(${interpolate(enter, [0, 1], [.82, 1])})`}}>
        <Img src={staticFile('logo.png')} style={{width: 320, height: 320, borderRadius: 54}} />
      </div>
      <div style={{fontSize: 94, fontWeight: 950, letterSpacing: -6, marginTop: 52}}>TRAIN TO BECOME.</div>
      <div style={{fontSize: 30, color: C.muted, marginTop: 22}}>A complete practice for a stronger life.</div>
    </AbsoluteFill>
  );
};

const ReelPillar: React.FC<{
  title: string;
  kicker: string;
  copy: string;
  color: string;
  screenshot: string;
  number: string;
}> = ({title, kicker, copy, color, screenshot, number}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 20, stiffness: 120}});
  const exit = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const phoneY = interpolate(enter, [0, 1], [230, 0]);
  const phoneRotate = interpolate(enter, [0, 1], [10, -3]);
  const railProgress = interpolate(frame, [0, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{opacity: exit}}>
      <ArrowRail left={75} top={210} height={1190} color={color} progress={railProgress} />
      <div style={{position: 'absolute', left: 145, top: 190, right: 70}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <Eyebrow color={color}>{kicker}</Eyebrow>
          <div style={{fontSize: 28, fontWeight: 900, color: C.muted}}>{number} / 03</div>
        </div>
        <div style={{fontSize: 126, lineHeight: 0.88, fontWeight: 950, letterSpacing: -9, marginTop: 34}}>
          {title}
        </div>
        <div style={{fontSize: 32, lineHeight: 1.35, color: C.muted, marginTop: 34, maxWidth: 720}}>{copy}</div>
      </div>
      <Phone
        src={screenshot}
        width={590}
        style={{
          position: 'absolute',
          left: 310,
          top: 690,
          transform: `translateY(${phoneY}px) rotate(${phoneRotate}deg)`,
        }}
      />
      <div style={{position: 'absolute', left: 145, bottom: 145}}>
        <Brand size={58} />
      </div>
    </AbsoluteFill>
  );
};

const ReelOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 17, mass: 0.85}});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <ArrowRail left={523} top={205} height={410} color={C.white} progress={enter} />
      <div
        style={{
          textAlign: 'center',
          transform: `translateY(${interpolate(enter, [0, 1], [90, 0])}px)`,
          opacity: enter,
          marginTop: 300,
        }}
      >
        <Eyebrow color={C.green}>Start where you are</Eyebrow>
        <div style={{fontSize: 132, lineHeight: 0.88, fontWeight: 950, letterSpacing: -10, marginTop: 36}}>
          BECOME
          <br />
          WHAT'S NEXT.
        </div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 58,
            padding: '26px 44px',
            borderRadius: 999,
            background: C.white,
            color: C.ink,
            fontSize: 30,
            fontWeight: 900,
          }}
        >
          BECOMEURBEST.COM →
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BecomeReel: React.FC = () => (
  <AbsoluteFill style={background}>
    <Grid opacity={0.8} />
    <Sequence from={0} durationInFrames={70} premountFor={15}>
      <ReelIntro />
    </Sequence>
    <Sequence from={58} durationInFrames={96} premountFor={20}>
      <ReelPillar
        title="TRAIN WITH INTENT."
        kicker="Programs"
        copy="Structured plans. Live tracking. Progress you can prove."
        color={C.green}
        screenshot="programs.png"
        number="01"
      />
    </Sequence>
    <Sequence from={142} durationInFrames={96} premountFor={20}>
      <ReelPillar
        title="BUILD THE MIND."
        kicker="Mindset"
        copy="Daily check-ins and practical frameworks for the days motivation disappears."
        color={C.purple}
        screenshot="mindset.png"
        number="02"
      />
    </Sequence>
    <Sequence from={226} durationInFrames={96} premountFor={20}>
      <ReelPillar
        title="FUEL THE WORK."
        kicker="Nutrition"
        copy="Clear targets and simple tracking that fit your life."
        color={C.orange}
        screenshot="nutrition.png"
        number="03"
      />
    </Sequence>
    <Sequence from={310} durationInFrames={50} premountFor={20}>
      <ReelOutro />
    </Sequence>
    <Grain />
  </AbsoluteFill>
);
