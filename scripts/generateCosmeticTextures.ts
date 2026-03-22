import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Cosmetic texture dimensions by type
const TEXTURE_SIZES: Record<string, { width: number; height: number }> = {
  CAPE: { width: 64, height: 32 },
  WINGS: { width: 64, height: 64 },
  HAT: { width: 64, height: 64 },
  PET: { width: 64, height: 64 },
  EMOTE: { width: 64, height: 64 },
  FULL_BODY: { width: 128, height: 128 },
  ACCESSORY: { width: 64, height: 64 },
  BACK: { width: 64, height: 64 },
  FACE: { width: 64, height: 64 },
  TAIL: { width: 64, height: 64 },
  ARMS: { width: 64, height: 64 },
  SHOULDERS: { width: 64, height: 64 },
  SUITS: { width: 128, height: 128 },
  SHOES: { width: 64, height: 64 },
  PANTS: { width: 64, height: 64 },
  EFFECT: { width: 64, height: 64 },
  ICON: { width: 64, height: 64 },
  TOP: { width: 64, height: 64 },
  HEAD: { width: 64, height: 64 },
  SKIRT: { width: 64, height: 64 },
  EARS: { width: 64, height: 64 },
};

// Colors for different tiers
const TIER_COLORS: Record<string, string> = {
  COMMON: "#7F7F7F",      // Gray
  UNCOMMON: "#55FF55",    // Green
  RARE: "#5555FF",        // Blue
  EPIC: "#AA00AA",        // Purple
  LEGENDARY: "#FFAA00",   // Gold
};

// Sample cosmetic data (will be populated from seed.ts)
interface Cosmetic {
  id: string;
  type: string;
  tier: string;
  displayName: string;
}

function generateTexture(cosmetic: Cosmetic): Buffer {
  const size = TEXTURE_SIZES[cosmetic.type] || { width: 64, height: 64 };
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");

  // Fill background with tier color
  ctx.fillStyle = TIER_COLORS[cosmetic.tier] || "#7F7F7F";
  ctx.fillRect(0, 0, size.width, size.height);

  // Add pattern based on cosmetic type
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  for (let i = 0; i < size.width; i += 8) {
    for (let j = 0; j < size.height; j += 8) {
      if ((i + j) % 16 === 0) {
        ctx.fillRect(i, j, 4, 4);
      }
    }
  }

  // Add border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size.width, size.height);

  // Add type indicator in center
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.font = `${Math.min(size.width, size.height) / 6}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cosmetic.type.substring(0, 4), size.width / 2, size.height / 2 - 5);
  ctx.font = `${Math.min(size.width, size.height) / 10}px Arial`;
  ctx.fillText(cosmetic.id.substring(0, 10), size.width / 2, size.height / 2 + 8);

  return canvas.toBuffer("image/png");
}

function generateEmissiveTexture(cosmetic: Cosmetic): Buffer {
  const size = TEXTURE_SIZES[cosmetic.type] || { width: 64, height: 64 };
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");

  // Emissive parts (glowing areas)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size.width, size.height);

  // Add emissive highlights for legendary/epic items
  if (cosmetic.tier === "LEGENDARY" || cosmetic.tier === "EPIC") {
    ctx.fillStyle = "rgba(255, 255, 200, 0.8)";
    for (let i = 4; i < size.width - 4; i += 8) {
      for (let j = 4; j < size.height - 4; j += 8) {
        ctx.fillRect(i, j, 2, 2);
      }
    }
  }

  return canvas.toBuffer("image/png");
}

function loadCosmetics(): Cosmetic[] {
  // For now, generate based on the seed.ts cosmetics
  // In production, this would import from the actual seed data
  const cosmetics: Cosmetic[] = [];
  
  // Based on seed.ts structure - these would be dynamically loaded
  const tiers = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
  const types = Object.keys(TEXTURE_SIZES);
  
  // Generate sample cosmetics
  for (let i = 0; i < 127; i++) {
    const type = types[i % types.length];
    const tier = tiers[i % tiers.length];
    cosmetics.push({
      id: `cosmetic_${i}`,
      type: type,
      tier: tier,
      displayName: `Cosmetic ${i}`,
    });
  }
  
  return cosmetics;
}

export function generateAllTextures() {
  const outputDir = join(process.cwd(), "static", "cosmetics");
  
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const cosmetics = loadCosmetics();
  console.log(`Generating textures for ${cosmetics.length} cosmetics...`);

  for (const cosmetic of cosmetics) {
    const texturePath = join(outputDir, `${cosmetic.id}.png`);
    const emissivePath = join(outputDir, `${cosmetic.id}_emissive.png`);
    
    // Generate main texture
    const textureBuffer = generateTexture(cosmetic);
    writeFileSync(texturePath, textureBuffer);
    
    // Generate emissive texture
    const emissiveBuffer = generateEmissiveTexture(cosmetic);
    writeFileSync(emissivePath, emissiveBuffer);
    
    console.log(`Generated: ${cosmetic.id}.png (${cosmetic.type}, ${cosmetic.tier})`);
  }

  console.log(`\nGenerated ${cosmetics.length * 2} texture files in ${outputDir}`);
}

// Run if executed directly
if (import.meta.main) {
  generateAllTextures();
}
