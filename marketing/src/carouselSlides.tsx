import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {Brand, Grain, Grid, PillarLine, UrlLockup, fitLines} from './campaignCollection';

/**
 * Carousel slides — 1080 x 1350 (4:5), the tallest ratio the IG/TikTok feed allows.
 *
 * A deck is one hub told as 3-5 stills: a COVER that promises something countable,
 * DETAIL slides that each carry exactly one step (its own in-app screen + its own
 * bullets), and a CTA that arrives after the viewer has already learned something.
 *
 * Same design system as the squares in campaignCollection: dark grid ground, the
 * BECOME lockup, Arial-bold headlines fitted by glyph metrics, one pillar accent
 * per deck. Nothing on a slide may read as tappable — the slide dots are poster
 * chrome (a progress indicator), never a control, and the CTA is the typeset URL
 * lockup rather than a button.
 */

export type SlideVariant = 'cover' | 'detail' | 'cta';
export type CarouselPillar = 'training' | 'mindset' | 'nutrition' | 'progress';

export type Slide = {
  id: string;
  deck: string;
  index: number;
  total: number;
  variant: SlideVariant;
  pillar: CarouselPillar;
  kicker: string;
  headline: string[];
  /** Cover + CTA sub line, and the DETAIL lead sentence. */
  lead: string;
  /** DETAIL only — one short, true fact per line. */
  bullets?: string[];
  /** COVER only — the deck's steps, previewed. */
  steps?: string[];
  /** COVER only — the hook's numbers, set at poster scale in the top-right. */
  stats?: {value: string; label: string}[];
  image: string;
  /** Override when a crop is squatter than a phone and needs more width to carry. */
  phoneWidth?: number;
};

export type SlideProps = {slide: Slide};

const colors: Record<CarouselPillar, string> = {
  training: '#00D26A',
  mindset: '#9818FF',
  nutrition: '#FF981A',
  progress: '#3887FF',
};

const ink = '#08080A';
const white = '#F7F7F5';
const muted = '#A1A1AA';
const font = 'Arial, Helvetica, sans-serif';

const M = 64; // page margin

const base: React.CSSProperties = {
  background: ink,
  color: white,
  fontFamily: font,
  overflow: 'hidden',
};

/** Progress indicator, not a control: filled pip = the slide you are on. */
const SlideDots: React.FC<{index: number; total: number; accent: string}> = ({index, total, accent}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
    {Array.from({length: total}, (_, i) => (
      <div
        key={i}
        style={{
          width: i + 1 === index ? 26 : 10,
          height: 10,
          borderRadius: 5,
          background: i + 1 === index ? accent : 'rgba(247,247,245,0.22)',
        }}
      />
    ))}
  </div>
);

/** The phone. Height comes from the image, so a short crop stays un-stretched. */
const Phone: React.FC<{image: string; width: number; style?: React.CSSProperties}> = ({image, width, style}) => (
  <div
    style={{
      position: 'absolute',
      width,
      padding: Math.max(5, Math.round(width * 0.018)),
      background: '#030304',
      borderRadius: Math.round(width * 0.115),
      boxShadow: '0 32px 100px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.12)',
      ...style,
    }}
  >
    <div style={{borderRadius: Math.round(width * 0.098), overflow: 'hidden'}}>
      <Img src={staticFile(image)} style={{display: 'block', width: '100%'}} />
    </div>
  </div>
);

const Kicker: React.FC<{text: string; color: string; size?: number}> = ({text, color, size = 22}) => (
  <div style={{fontSize: size, fontWeight: 850, letterSpacing: size * 0.2, textTransform: 'uppercase', color}}>
    {text}
  </div>
);

const Headline: React.FC<{lines: string[]; maxWidth: number; baseSize: number}> = ({lines, maxWidth, baseSize}) => {
  const fontSize = fitLines(lines, maxWidth, baseSize);
  return (
    <div style={{fontSize, lineHeight: 0.88, fontWeight: 950, letterSpacing: -fontSize * 0.07, color: white}}>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
};

/** One true fact per line, hung off a short accent rule. */
const Bullets: React.FC<{items: string[]; accent: string; width: number; size?: number; gap?: number}> = ({
  items,
  accent,
  width,
  size = 33,
  gap = 34,
}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap}}>
    {items.map((item) => (
      <div key={item} style={{display: 'flex', gap: 22, width}}>
        <div style={{width: 30, height: 4, background: accent, flexShrink: 0, marginTop: size * 0.55}} />
        <span style={{fontSize: size, fontWeight: 500, lineHeight: 1.32, color: 'rgba(247,247,245,0.82)'}}>{item}</span>
      </div>
    ))}
  </div>
);

