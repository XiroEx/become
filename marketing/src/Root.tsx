import React from 'react';
import {Composition} from 'remotion';
import {BecomeReel, OpenGraph, SocialSquare, StoryPoster} from './compositions';
import campaigns from './campaigns.json';
import {CampaignAsset, type Campaign} from './campaignCollection';
import {CampaignVideo} from './videoCollection';
import {reviewedCampaigns} from './reviewedCampaigns';
import {ReviewedVideo} from './reviewedVideo';
import carousels from './carousels.json';
import {CarouselSlide, type Slide} from './carouselSlides';

const dimensions = {
  square: {width: 1080, height: 1080},
  story: {width: 1080, height: 1920},
  landscape: {width: 1200, height: 628},
} as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="BecomeReel"
      component={BecomeReel}
      durationInFrames={360}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="SocialSquare"
      component={SocialSquare}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1080}
    />
    <Composition
      id="StoryPoster"
      component={StoryPoster}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="OpenGraph"
      component={OpenGraph}
      durationInFrames={1}
      fps={30}
      width={1200}
      height={630}
    />
    {(campaigns as Campaign[]).map((campaign) => (
      <Composition
        key={campaign.id}
        id={campaign.id}
        component={CampaignAsset}
        durationInFrames={1}
        fps={30}
        width={dimensions[campaign.format].width}
        height={dimensions[campaign.format].height}
        defaultProps={{campaign}}
      />
    ))}
    {(campaigns as Campaign[]).slice(0, 19).map((campaign, index) => (
      <Composition
        key={'Video' + campaign.id}
        id={'Video' + campaign.id}
        component={CampaignVideo}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          campaign,
          campaignNumber: index + 1,
          campaignTotal: 19,
        }}
      />
    ))}
    {/* Carousel decks — 1080x1350 (4:5), the IG/TikTok feed ratio. */}
    {(carousels as Slide[]).map((slide) => (
      <Composition
        key={slide.id}
        id={slide.id}
        component={CarouselSlide}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={{slide}}
      />
    ))}
    {reviewedCampaigns.map((campaign) => (
      <Composition
        key={campaign.id}
        id={campaign.id}
        component={ReviewedVideo}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{campaign}}
      />
    ))}
  </>
);
