// One-off: generate PWA icons from public/himigora.png.
//
// Produces:
//   - icon-192.png, icon-512.png        (standard "any" icons)
//   - icon-maskable-512.png             (logo on brand bg, padded into the
//                                         Android safe zone so it isn't cropped)
//   - apple-touch-icon.png (180)        (iOS home screen)
//
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "himigora.png");
const out = (name) => join(root, "public", name);

const BG = { r: 11, g: 10, b: 18, alpha: 1 }; // #0b0a12, matches theme/background.

async function contain(size, file) {
  await sharp(source)
    .resize(size, size, { fit: "contain", background: BG })
    .png()
    .toFile(out(file));
  console.log(`  ${file} (${size}x${size})`);
}

// Maskable: shrink the logo to ~78% and center it on the brand background so
// the Android circle/squircle mask never clips the artwork.
async function maskable(size, file) {
  const inner = Math.round(size * 0.78);
  const logo = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(out(file));
  console.log(`  ${file} (${size}x${size}, maskable)`);
}

console.log("Generating PWA icons from public/himigora.png:");
await contain(192, "icon-192.png");
await contain(512, "icon-512.png");
await contain(180, "apple-touch-icon.png");
await maskable(512, "icon-maskable-512.png");
console.log("Done.");
