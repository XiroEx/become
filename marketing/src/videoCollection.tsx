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
import type {Campaign, CampaignPillar} from './campaignCollection';

export type CampaignVideoProps = {
  campaign: Campaign;
  campaignNumber: number;
  campaignTotal: number;
};

const palette: Record<CampaignPillar, string> = {
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
const font = 'Arial, Helvetica, sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const Background: React.FC<{accent: string; light: boolean; frame: number}> = ({
  accent,
  light,
  frame,
}) => (
  <AbsoluteFill style={{background: light ? '#F1F1EE' : ink}}>
    <AbsoluteFill
      style={{
        opacity: light ? 0.07 : 0.09,
        backgroundImage:
          'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
        backgroundSize: '88px 88px',
        color: light ? ink : white,
        transform: 'translateY(' + ((frame * 0.55) % 88) + 'px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 980,
        height: 980,
        borderRadius: '50%',
        right: -520,
        top: -380,
        background: accent,
        opacity: light ? 0.1 : 0.13,
        filter: 'blur(90px)',
        transform: 'scale(' + (1 + frame / 900) + ')',
      }}
    />
  </AbsoluteFill>
);

const Brand: React.FC<{dark: boolean}> = ({dark}) => (
  <div
    style={{
      position: 'absolute',
      left: 64,
      top: 58,
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      color: dark ? white : ink,
      zIndex: 20,
    }}
  >
    <Img src={staticFile('logo.png')} style={{width: 64, height: 64, borderRadius: 13}} />
    <span style={{fontSize: 31, fontWeight: 950, letterSpacing: -1}}>BECOME</span>
  </div>
);

const Phone: React.FC<{
  image: string;
  accent: string;
  frame: number;
  variant: number;
}> = ({image, accent, frame, variant}) => {
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - 45, fps, config: {damping: 18, stiffness: 115, mass: 0.8}});
  const lean = [-5, 4, -2, 6, -6, 3][variant % 6];
  const left = [258, 414, 80, 330, 96, 390][variant % 6];
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 625,
        width: 560,
        height: 1050,
        padding: 11,
        borderRadius: 70,
        background: '#030304',
        boxShadow: '0 46px 150px rgba(0,0,0,.62), 0 0 0 3px ' + accent,
        transform:
          'translateY(' +
          interpolate(enter, [0, 1], [360, 0]) +
          'px) rotate(' +
          interpolate(enter, [0, 1], [lean * 2.2, lean]) +
          'deg) scale(' +
          interpolate(enter, [0, 1], [0.78, 1]) +
          ')',
        opacity: enter,
      }}
    >
      <div style={{height: '100%', borderRadius: 59, overflow: 'hidden', background: '#111'}}>
        <Img src={staticFile(image)} style={{display: 'block', width: '100%'}} />
      </div>
    </div>
  );
};

const Hero: React.FC<{
  campaign: Campaign;
  accent: string;
  frame: number;
  dark: boolean;
  number: number;
}> = ({campaign, accent, frame, dark, number}) => {
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 17, stiffness: 120}});
  const exit = interpolate(frame, [48, 65], [1, 0], clamp);
  const longest = Math.max(...campaign.headline.map((line) => line.length));
  const fontSize = Math.min(150, Math.floor(930 / Math.max(longest * 0.52, 5)));
  return (
    <AbsoluteFill
      style={{
        color: dark ? white : ink,
        opacity: exit,
        transform: 'translateY(' + interpolate(enter, [0, 1], [90, 0]) + 'px)',
      }}
    >
      <div style={{position: 'absolute', left: 64, right: 64, top: 300}}>
        <div
          style={{
            color: accent,
            fontSize: 25,
            fontWeight: 900,
            letterSpacing: 5,
            textTransform: 'uppercase',
          }}
        >
          {campaign.kicker}
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize,
            lineHeight: 0.86,
            fontWeight: 950,
            letterSpacing: -fontSize * 0.07,
          }}
        >
          {campaign.headline.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 64,
          bottom: 170,
          width: interpolate(enter, [0, 1], [0, 820]),
          height: 9,
          borderRadius: 99,
          background: accent,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 52,
          bottom: 92,
          fontSize: 190,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: -15,
          opacity: 0.09,
        }}
      >
        {String(number).padStart(2, '0')}
      </div>
    </AbsoluteFill>
  );
};

