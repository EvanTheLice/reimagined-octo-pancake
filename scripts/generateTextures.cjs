const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const TEXTURE_SIZES = {
  cape: { width: 64, height: 32 },
  wings: { width: 64, height: 64 },
  hat: { width: 64, height: 64 },
  pet: { width: 64, height: 64 },
  particle: { width: 64, height: 64 },
  emote: { width: 64, height: 64 },
  full_body: { width: 128, height: 128 },
  accessory: { width: 64, height: 64 },
};

const TIER_COLORS = {
  COMMON: '#7F7F7F',
  UNCOMMON: '#55FF55',
  RARE: '#5555FF',
  EPIC: '#AA00AA',
  LEGENDARY: '#FFAA00',
};

// All 127 cosmetic IDs from seed.ts
const COSMETIC_IDS = [
  'essential_cape_black', 'essential_cape_free', 'essential_wings_white',
  'UNDEAD_WINGS', 'DOUBLE_DEMONIC_OVERLORD_WINGS', 'DOUBLE_ANGEL_WINGS',
  'MECH_WINGS', 'ENDER_WINGS', 'ASTRAL_WINGS', 'PHOENIX_WINGS',
  'ICE_WINGS', 'FAIRY_WINGS', 'DEMON_WINGS', 'STEAMPUNK_WINGS',
  'NEON_WINGS', 'DRAGON_WINGS', 'BUTTERFLY_WINGS', 'PIXIE_WINGS',
  'COSMIC_WINGS', 'LOAF', 'KNUCKLE_WALKING', 'KICKING_MY_FEET',
  'TECTONIK_DANCE', 'ANIME_EMBARRASSED', 'SPIDER_CRAWL', 'BREAKDANCE',
  'GUITAR_SHRED', 'CRAFTING_KADOOSH', 'THE_WORM', 'FLOSS', 'DAB',
  'WAVE', 'CHEER', 'FACEPALM', 'SHRUG', 'DANCE_MOVES', 'ZOMBIE_WALK',
  'MOONWALK', 'JUMP_ROPE', 'HEADBANG', 'SIT', 'SLEEP', 'CLAP', 'BOW',
  'RISING_SOULS', 'DEMONIC_AURA', 'ENDERMAN', 'FIREFLIES', 'OCEAN_AURA',
  'CHERRY_BLOSSOM_PARTICLES', 'ENDER_GLIMMER', 'HEART_PARTICLES',
  'MUSIC_NOTES', 'FLAME_AURA', 'SNOW_AURA', 'RAINBOW_TRAIL',
  'SPARKLE_AURA', 'VOID_PARTICLES', 'NATURE_AURA', 'BEE', 'RACCOON',
  'DRAGON', 'MINI_MOOSH', 'AXOLOTL', 'GHASTLING_PET', 'WOLF_PET',
  'CAT_PET', 'PARROT_PET', 'FOX_PET', 'PANDA_PET', 'POLAR_BEAR_PET',
  'LLAMA_PET', 'RABBIT_PET', 'CHICKEN_PET', 'BABY_DRAGON', 'PHOENIX_PET',
  'BABY_ENDERMAN', 'DEMON_HORNS', 'MASCOT_HEAD', 'COWBOY_HAT', 'WITCH_HAT',
  'BUNNY_EARS', 'CAT_EARS', 'VIKING_HELMET', 'PIRATE_HAT', 'BEANIE',
  'CAP', 'ANGEL_HALO', 'DEVIL_HORNS', 'HOOD', 'HEADPHONES', 'WIZARD_HAT',
  'HALO', 'HORNS', 'TOP_HAT', 'FEDORA', 'SANTA_HAT', 'PARTY_HAT', 'CROWN',
  'DEEP_DARK_DRAGON', 'DEMONIC_OVERLORD_ARMOR', 'Y2K_JACKET', 'MAID_OUTFIT',
  'KNIGHT_ARMOR', 'SAMURAI_ARMOR', 'NUCLEAR_SUIT', 'ASTRONAUT_SUIT', 'HOODIE',
  'TUXEDO', 'CASUAL_OUTFIT', 'ROBOT_SUIT', 'DEMONIC_CHARGE_UP',
  'DEMONIC_OVERLORD_STAFF', 'SUPER_GAUNTLET', 'FANCY_BACKPACK',
  'WINGS_BACKPACK', 'SCARF', 'CAPE_PIN', 'BELT', 'BANDANA', 'TAIL',
  'DRAGON_TAIL', 'BACKPACK', 'SWORD_BACK', 'SHIELD_BACK', 'QUIVER',
  'WINGS_SMALL', 'ENDERMAN_CAPE', 'CREEPER_CAPE', 'PRISMARINE_CAPE',
  'BLAZE_CAPE', 'WITHER_CAPE', 'STAR_CAPE', 'GRADIENT_CAPE', 'MINECON_CAPE',
  'MOJANG_CAPE', 'SPIRAL_CAPE', 'DRAGON_CAPE', 'HEROBRINE_CAPE', 'ENDER_CAPE',
  'RAINBOW_CAPE', 'FIRE_CAPE', 'ICE_CAPE', 'GOLDEN_CAPE', 'ROYAL_CAPE',
  'NINJA_CAPE'
];

