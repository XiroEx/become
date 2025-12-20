/**
 * Generate PWA icons from logo.png
 * Run with: npx tsx scripts/generate_icons.ts
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconDir = path.join(__dirname, '../public/icons');
const logoPath = path.join(__dirname, '../public/logo.png');

// Ensure icons directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

async function generateIcons() {
  console.log('Generating PWA icons from logo.png...');

  // Check if logo exists
  if (!fs.existsSync(logoPath)) {
    console.error('Error: logo.png not found at', logoPath);
    process.exit(1);
  }

  // Generate standard icons
  for (const size of sizes) {
    const outputPath = path.join(iconDir, `icon-${size}x${size}.png`);
    await sharp(logoPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Generate Apple Touch Icon (180x180)
  await sharp(logoPath)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(path.join(iconDir, 'apple-touch-icon.png'));
  console.log('Generated: apple-touch-icon.png');

  // Generate favicons
  await sharp(logoPath)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(path.join(iconDir, 'favicon-32x32.png'));
  console.log('Generated: favicon-32x32.png');

  await sharp(logoPath)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(path.join(iconDir, 'favicon-16x16.png'));
  console.log('Generated: favicon-16x16.png');

  // Generate iOS splash screens with centered logo
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
    const logoSize = Math.round(Math.min(splash.width, splash.height) * 0.4);
    
    // Resize logo first
    const resizedLogo = await sharp(logoPath)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    // Create splash with black background and centered logo
    await sharp({
      create: {
        width: splash.width,
        height: splash.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      }
    })
      .composite([{
        input: resizedLogo,
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(iconDir, `${splash.name}.png`));
    
    console.log(`Generated: ${splash.name}.png`);
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