const Feature: React.FC<{
  campaign: Campaign;
  accent: string;
  frame: number;
  dark: boolean;
  variant: number;
}> = ({campaign, accent, frame, dark, variant}) => {
  const opacity = interpolate(frame, [48, 64, 130, 146], [0, 1, 1, 0], clamp);
  const copyX = interpolate(frame, [50, 72], [80, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{opacity, color: dark ? white : ink}}>
      <div style={{position: 'absolute', left: 64, right: 64, top: 180}}>
        <div
          style={{
            color: accent,
            fontSize: 23,
            fontWeight: 900,
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          Inside the practice
        </div>
        <div
          style={{
            marginTop: 25,
            maxWidth: 880,
            fontSize: 58,
            lineHeight: 1.06,
            fontWeight: 850,
            letterSpacing: -3,
            transform: 'translateX(' + copyX + 'px)',
          }}
        >
          {campaign.body}
        </div>
      </div>
      <Phone image={campaign.image} accent={accent} frame={frame} variant={variant} />
      <div
        style={{
          position: 'absolute',
          right: 42,
          top: 540,
          writingMode: 'vertical-rl',
          color: accent,
          fontSize: 19,
          fontWeight: 900,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}
      >
        Body · Mind · Routine
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{
  campaign: Campaign;
  accent: string;
  frame: number;
  dark: boolean;
}> = ({campaign, accent, frame, dark}) => {
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - 132, fps, config: {damping: 17, stiffness: 110}});
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        color: dark ? white : ink,
        opacity: interpolate(frame, [132, 149], [0, 1], clamp),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 536,
          top: 275,
          width: 8,
          height: interpolate(enter, [0, 1], [0, 390]),
          background: accent,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 519,
          top: 270,
          width: 34,
          height: 34,
          borderLeft: '8px solid ' + accent,
          borderTop: '8px solid ' + accent,
          transform: 'rotate(45deg) scale(' + enter + ')',
        }}
      />
      <div
        style={{
          width: 900,
          marginTop: 270,
          textAlign: 'center',
          transform: 'translateY(' + interpolate(enter, [0, 1], [100, 0]) + 'px)',
        }}
      >
        <div style={{color: accent, fontSize: 24, fontWeight: 900, letterSpacing: 5}}>
          YOUR NEXT MOVE
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 104,
            lineHeight: 0.92,
            fontWeight: 950,
            letterSpacing: -7,
          }}
        >
          {campaign.cta.toUpperCase()}.
        </div>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 64,
            padding: '25px 42px',
            borderRadius: 999,
            background: dark ? white : ink,
            color: dark ? ink : white,
            fontSize: 27,
            fontWeight: 950,
          }}
        >
          BECOMEURBEST.COM →
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const CampaignVideo: React.FC<CampaignVideoProps> = ({
  campaign,
  campaignNumber,
  campaignTotal,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const variant = campaign.variant % 6;
  const light = variant === 2 || variant === 5;
  const dark = !light;
  const rawAccent = palette[campaign.pillar];
  const accent = light && rawAccent === white ? ink : rawAccent;
  return (
    <AbsoluteFill style={{fontFamily: font, overflow: 'hidden'}}>
      <Background accent={accent} light={light} frame={frame} />
      <Brand dark={dark} />
      <div
        style={{
          position: 'absolute',
          right: 64,
          top: 77,
          color: dark ? muted : '#6B6B73',
          fontSize: 21,
          fontWeight: 900,
          letterSpacing: 3,
          zIndex: 20,
        }}
      >
        {String(campaignNumber).padStart(2, '0')} / {String(campaignTotal).padStart(2, '0')}
      </div>
      <Hero campaign={campaign} accent={accent} frame={frame} dark={dark} number={campaignNumber} />
      <Feature campaign={campaign} accent={accent} frame={frame} dark={dark} variant={variant} />
      <Outro campaign={campaign} accent={accent} frame={frame} dark={dark} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: (frame / (durationInFrames - 1)) * 1080,
          height: 8,
          background: accent,
          zIndex: 30,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          opacity: dark ? 0.05 : 0.035,
          mixBlendMode: dark ? 'screen' : 'multiply',
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%220 0 180 180%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%221.1%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%22.9%22/%3E%3C/svg%3E")',
        }}
      />
    </AbsoluteFill>
  );
};