/** The deck's steps, numbered. Previewed on the cover, recapped on the CTA. */
const StepList: React.FC<{steps: string[]; accent: string; size?: number; gap?: number}> = ({
  steps,
  accent,
  size = 31,
  gap = 26,
}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap}}>
    {steps.map((step, i) => (
      <div key={step} style={{display: 'flex', alignItems: 'center', gap: 20}}>
        <span style={{fontSize: 20, fontWeight: 900, letterSpacing: 1, color: accent, width: 34}}>
          {String(i + 1).padStart(2, '0')}
        </span>
        <div style={{width: 26, height: 3, background: 'rgba(247,247,245,0.28)'}} />
        <span style={{fontSize: size, fontWeight: 600, color: 'rgba(247,247,245,0.86)'}}>{step}</span>
      </div>
    ))}
  </div>
);

/**
 * The ask is joining the app, not visiting a domain — JOIN BECOME leads and the
 * URL rides underneath as the way there. Typeset, never button-styled.
 */
const JoinLockup: React.FC<{accent: string; size?: number}> = ({accent, size = 30}) => (
  <div>
    <div style={{fontSize: size, fontWeight: 900, letterSpacing: size * 0.14, color: white, whiteSpace: 'nowrap', lineHeight: 1.1}}>
      JOIN BECOME <span style={{color: accent}}>→</span>
    </div>
    <div style={{marginTop: Math.round(size * 0.42), fontSize: Math.round(size * 0.62), fontWeight: 700, letterSpacing: size * 0.1, color: muted, whiteSpace: 'nowrap'}}>
      BECOMEURBEST.COM
    </div>
  </div>
);

/** The hook's numbers at poster scale, right-aligned over the cover phone. */
const StatStack: React.FC<{stats: {value: string; label: string}[]; accent: string}> = ({stats, accent}) => (
  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 32}}>
    <div style={{width: 30, height: 4, background: accent}} />
    {stats.map((stat) => (
      <div key={stat.label} style={{textAlign: 'right'}}>
        <div style={{fontSize: 84, fontWeight: 950, letterSpacing: -2, lineHeight: 0.95, color: white}}>
          {stat.value}
        </div>
        <div style={{marginTop: 10, fontSize: 19, fontWeight: 850, letterSpacing: 4, textTransform: 'uppercase', color: muted}}>
          {stat.label}
        </div>
      </div>
    ))}
  </div>
);

/**
 * Identical on every frame — the repetition is what makes five posts read as one
 * object. Only the footer's *side* moves: on the layouts where the phone bleeds off
 * the bottom-right corner, the pillar line stacks above the URL lockup on the left
 * instead of sitting under the screenshot, where it was unreadable.
 */
