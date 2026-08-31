import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';

export type CampaignFormat = 'square' | 'story' | 'landscape';
export type CampaignPillar = 'system' | 'training' | 'mindset' | 'nutrition' | 'progress' | 'coaching';

export type Campaign = {
  id: string;
  slug: string;
  format: CampaignFormat;
  pillar: CampaignPillar;
  kicker: string;
  headline: string[];
  body: string;
  cta: string;
  image: string;
  variant: number;
};

export type CampaignProps = {campaign: Campaign};

const colors: Record<CampaignPillar, string> = {
  system: '#F7F7F5',
  training: '#00D26A',
  mindset: '#9818FF',
  nutrition: '#FF981A',
  progress: '#3887FF',
  coaching: '#FF496C',
};

const ink = '#08080A';
const white = '#F7F7F5';
const muted = '#A1A1AA';
const paper = '#F3F3F1';
const font = 'Arial, Helvetica, sans-serif';

const Grid: React.FC<{dark?: boolean}> = ({dark = true}) => (
  <AbsoluteFill
    style={{
      backgroundImage: `linear-gradient(${dark ? 'rgba(255,255,255,.045)' : 'rgba(8,8,10,.06)'} 1px, transparent 1px), linear-gradient(90deg, ${dark ? 'rgba(255,255,255,.045)' : 'rgba(8,8,10,.06)'} 1px, transparent 1px)`,
      backgroundSize: '80px 80px',
      maskImage: 'linear-gradient(to bottom, black, transparent 92%)',
    }}
  />
);

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      opacity: 0.05,
      mixBlendMode: 'multiply',
      backgroundImage:
        'url("data:image/svg+xml,%3Csvg viewBox=%220 0 180 180%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%221.1%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%22.9%22/%3E%3C/svg%3E")',
    }}
  />
);

const Brand: React.FC<{dark?: boolean; size?: number}> = ({dark = true, size = 58}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 16, color: dark ? white : ink}}>
    <Img src={staticFile('logo.png')} style={{width: size, height: size, borderRadius: size * 0.18}} />
    <span style={{fontSize: size * 0.48, fontWeight: 900, letterSpacing: -1}}>BECOME</span>
  </div>
);

const Footer: React.FC<{dark?: boolean; showUrl?: boolean}> = ({dark = true, showUrl = true}) => (
  <div
    style={{
      position: 'absolute',
      left: 54,
      right: 54,
      bottom: 32,
      display: 'flex',
      justifyContent: 'space-between',
      color: dark ? '#777780' : '#73737B',
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
    }}
  >
    <span>{showUrl ? 'BECOMEURBEST.COM' : ''}</span>
    <span>Body · Mind · Routine</span>
  </div>
);

const Arrow: React.FC<{
  color: string;
  direction?: 'up' | 'right';
  length?: number;
  style?: React.CSSProperties;
}> = ({color, direction = 'up', length = 360, style}) => {
  const vertical = direction === 'up';
  return (
    <div style={{position: 'absolute', width: vertical ? 36 : length, height: vertical ? length : 36, ...style}}>
      <div
        style={{
          position: 'absolute',
          background: color,
          width: vertical ? 5 : length,
          height: vertical ? length : 5,
          left: vertical ? 15 : 0,
          top: vertical ? 0 : 15,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 26,
          height: 26,
          borderTop: `5px solid ${color}`,
          borderRight: `5px solid ${color}`,
          left: vertical ? 2 : length - 28,
          top: vertical ? 1 : 2,
          transform: vertical ? 'rotate(-45deg)' : 'rotate(45deg)',
        }}
      />
    </div>
  );
};

