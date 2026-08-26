import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotPath = join(packageRoot, "src/assets/product-screenshot.png");
const logoPath = join(packageRoot, "public/favicon.svg");
const outputPath = join(packageRoot, "public/og-image.png");

const screenshotWidth = 920;
const screenshotHeight = 523;

const screenshot = await sharp(screenshotPath)
  .resize(screenshotWidth, screenshotHeight, { fit: "cover" })
  .composite([
    {
      input: Buffer.from(`
        <svg width="${screenshotWidth}" height="${screenshotHeight}">
          <rect width="100%" height="100%" rx="14" fill="white" />
        </svg>
      `),
      blend: "dest-in",
    },
  ])
  .png()
  .toBuffer();

const logo = await sharp(logoPath).resize({ width: 52 }).png().toBuffer();

const background = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(165 150) rotate(43) scale(410 365)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#DCE7FF" />
        <stop offset="1" stop-color="#F8F7F7" stop-opacity="0" />
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#18181B" flood-opacity="0.16" />
      </filter>
    </defs>
    <rect width="1200" height="630" fill="#F8F7F7" />
    <rect width="720" height="630" fill="url(#glow)" />
    <rect x="436" y="94" width="948" height="551" rx="22" fill="white" filter="url(#shadow)" />
    <text x="128" y="91" fill="#131010" font-family="Inter, Arial, sans-serif" font-size="31" font-weight="700" letter-spacing="-0.8">Kowork</text>
    <text x="64" y="190" fill="#131010" font-family="Inter, Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="-2.5">Give the</text>
    <text x="64" y="249" fill="#131010" font-family="Inter, Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="-2.5">busywork to</text>
    <text x="64" y="308" fill="#155DFC" font-family="Inter, Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="-2.5">Kowork.</text>
    <text x="64" y="368" fill="#5F5A5A" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500">Your open-source AI coworker</text>
    <text x="64" y="572" fill="#155DFC" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700">getkowork.com</text>
  </svg>
`);

const border = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect x="450.5" y="108.5" width="919" height="522" rx="14" fill="none" stroke="#DEDADA" />
  </svg>
`);

await sharp(background)
  .composite([
    { input: logo, left: 64, top: 54 },
    { input: screenshot, left: 450, top: 108 },
    { input: border, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(`Generated ${outputPath}`);