function getType(id) {
  const lower = id.toLowerCase();
  if (lower.includes('cape')) return 'cape';
  if (lower.includes('wings')) return 'wings';
  if (lower.includes('hat') || lower.includes('halo') || lower.includes('horns') || lower.includes('helmet') || lower.includes('hood') || lower.includes('headphones') || lower.includes('crown') || lower.includes('cap') || lower.includes('beanie')) return 'hat';
  if (lower.includes('pet') || ['dragon', 'bee', 'raccoon', 'moosh', 'axolotl', 'ghastling', 'wolf', 'cat', 'parrot', 'fox', 'panda', 'bear', 'llama', 'rabbit', 'chicken', 'phoenix', 'enderman', 'baby'].some(x => lower.includes(x))) return 'pet';
  if (lower.includes('particle') || lower.includes('aura') || lower.includes('souls') || lower.includes('glimmer') || lower.includes('hearts') || lower.includes('notes') || lower.includes('trail') || lower.includes('sparkle') || lower.includes('void') || lower.includes('nature') || lower.includes('fireflies') || lower.includes('ocean') || lower.includes('blossom') || lower.includes('flame') || lower.includes('snow') || lower.includes('rainbow')) return 'particle';
  if (lower.includes('emote') || ['loaf', 'knuckle', 'kicking', 'tectonik', 'anime', 'spider', 'breakdance', 'guitar', 'crafting', 'worm', 'floss', 'dab', 'wave', 'cheer', 'facepalm', 'shrug', 'dance', 'zombie', 'moonwalk', 'jump', 'headbang', 'sit', 'sleep', 'clap', 'bow'].some(x => lower.includes(x))) return 'emote';
  if (lower.includes('suit') || lower.includes('armor') || lower.includes('outfit') || lower.includes('jacket') || lower.includes('hoodie') || lower.includes('tuxedo') || lower.includes('casual') || lower.includes('robot')) return 'full_body';
  return 'accessory';
}

function getTier(id) {
  const lower = id.toLowerCase();
  if (lower.includes('legendary') || lower.includes('cosmic') || lower.includes('phoenix') || lower.includes('dragon') || lower.includes('minecon') || lower.includes('mojang') || lower.includes('herobrine') || lower.includes('crown') || lower.includes('overlord') || lower.includes('dark') || lower.includes('mascot') || lower.includes('knight') || lower.includes('samurai') || lower.includes('astronaut') || lower.includes('robot') || lower.includes('nuclear')) return 'LEGENDARY';
  if (lower.includes('epic') || lower.includes('astral') || lower.includes('ice') || lower.includes('demon') || lower.includes('steam') || lower.includes('breakdance') || lower.includes('worm') || lower.includes('witch') || lower.includes('viking') || lower.includes('wizard') || lower.includes('maid') || lower.includes('y2k') || lower.includes('tuxedo') || lower.includes('demonic') || lower.includes('super') || lower.includes('wither') || lower.includes('spiral') || lower.includes('rainbow') || lower.includes('fire') || lower.includes('royal') || lower.includes('ender')) return 'EPIC';
  if (lower.includes('rare') || lower.includes('fairy') || lower.includes('neon') || lower.includes('free') || lower.includes('white') || lower.includes('cowboy') || lower.includes('angel') || lower.includes('devil') || lower.includes('hood') || lower.includes('halo') || lower.includes('horns') || lower.includes('santa') || lower.includes('fancy') || lower.includes('wings_backpack') || lower.includes('tail') || lower.includes('sword') || lower.includes('enderman') || lower.includes('prismarine') || lower.includes('blaze') || lower.includes('dragon_cape') || lower.includes('ice_cape') || lower.includes('golden') || lower.includes('wolf') || lower.includes('fox') || lower.includes('panda') || lower.includes('bear') || lower.includes('axolotl') || lower.includes('bee') || lower.includes('raccoon') || lower.includes('ghastling') || lower.includes('baby') || lower.includes('axolotl')) return 'RARE';
  return 'COMMON';
}

function generateTexture(cosmetic) {
  const size = TEXTURE_SIZES[cosmetic.type] || { width: 64, height: 64 };
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = TIER_COLORS[cosmetic.tier] || '#7F7F7F';
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '10px Arial';
  ctx.fillText(cosmetic.type.substring(0, 8), 5, 15);
  ctx.fillText(cosmetic.tier.substring(0, 8), 5, 30);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size.width, size.height);

  return canvas.toBuffer('image/png');
}

function generateEmissiveTexture(cosmetic) {
  const size = TEXTURE_SIZES[cosmetic.type] || { width: 64, height: 64 };
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');

  // Emissive parts glow with tier color on transparent background
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, size.width, size.height);
  
  // Draw some glowing spots
  ctx.fillStyle = TIER_COLORS[cosmetic.tier] || '#7F7F7F';
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * size.width;
    const y = Math.random() * size.height;
    const radius = 3 + Math.random() * 5;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}
  const size = TEXTURE_SIZES[cosmetic.type] || { width: 64, height: 64 };
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.fillStyle = TIER_COLORS[cosmetic.tier] || '#7F7F7F';
  
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * size.width;
    const y = Math.random() * size.height;
    const radius = 5 + Math.random() * 10;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

const outputDir = path.join(process.cwd(), 'static', 'cosmetics');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Generating textures for ${COSMETIC_IDS.length} cosmetics...`);

for (const id of COSMETIC_IDS) {
  const cosmetic = { id, type: getType(id), tier: getTier(id) };
  const texturePath = path.join(outputDir, `${id.toLowerCase()}.png`);
  const emissivePath = path.join(outputDir, `${id.toLowerCase()}_emissive.png`);
  
  fs.writeFileSync(texturePath, generateTexture(cosmetic));
  fs.writeFileSync(emissivePath, generateEmissiveTexture(cosmetic));
  
  console.log(`Generated: ${id.toLowerCase()}.png`);
}

console.log(`\nGenerated ${COSMETIC_IDS.length * 2} texture files`);