const ProductFrame: React.FC<{
  image: string;
  width: number;
  rotate?: number;
  cropHeight?: number;
  style?: React.CSSProperties;
}> = ({image, width, rotate = 0, cropHeight, style}) => (
  <div
    style={{
      position: 'absolute',
      width,
      padding: Math.max(5, Math.round(width * 0.018)),
      background: '#030304',
      borderRadius: Math.round(width * 0.115),
      boxShadow: '0 32px 100px rgba(0,0,0,.52), 0 0 0 2px rgba(255,255,255,.12)',
      transform: `rotate(${rotate}deg)`,
      ...style,
    }}
  >
    <div style={{borderRadius: Math.round(width * 0.098), overflow: 'hidden', height: cropHeight}}>
      <Img src={staticFile(image)} style={{display: 'block', width: '100%'}} />
    </div>
  </div>
);

// Arial Bold advance widths (em units). The layouts render fontWeight 950 against the
// Arial stack, which resolves to Arial Bold, so these are the real glyph widths. Used to
// fit a headline to its column instead of guessing from character count.
const boldAdvance: Record<string, number> = {
  ' ': 0.278, '!': 0.333, '"': 0.474, '#': 0.556, $: 0.556, '%': 0.889, '&': 0.722, "'": 0.238,
  '(': 0.333, ')': 0.333, '*': 0.389, '+': 0.584, ',': 0.278, '-': 0.333, '.': 0.278, '/': 0.278,
  '0': 0.556, '1': 0.556, '2': 0.556, '3': 0.556, '4': 0.556, '5': 0.556, '6': 0.556, '7': 0.556,
  '8': 0.556, '9': 0.556, ':': 0.333, ';': 0.333, '?': 0.611, '@': 0.975,
  A: 0.722, B: 0.722, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778, H: 0.722, I: 0.278,
  J: 0.556, K: 0.722, L: 0.611, M: 0.833, N: 0.722, O: 0.778, P: 0.667, Q: 0.778, R: 0.722,
  S: 0.667, T: 0.611, U: 0.722, V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611,
  a: 0.556, b: 0.611, c: 0.556, d: 0.611, e: 0.556, f: 0.333, g: 0.611, h: 0.611, i: 0.278,
  j: 0.278, k: 0.556, l: 0.278, m: 0.889, n: 0.611, o: 0.611, p: 0.611, q: 0.611, r: 0.389,
  s: 0.556, t: 0.333, u: 0.611, v: 0.556, w: 0.778, x: 0.556, y: 0.556, z: 0.5,
};

const tracking = 0.07;

// Width of a headline line in em, including the negative letter-spacing the layouts apply.
const lineEm = (line: string, track: number) =>
  Math.max(
    0.5,
    [...line].reduce((sum, char) => sum + (boldAdvance[char] ?? 0.62), 0) - line.length * track,
  );

export const headlineSize = (campaign: Campaign, maxWidth: number, baseSize: number, track = tracking) => {
  const widest = Math.max(...campaign.headline.map((line) => lineEm(line, track)));
  return Math.min(baseSize, Math.floor(maxWidth / widest));
};

// Rendered height of the headline block at a given size (lineHeight 0.88).
const headlineHeight = (campaign: Campaign, fontSize: number) =>
  campaign.headline.length * fontSize * 0.88;

const kickerHeight = 24;

const Headline: React.FC<{
  campaign: Campaign;
  color?: string;
  maxWidth?: number;
  baseSize?: number;
  align?: 'left' | 'center';
  track?: number;
}> = ({campaign, color = white, maxWidth = 850, baseSize = 110, align = 'left', track = tracking}) => {
  const fontSize = headlineSize(campaign, maxWidth, baseSize, track);
  return (
    <div style={{fontSize, lineHeight: 0.88, fontWeight: 950, letterSpacing: -fontSize * track, color, textAlign: align}}>
      {campaign.headline.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
};

const Copy: React.FC<{campaign: Campaign; dark?: boolean; width?: number; size?: number; color?: string}> = ({
  campaign,
  dark = true,
  width = 620,
  size = 27,
  color,
}) => (
  <div style={{width, fontSize: size, lineHeight: 1.35, color: color ?? (dark ? muted : '#62626B')}}>{campaign.body}</div>
);

const Kicker: React.FC<{campaign: Campaign; color: string}> = ({campaign, color}) => (
  <div style={{fontSize: 21, fontWeight: 850, letterSpacing: 4.2, textTransform: 'uppercase', color}}>
    {campaign.kicker}
  </div>
);

// Nothing on a square may read as tappable. The old rounded CTA pill was replaced by a
// poster-native URL lockup: tracked caps type on the background, no box, no border.
const UrlLockup: React.FC<{color?: string; size?: number}> = ({color = white, size = 28}) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 900,
      letterSpacing: size * 0.14,
      color,
      whiteSpace: 'nowrap',
      lineHeight: 1.15,
    }}
  >
    BECOMEURBEST.COM →
  </div>
);

