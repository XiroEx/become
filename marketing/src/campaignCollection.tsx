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

const Footer: React.FC<{dark?: boolean}> = ({dark = true}) => (
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
    <span>BECOME.REDBTN.IO</span>
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

const Headline: React.FC<{
  campaign: Campaign;
  color?: string;
  maxWidth?: number;
  baseSize?: number;
  align?: 'left' | 'center';
}> = ({campaign, color = white, maxWidth = 850, baseSize = 110, align = 'left'}) => {
  const longest = Math.max(...campaign.headline.map((line) => line.length));
  const fontSize = Math.min(baseSize, Math.floor(maxWidth / Math.max(longest * 0.56, 5)));
  return (
    <div style={{fontSize, lineHeight: 0.88, fontWeight: 950, letterSpacing: -fontSize * 0.07, color, textAlign: align}}>
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

const Cta: React.FC<{campaign: Campaign; light?: boolean; color?: string}> = ({campaign, light = false, color = white}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 18,
      padding: '18px 27px',
      borderRadius: 999,
      background: light ? ink : white,
      color: light ? white : ink,
      fontSize: 21,
      fontWeight: 900,
      boxShadow: `inset 0 0 0 3px ${color === white ? 'transparent' : color}`,
    }}
  >
    {campaign.cta} <span>→</span>
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
      {!landscape && <Footer />}
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
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 220 : landscape ? 135 : 170, width: landscape ? 600 : 900}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} maxWidth={landscape ? 590 : 880} baseSize={story ? 132 : landscape ? 80 : 104} /></div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: story ? 58 : landscape ? 700 : 58,
          right: story ? 58 : landscape ? 46 : 58,
          top: story ? 760 : landscape ? 46 : 520,
          bottom: story ? 170 : landscape ? 46 : 55,
          borderRadius: story ? 52 : 38,
          overflow: 'hidden',
          background: paper,
          boxShadow: `0 0 0 3px ${accent}, 0 40px 100px rgba(0,0,0,.4)`,
        }}
      >
        <Img src={staticFile(campaign.image)} style={{width: '100%', display: 'block'}} />
      </div>
      <div style={{position: 'absolute', left: 60, bottom: story ? 88 : landscape ? 62 : 75, zIndex: 3}}>
        <Cta campaign={campaign} color={accent} />
      </div>
      {landscape && <div style={{position: 'absolute', left: 60, top: 420}}><Copy campaign={campaign} width={570} size={22} /></div>}
      {!story && !landscape && <div style={{position: 'absolute', left: 58, top: 420}}><Copy campaign={campaign} /></div>}
      <Grain />
    </AbsoluteFill>
  );
};

const LightLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar] === white ? ink : colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  return (
    <AbsoluteFill style={{...darkBase, background: paper, color: ink}}>
      <Grid dark={false} />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand dark={false} size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 230 : landscape ? 145 : 185, width: landscape ? 690 : 920}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 24}}><Headline campaign={campaign} color={ink} maxWidth={landscape ? 670 : 900} baseSize={story ? 132 : landscape ? 84 : 110} /></div>
        <div style={{marginTop: 28}}><Copy campaign={campaign} dark={false} width={landscape ? 600 : 720} size={landscape ? 22 : 27} /></div>
        <div style={{marginTop: 30}}><Cta campaign={campaign} light color={accent} /></div>
      </div>
      <div style={{position: 'absolute', background: accent, left: 0, bottom: 0, width: story ? 22 : 16, height: '72%'}} />
      <Footer dark={false} />
      <ProductFrame
        image={campaign.image}
        width={story ? 500 : landscape ? 290 : 390}
        rotate={story ? -4 : landscape ? 4 : -5}
        style={landscape ? {right: 60, top: 65} : story ? {left: 315, top: 900} : {right: -15, bottom: -225}}
      />
      <Grain />
    </AbsoluteFill>
  );
};

const CardLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const cardTop = story ? 730 : landscape ? 115 : 495;
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 220 : landscape ? 120 : 175, width: landscape ? 640 : 910}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} maxWidth={landscape ? 630 : 890} baseSize={story ? 128 : landscape ? 82 : 106} /></div>
      </div>
      <div
        style={{
          position: 'absolute', left: 58, right: landscape ? 445 : 58, top: cardTop, bottom: story ? 150 : 55,
          borderRadius: 38, border: '2px solid #303036', background: '#131316', padding: story ? 44 : 32,
        }}
      >
        <div style={{display: 'flex', gap: 12, marginBottom: 28}}>
          {[accent, '#35353A', '#35353A'].map((c, index) => <div key={`${c}-${index}`} style={{width: index === 0 ? 72 : 28, height: 8, borderRadius: 99, background: c}} />)}
        </div>
        <Copy campaign={campaign} width={story ? 760 : landscape ? 590 : 700} size={story ? 31 : 23} />
        <div style={{marginTop: 32}}><Cta campaign={campaign} color={accent} /></div>
      </div>
      <ProductFrame image={campaign.image} width={story ? 480 : landscape ? 330 : 350} rotate={4} style={landscape ? {right: 55, top: 70} : story ? {right: 70, top: 1020} : {right: -10, bottom: -210}} />
      <Grain />
    </AbsoluteFill>
  );
};

const TypeCropLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar] === white ? '#D7D7D2' : colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  return (
    <AbsoluteFill style={{...darkBase, background: accent, color: ink}}>
      <div style={{position: 'absolute', left: 54, top: 46}}><Brand dark={false} size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 54, top: story ? 235 : landscape ? 140 : 180, width: landscape ? 690 : 920}}>
        <Kicker campaign={campaign} color={ink} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} color={ink} maxWidth={landscape ? 680 : 900} baseSize={story ? 134 : landscape ? 88 : 112} /></div>
      </div>
      <div style={{position: 'absolute', left: 54, top: story ? 650 : landscape ? 420 : 500}}><Copy campaign={campaign} dark={false} color={ink} width={landscape ? 620 : 720} size={landscape ? 22 : 28} /></div>
      <div
        style={{
          position: 'absolute', background: ink,
          left: story ? 0 : landscape ? 790 : 0,
          right: 0, top: story ? 870 : landscape ? 0 : 650, bottom: 0,
          clipPath: story ? 'polygon(0 12%, 100% 0, 100% 100%, 0 100%)' : landscape ? 'polygon(18% 0, 100% 0, 100% 100%, 0 100%)' : 'polygon(0 10%, 100% 0, 100% 100%, 0 100%)',
        }}
      />
      <ProductFrame image={campaign.image} width={story ? 455 : landscape ? 275 : 360} rotate={story ? 5 : -4} style={landscape ? {right: 60, top: 40} : story ? {right: 80, top: 900} : {right: 55, top: 620}} />
      <div style={{position: 'absolute', left: 54, bottom: story ? 80 : 44}}><Cta campaign={campaign} /></div>
      <Grain />
    </AbsoluteFill>
  );
};

const SystemLayout: React.FC<CampaignProps> = ({campaign}) => {
  const accent = colors[campaign.pillar];
  const story = campaign.format === 'story';
  const landscape = campaign.format === 'landscape';
  const nodes = [
    ['TRAIN', '#00D26A'],
    ['MIND', '#9818FF'],
    ['FUEL', '#FF981A'],
  ];
  return (
    <AbsoluteFill style={darkBase}>
      <Grid />
      <div style={{position: 'absolute', left: 58, top: 48}}><Brand size={story ? 66 : 52} /></div>
      <div style={{position: 'absolute', left: 58, top: story ? 220 : landscape ? 120 : 175, width: landscape ? 670 : 920}}>
        <Kicker campaign={campaign} color={accent} />
        <div style={{marginTop: 22}}><Headline campaign={campaign} maxWidth={landscape ? 660 : 900} baseSize={story ? 128 : landscape ? 82 : 106} /></div>
        <div style={{marginTop: 28}}><Copy campaign={campaign} width={landscape ? 590 : 700} size={landscape ? 22 : 27} /></div>
      </div>
      <div style={{position: 'absolute', left: 60, top: story ? 760 : landscape ? 455 : 565, display: 'flex', gap: story ? 24 : 15}}>
        {nodes.map(([label, color]) => (
          <div key={label} style={{padding: story ? '17px 29px' : '13px 21px', border: `3px solid ${color}`, borderRadius: 999, color, fontSize: story ? 24 : 18, fontWeight: 900, letterSpacing: 2.5}}>{label}</div>
        ))}
      </div>
      <Arrow color={accent} direction={landscape ? 'right' : 'up'} length={story ? 720 : landscape ? 360 : 390} style={landscape ? {left: 760, top: 450} : {left: 85, top: story ? 970 : 610}} />
      <ProductFrame image={campaign.image} width={story ? 480 : landscape ? 285 : 350} rotate={story ? -4 : 5} style={landscape ? {right: 55, top: 55} : story ? {right: 70, top: 960} : {right: 30, bottom: -180}} />
      <div style={{position: 'absolute', left: 58, bottom: story ? 88 : 48}}><Cta campaign={campaign} color={accent} /></div>
      <Grain />
    </AbsoluteFill>
  );
};

const layouts = [RailLayout, ProductWindowLayout, LightLayout, CardLayout, TypeCropLayout, SystemLayout];

export const CampaignAsset: React.FC<CampaignProps> = (props) => {
  const Layout = layouts[props.campaign.variant % layouts.length];
  return <Layout {...props} />;
};