const Chrome: React.FC<{
  slide: Slide;
  accent: string;
  showJoin?: boolean;
  pillar?: 'left' | 'right';
}> = ({slide, accent, showJoin = true, pillar = 'right'}) => (
  <>
    <div style={{position: 'absolute', left: M, top: 52, zIndex: 5}}>
      <Brand size={54} />
    </div>
    <div style={{position: 'absolute', right: M, top: 74, zIndex: 5}}>
      <SlideDots index={slide.index} total={slide.total} accent={accent} />
    </div>
    <div
      style={{
        position: 'absolute',
        left: M,
        bottom: 56,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {pillar === 'left' ? <PillarLine size={19} /> : null}
      {showJoin ? <JoinLockup accent={accent} size={30} /> : null}
    </div>
    {pillar === 'right' ? (
      <div style={{position: 'absolute', right: M, bottom: 60, zIndex: 5}}>
        <PillarLine size={19} />
      </div>
    ) : null}
  </>
);

// ── COVER ────────────────────────────────────────────────────────────────────
// The only slide most people see. It has to work alone, muted, at thumbnail size,
// so the headline is the largest type in the deck and the phone bleeds off-frame.
const Cover: React.FC<SlideProps> = ({slide}) => {
  const accent = colors[slide.pillar];
  return (
    <AbsoluteFill style={base}>
      <Grid />
      <Phone image={slide.image} width={450} style={{right: -55, bottom: -150, transform: 'rotate(5deg)'}} />
      {slide.stats ? (
        <div style={{position: 'absolute', right: M, top: 150, zIndex: 3}}>
          <StatStack stats={slide.stats} accent={accent} />
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: M,
          top: 196,
          bottom: 250,
          width: 620,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <Kicker text={slide.kicker} color={accent} />
          <div style={{marginTop: 26}}>
            <Headline lines={slide.headline} maxWidth={620} baseSize={172} />
          </div>
          <div style={{marginTop: 32, width: 520, fontSize: 32, lineHeight: 1.34, color: muted}}>{slide.lead}</div>
        </div>
        {slide.steps ? <StepList steps={slide.steps} accent={accent} /> : null}
      </div>
      <Chrome slide={slide} accent={accent} pillar="left" />
      <Grain />
    </AbsoluteFill>
  );
};

// ── DETAIL ───────────────────────────────────────────────────────────────────
// One step per slide. Step word as the headline, that step's real screen on the
// right, and three bullets that are true to what is actually visible in it.
const Detail: React.FC<SlideProps> = ({slide}) => {
  const accent = colors[slide.pillar];
  return (
    <AbsoluteFill style={base}>
      <Grid />
      <Phone
        image={slide.image}
        width={slide.phoneWidth ?? 440}
        style={{right: 36, top: '52%', transform: 'translateY(-50%)'}}
      />
      <div
        style={{
          position: 'absolute',
          left: M,
          top: 196,
          bottom: 150,
          width: 500,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <Kicker text={slide.kicker} color={accent} />
          <div style={{marginTop: 24}}>
            <Headline lines={slide.headline} maxWidth={500} baseSize={150} />
          </div>
        </div>
        {/* The lead carries a hairline under it so the column reads as two measured
            gaps rather than one dead field between the headline and the bullets. */}
        <div style={{width: 470}}>
          <div style={{fontSize: 33, lineHeight: 1.36, color: muted}}>{slide.lead}</div>
          <div style={{marginTop: 40, width: 470, height: 1, background: 'rgba(247,247,245,0.16)'}} />
        </div>
        <Bullets items={slide.bullets ?? []} accent={accent} width={430} size={36} gap={46} />
      </div>
      <Chrome slide={slide} accent={accent} />
      <Grain />
    </AbsoluteFill>
  );
};

// ── CTA ──────────────────────────────────────────────────────────────────────
// The low-friction ask, and it arrives only after the viewer has learned something.
const Cta: React.FC<SlideProps> = ({slide}) => {
  const accent = colors[slide.pillar];
  return (
    <AbsoluteFill style={base}>
      <Grid />
      <Phone image={slide.image} width={420} style={{right: -55, bottom: -170, transform: 'rotate(5deg)'}} />
      <div
        style={{
          position: 'absolute',
          left: M,
          top: 206,
          bottom: 132,
          width: 660,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <Kicker text={slide.kicker} color={accent} />
          <div style={{marginTop: 26}}>
            <Headline lines={slide.headline} maxWidth={660} baseSize={150} />
          </div>
          <div style={{marginTop: 34, width: 540, fontSize: 33, lineHeight: 1.34, color: muted}}>{slide.lead}</div>
        </div>
        {/* Recap the three ways, so the ask lands on top of the thing just learned
            rather than on an empty field. */}
        {slide.steps ? <StepList steps={slide.steps} accent={accent} size={30} gap={24} /> : null}
        {/* The ask, once, at poster scale. Chrome drops its small lockup here so the
            frame never carries the URL twice. */}
        <div>
          <div style={{width: 120, height: 4, background: accent, marginBottom: 34}} />
          <JoinLockup accent={accent} size={50} />
        </div>
      </div>
      <Chrome slide={slide} accent={accent} showJoin={false} pillar="left" />
      <Grain />
    </AbsoluteFill>
  );
};

const variants: Record<SlideVariant, React.FC<SlideProps>> = {cover: Cover, detail: Detail, cta: Cta};

export const CarouselSlide: React.FC<SlideProps> = (props) => {
  const Variant = variants[props.slide.variant];
  return <Variant {...props} />;
};