// Kept as `Cta` so every call site keeps working, but it now renders the lockup.
const Cta: React.FC<{campaign: Campaign; light?: boolean; color?: string; size?: number}> = ({
  light = false,
  size = 28,
}) => <UrlLockup color={light ? ink : white} size={size} />;

const pillarWords: [string, string][] = [
  ['TRAIN', '#00D26A'],
  ['MIND', '#9818FF'],
  ['FUEL', '#FF981A'],
];

// Replaces the outlined TRAIN / MIND / FUEL chips. Same weight and tracking family as the
// kicker so it reads as a typeset line, not a control.
const PillarLine: React.FC<{dark?: boolean; size?: number}> = ({dark = true, size = 21}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      fontSize: size,
      fontWeight: 850,
      letterSpacing: size * 0.2,
      textTransform: 'uppercase',
      lineHeight: 1.15,
    }}
  >
    {pillarWords.map(([label, color], index) => (
      <React.Fragment key={label}>
        {index > 0 && (
          <span style={{color: dark ? '#5C5C64' : '#8C8C93', padding: `0 ${size * 0.42}px`, letterSpacing: 0}}>·</span>
        )}
        <span style={{color}}>{label}</span>
      </React.Fragment>
    ))}
  </div>
);

// Three true product facts. Fills the left column that used to read empty at phone scale.
const featureLines: [string, string][] = [
  ['Coach-built programs', '#00D26A'],
  ['Photo plate logging', '#FF981A'],
  ['A weekly recap', '#9818FF'],
];

const FeatureStack: React.FC<{dark?: boolean; size?: number; gap?: number}> = ({
  dark = true,
  size = 32,
  gap = 30,
}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap}}>
    {featureLines.map(([label, color]) => (
      <div key={label} style={{display: 'flex', alignItems: 'center', gap: 22}}>
        <div style={{width: 28, height: 3, background: color, flexShrink: 0}} />
        <span
          style={{
            fontSize: size,
            fontWeight: 600,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            color: dark ? 'rgba(247,247,245,0.75)' : 'rgba(8,8,10,0.8)',
          }}
        >
          {label}
        </span>
      </div>
    ))}
  </div>
);

const darkBase: React.CSSProperties = {
  background: ink,
  color: white,
  fontFamily: font,
  overflow: 'hidden',
};

const RailLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const phoneWidth = story ? 500 : landscape ? 305 : 380;
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 56, top: 48}}><Brand size={story ? 68 : 54} /></div>
      <Arrow color={accent} length={story ? 1180 : landscape ? 330 : 610} direction="up" style={{left: 66, top: story ? 250 : landscape ? 170 : 220}} />
      <div style={{position: 'absolute', left: 128, top: story ? 260 : landscape ? 180 : 225, width: landscape ? 650 : 830, zIndex: 2}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 24}}><Headline campaign={campaign} maxWidth={landscape ? 650 : 820} baseSize={story ? 128 : landscape ? 84 : 104} /></div>
        <div style={{marginTop: 28}}><Copy campaign={campaign} width={landscape ? 600 : story ? 680 : 560} size={landscape ? 23 : 27} /></div>
        {!story && <div style={{marginTop: 30}}><Cta campaign={campaign} color={accent} /></div>}
      </div>
      {!landscape && <Footer showUrl={false} />}
      <ProductFrame
        image={campaign.image}
        width={phoneWidth}
        rotate={landscape ? -4 : 5}
        style={landscape ? {right: 45, top: 62} : story ? {right: 60, top: 860} : {right: -30, bottom: -210}}
      />
      {story && <div style={{position: 'absolute', left: 132, bottom: 116, zIndex: 4}}><Cta campaign={campaign} color={accent} /></div>}
      <Grain />
    </AbsoluteFill>
  );
};

const ProductWindowLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const square = !story && !landscape;
  // Square: let the headline fill the column instead of sitting at a fixed 104, which left a
  // dead field to its right on short lines, then hang the sub and the window off it.
  const squareHeadTop = 150;
  const squareHeadBottom =
    squareHeadTop + kickerHeight + 22 + headlineHeight(campaign, headlineSize(campaign, 880, 120));
  const squareCopyTop = Math.round(squareHeadBottom + 24);
  const squareWindowTop = Math.max(520, squareCopyTop + 98);
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 220 : landscape ? 135 : squareHeadTop, width: landscape ? 600 : 900}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} maxWidth={landscape ? 590 : 880} baseSize={story ? 132 : landscape ? 80 : 120} /></div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: story ? 58 : landscape ? 700 : 58,
          right: story ? 58 : landscape ? 46 : 58,
          top: story ? 760 : landscape ? 46 : squareWindowTop,
          // Square: the window stops short of the bottom so the URL lockup sits on the
          // poster rather than on top of the screenshot, which is where the old pill sat.
          bottom: story ? 170 : landscape ? 46 : 118,
          borderRadius: story ? 52 : 38,
          overflow: 'hidden',
          background: paper,
          boxShadow: `0 0 0 3px ${accent}, 0 40px 100px rgba(0,0,0,.4)`,
        }}
      >
        <Img src={staticFile(campaign.image)} style={{width: '100%', display: 'block'}} />
      </div>
      <div style={{position: 'absolute', left: 58, bottom: story ? 88 : landscape ? 62 : 46, zIndex: 3}}>
        <Cta campaign={campaign} />
      </div>
      {square && (
        <div style={{position: 'absolute', right: 58, bottom: 52, zIndex: 3}}>
          <PillarLine size={20} />
        </div>
      )}
      {landscape && <div style={{position: 'absolute', left: 60, top: 420}}><Copy campaign={campaign} width={570} size={22} /></div>}
      {square && <div style={{position: 'absolute', left: 58, top: squareCopyTop}}><Copy campaign={campaign} width={620} size={28} /></div>}
      <Grain />
    </AbsoluteFill>
  );
};

const LightLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar] === white ? ink : colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const square = !story && !landscape;
  // Square: the lower-left used to be a dead field between the sub line and the footer.
  // Hang a full column off the measured headline bottom and let it stretch to the margin.
  const squareHeadTop = 185;
  const squareColumnTop = Math.round(
    squareHeadTop + kickerHeight + 24 + headlineHeight(campaign, headlineSize(campaign, 900, 110)) + 34,
  );
  return (
    <AbsoluteFill style={{...darkBase, background: paper, color: ink}}>
      <Grid dark={false} />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand dark={false} size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 230 : landscape ? 145 : squareHeadTop, width: landscape ? 690 : 920}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 24}}><Headline campaign={campaign} color={ink} maxWidth={landscape ? 670 : 900} baseSize={story ? 132 : landscape ? 84 : 110} /></div>
        {!square && (
          <>
            <div style={{marginTop: 28}}><Copy campaign={campaign} dark={false} width={landscape ? 600 : 720} size={landscape ? 22 : 27} /></div>
            <div style={{marginTop: 30}}><Cta campaign={campaign} light color={accent} /></div>
          </>
        )}
      </div>
      {square && (
        <div
          style={{
            position: 'absolute',
            left: 58,
            top: squareColumnTop,
            bottom: 46,
            width: 520,
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <Copy campaign={campaign} dark={false} width={510} size={31} />
          <FeatureStack dark={false} size={32} gap={30} />
          <PillarLine dark={false} />
          <UrlLockup color={ink} />
        </div>
      )}
      <div style={{position: 'absolute', background: accent, left: 0, bottom: 0, width: story ? 22 : 16, height: '72%'}} />
      {!square && <Footer dark={false} showUrl={false} />}
      <ProductFrame
        image={campaign.image}
        width={story ? 500 : landscape ? 290 : 450}
        rotate={story ? -4 : landscape ? 4 : -5}
        style={landscape ? {right: 60, top: 65} : story ? {left: 315, top: 900} : {right: -15, top: 489}}
      />
      <Grain />
    </AbsoluteFill>
  );
};

const CardLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const square = !story && !landscape;
  // Square: the headline fills the column, so the card has to follow it down instead of
  // sitting at a fixed height with a dead band above and a mostly empty interior below.
  const squareHeadTop = 155;
  // Poster-scale type needs looser tracking or a trailing period fuses into the last letter.
  const squareTrack = 0.035;
  const squareHeadSize = headlineSize(campaign, 920, 200, squareTrack);
  const squareHeadBottom = squareHeadTop + kickerHeight + 22 + headlineHeight(campaign, squareHeadSize);
  const squareCardTop = Math.min(640, Math.max(520, Math.round(squareHeadBottom + 38)));
  const cardTop = story ? 730 : landscape ? 115 : squareCardTop;
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 220 : landscape ? 120 : squareHeadTop, width: landscape ? 640 : 950}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} maxWidth={landscape ? 630 : story ? 890 : 920} baseSize={story ? 128 : landscape ? 82 : 200} track={square ? squareTrack : tracking} /></div>
      </div>
      <div
        style={{
          position: 'absolute', left: 58, right: landscape ? 445 : 58, top: cardTop, bottom: story ? 150 : square ? 50 : 55,
          borderRadius: 38, border: '2px solid #303036', background: '#131316', padding: story ? 44 : 34,
          display: 'flex', flexDirection: 'column', justifyContent: square ? 'space-between' : 'center',
        }}
      >
        <div style={{display: 'flex', gap: 12, marginBottom: square ? 0 : 26}}>
          {[accent, '#35353A', '#35353A'].map((c, index) => <div key={`${c}-${index}`} style={{width: index === 0 ? 72 : 28, height: 8, borderRadius: 99, background: c}} />)}
        </div>
        <Copy campaign={campaign} width={story ? 760 : landscape ? 590 : 520} size={story ? 31 : square ? 28 : 23} />
        {square && <FeatureStack size={29} gap={24} />}
        {square && <PillarLine />}
        <div style={{marginTop: square ? 0 : 30}}><Cta campaign={campaign} /></div>
      </div>
      <ProductFrame image={campaign.image} width={story ? 480 : landscape ? 330 : 470} rotate={4} style={landscape ? {right: 55, top: 70} : story ? {right: 70, top: 1020} : {right: -20, top: cardTop - 12}} />
      <Grain />
    </AbsoluteFill>
  );
};

const TypeCropLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar] === white ? '#D7D7D2' : colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const square = !story && !landscape;
  // Square: fit the headline to the column, then hang the subline, the feature stack and the
  // diagonal off it. The band that straddled the split used to read empty at phone scale, so
  // the stack now lives in the light zone and the split is pushed down to make room for it.
  const squareHeadTop = 160;
  const squareTrack = 0.05;
  const squareHeadSize = headlineSize(campaign, 900, 150, squareTrack);
  const squareHeadBottom = squareHeadTop + kickerHeight + 22 + headlineHeight(campaign, squareHeadSize);
  const squareCopyTop = Math.round(squareHeadBottom + 42);
  const squareStackTop = squareCopyTop + 132;
  const squareStackBottom = squareStackTop + 3 * 34 + 2 * 26;
  const squareSplitTop = Math.max(800, squareStackBottom + 42);
  return (
    <AbsoluteFill style={{...darkBase, background: accent, color: ink}}>
      <div style={{position: 'absolute', left: 54, top: 46}}><Brand dark={false} size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 54, top: story ? 235 : landscape ? 140 : squareHeadTop, width: landscape ? 690 : 930}}>
        <Kicker campaign={campaign} color={ink} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} color={ink} maxWidth={landscape ? 680 : 900} baseSize={story ? 134 : landscape ? 88 : 150} track={story || landscape ? tracking : squareTrack} /></div>
      </div>
      <div style={{position: 'absolute', left: 54, top: story ? 650 : landscape ? 420 : squareCopyTop}}><Copy campaign={campaign} dark={false} color={ink} width={landscape ? 620 : story ? 720 : 520} size={landscape ? 22 : story ? 28 : 31} /></div>
      {square && (
        <div style={{position: 'absolute', left: 54, top: squareStackTop, zIndex: 2}}>
          <FeatureStack dark={false} size={31} gap={26} />
        </div>
      )}
      <div
        style={{
          position: 'absolute', background: ink,
          left: story ? 0 : landscape ? 790 : 0,
          right: 0, top: story ? 870 : landscape ? 0 : squareSplitTop, bottom: 0,
          clipPath: story ? 'polygon(0 12%, 100% 0, 100% 100%, 0 100%)' : landscape ? 'polygon(18% 0, 100% 0, 100% 100%, 0 100%)' : 'polygon(0 10%, 100% 0, 100% 100%, 0 100%)',
        }}
      />
      <ProductFrame image={campaign.image} width={story ? 455 : landscape ? 275 : 480} rotate={story ? 5 : -4} style={landscape ? {right: 60, top: 40} : story ? {right: 80, top: 900} : {right: 15, top: squareSplitTop - 205}} />
      {square && (
        <div style={{position: 'absolute', left: 54, bottom: 152, zIndex: 3}}><PillarLine size={23} /></div>
      )}
      <div style={{position: 'absolute', left: 54, bottom: story ? 80 : square ? 50 : 44, zIndex: 3}}>
        <Cta campaign={campaign} light={landscape} />
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

const SystemLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const square = !story && !landscape;
  // Square: the strip under the sub line used to be dead. Run one measured column from the
  // headline bottom to the bottom margin: sub, feature stack, pillar line, URL lockup.
  const squareHeadTop = 175;
  const squareColumnTop = Math.round(
    squareHeadTop + kickerHeight + 22 + headlineHeight(campaign, headlineSize(campaign, 940, 118)) + 32,
  );
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 220 : landscape ? 120 : squareHeadTop, width: landscape ? 670 : 950}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} maxWidth={landscape ? 660 : story ? 900 : 940} baseSize={story ? 128 : landscape ? 82 : 118} /></div>
        {!square && <div style={{marginTop: 28}}><Copy campaign={campaign} width={landscape ? 590 : 700} size={landscape ? 22 : 27} /></div>}
      </div>
      {square ? (
        <div
          style={{
            position: 'absolute',
            left: 58,
            top: squareColumnTop,
            bottom: 50,
            width: 500,
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <Copy campaign={campaign} width={500} size={32} />
          <FeatureStack size={32} gap={30} />
          <PillarLine />
          <UrlLockup />
        </div>
      ) : (
        <div style={{position: 'absolute', left: 60, top: story ? 780 : 460, zIndex: 2}}>
          <PillarLine size={story ? 24 : 21} />
        </div>
      )}
      <ProductFrame image={campaign.image} width={story ? 480 : landscape ? 285 : 470} rotate={story ? -4 : 5} style={landscape ? {right: 55, top: 55} : story ? {right: 70, top: 960} : {right: 20, top: 520}} />
      {!square && <div style={{position: 'absolute', left: 58, bottom: story ? 88 : 48}}><Cta campaign={campaign} /></div>}
      <Grain />
    </AbsoluteFill>
  );
};

const layouts = [RailLayout, ProductWindowLayout, LightLayout, CardLayout, TypeCropLayout, SystemLayout];

export const CampaignAsset: React.FC<CampaignProps> = (props) => {
  const Layout = layouts[props.campaign.variant % layouts.length];
  return <Layout {...props} />;
};
