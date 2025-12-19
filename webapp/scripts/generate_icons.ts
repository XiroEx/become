/**
 * Generate PWA icons from SVG
 * Run with: npx tsx scripts/generate_icons.ts
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Create SVG buffer with the JD logo
const createSvg = (size: number, bgColor = '#18181b', textColor = 'white') => {
  const fontSize = Math.round(size * 0.55);
  const textY = Math.round(size * 0.65);
  const radius = Math.round(size * 0.125);
  
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${radius}" fill="${bgColor}"/>
      <text x="${size/2}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">JD</text>
    </svg>
  `);
};

async function generateIcons() {
  console.log('Generating PWA icons...');

  // Generate standard icons
  for (const size of sizes) {
    const outputPath = path.join(iconDir, `icon-${size}x${size}.png`);
    await sharp(createSvg(size))
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Generate Apple Touch Icon (180x180)
  await sharp(createSvg(180))
    .png()
    .toFile(path.join(iconDir, 'apple-touch-icon.png'));
  console.log('Generated: apple-touch-icon.png');

  // Generate favicons
  await sharp(createSvg(32))
    .png()
    .toFile(path.join(iconDir, 'favicon-32x32.png'));
  console.log('Generated: favicon-32x32.png');

  await sharp(createSvg(16))
    .png()
    .toFile(path.join(iconDir, 'favicon-16x16.png'));
  console.log('Generated: favicon-16x16.png');

  // Generate iOS splash screens (simplified - just solid color with logo)
  const splashSizes = [
    { name: 'apple-splash-2048-2732', width: 2048, height: 2732 },
    { name: 'apple-splash-1668-2388', width: 1668, height: 2388 },
    { name: 'apple-splash-1536-2048', width: 1536, height: 2048 },
    { name: 'apple-splash-1125-2436', width: 1125, height: 2436 },
    { name: 'apple-splash-1242-2688', width: 1242, height: 2688 },
    { name: 'apple-splash-750-1334', width: 750, height: 1334 },
    { name: 'apple-splash-1242-2208', width: 1242, height: 2208 },
    { name: 'apple-splash-640-1136', width: 640, height: 1136 },
  ];

  for (const splash of splashSizes) {
    const logoSize = Math.min(splash.width, splash.height) * 0.3;
    const logoX = Math.round((splash.width - logoSize) / 2);
    const logoY = Math.round((splash.height - logoSize) / 2);
    
    const splashSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${splash.width}" height="${splash.height}">
        <rect width="${splash.width}" height="${splash.height}" fill="#18181b"/>
        <g transform="translate(${logoX}, ${logoY})">
          <rect width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.125}" fill="#18181b"/>
          <text x="${logoSize/2}" y="${logoSize * 0.65}" font-family="system-ui, -apple-system, sans-serif" font-size="${logoSize * 0.55}" font-weight="bold" fill="white" text-anchor="middle">JD</text>
        </g>
      </svg>
    `);

    await sharp(splashSvg)
      .png()
      .toFile(path.join(iconDir, `${splash.name}.png`));
    console.log(`Generated: ${splash.name}.png`);
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
