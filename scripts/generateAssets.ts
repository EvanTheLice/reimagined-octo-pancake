/**
 * Asset Generation Script for Essential Cosmetics
 * 
 * This script generates:
 * - Placeholder textures for all cosmetics (PNG files)
 * - Updates seed.ts with proper asset URLs
 * 
 * Run with: bun run scripts/generateAssets.ts
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================
// CONFIGURATION
// ============================================================

const STATIC_DIR = join(__dirname, '..', 'static');
const COSMETICS_DIR = join(STATIC_DIR, 'cosmetics');
const BASE_URL = "http://127.0.0.1:8080/static";

// Tier colors (RGBA) - vibrant, distinct colors
const TIER_COLORS: Record<string, [number, number, number]> = {
    'COMMON': [200, 200, 200],      // Light gray
    'UNCOMMON': [80, 200, 80],      // Green
    'RARE': [80, 140, 255],         // Blue
    'EPIC': [180, 80, 255],         // Purple
    'LEGENDARY': [255, 180, 50],    // Gold
};

// Type-specific geometry mapping
const TYPE_GEOMETRY: Record<string, string> = {
    'cape': 'cape.json',
    'wings': 'wings.json',
    'hat': 'hat.json',
    'pet': 'pet_quadruped.json',
    'particle': 'particle.json', // Particles don't need geometry, but we'll create a placeholder
    'emote': 'emote.json',        // Emotes are animations, placeholder
    'full_body': 'outfit_full_body.json',
    'accessory': 'backpack.json',
};

// Cosmetic definitions - matching seed.ts
const COSMETICS = [
    // ORIGINAL
    { id: 'essential_cape_black', type: 'cape', tier: 'COMMON' },
    { id: 'essential_cape_free', type: 'cape', tier: 'RARE' },
    { id: 'essential_wings_white', type: 'wings', tier: 'EPIC' },
    
    // WINGS
    { id: 'UNDEAD_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'DOUBLE_DEMONIC_OVERLORD_WINGS', type: 'wings', tier: 'LEGENDARY' },
    { id: 'DOUBLE_ANGEL_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'MECH_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'ENDER_WINGS', type: 'wings', tier: 'RARE' },
    { id: 'DRAGON_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'ASTRAL_WINGS', type: 'wings', tier: 'LEGENDARY' },
    { id: 'PHOENIX_WINGS', type: 'wings', tier: 'LEGENDARY' },
    { id: 'ICE_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'FAIRY_WINGS', type: 'wings', tier: 'RARE' },
    { id: 'DEMON_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'BUTTERFLY_WINGS', type: 'wings', tier: 'RARE' },
    { id: 'STEAMPUNK_WINGS', type: 'wings', tier: 'EPIC' },
    { id: 'NEON_WINGS', type: 'wings', tier: 'RARE' },
    { id: 'COSMIC_WINGS', type: 'wings', tier: 'LEGENDARY' },
    
    // EMOTES
    { id: 'LOAF', type: 'emote', tier: 'RARE' },
    { id: 'KNUCKLE_WALKING', type: 'emote', tier: 'RARE' },
    { id: 'KICKING_MY_FEET', type: 'emote', tier: 'UNCOMMON' },
    { id: 'TECTONIK_DANCE', type: 'emote', tier: 'RARE' },
    { id: 'ANIME_EMBARRASSED', type: 'emote', tier: 'UNCOMMON' },
    { id: 'SPIDER_CRAWL', type: 'emote', tier: 'RARE' },
    { id: 'BREAKDANCE', type: 'emote', tier: 'EPIC' },
    { id: 'GUITAR_SHRED', type: 'emote', tier: 'EPIC' },
    { id: 'CRAFTING_KADOOSH', type: 'emote', tier: 'RARE' },
    { id: 'THE_WORM', type: 'emote', tier: 'EPIC' },
    { id: 'FLOSS', type: 'emote', tier: 'COMMON' },
    { id: 'DAB', type: 'emote', tier: 'COMMON' },
    { id: 'WAVE', type: 'emote', tier: 'COMMON' },
    { id: 'CHEER', type: 'emote', tier: 'UNCOMMON' },
    { id: 'FACEPALM', type: 'emote', tier: 'UNCOMMON' },
    { id: 'SHRUG', type: 'emote', tier: 'UNCOMMON' },
    { id: 'DANCE_MOVES', type: 'emote', tier: 'RARE' },
    { id: 'ZOMBIE_WALK', type: 'emote', tier: 'RARE' },
    { id: 'MOONWALK', type: 'emote', tier: 'EPIC' },
    { id: 'JUMP_ROPE', type: 'emote', tier: 'RARE' },
    { id: 'HEADBANG', type: 'emote', tier: 'UNCOMMON' },
    { id: 'SIT', type: 'emote', tier: 'COMMON' },
    { id: 'SLEEP', type: 'emote', tier: 'UNCOMMON' },
    { id: 'CLAP', type: 'emote', tier: 'COMMON' },
    { id: 'BOW', type: 'emote', tier: 'COMMON' },
    
    // PARTICLES
    { id: 'RISING_SOULS', type: 'particle', tier: 'EPIC' },
    { id: 'DEMONIC_AURA', type: 'particle', tier: 'EPIC' },
    { id: 'ENDERMAN', type: 'particle', tier: 'RARE' },
    { id: 'FIREFLIES', type: 'particle', tier: 'RARE' },
    { id: 'OCEAN_AURA', type: 'particle', tier: 'RARE' },
    { id: 'CHERRY_BLOSSOM_PARTICLES', type: 'particle', tier: 'EPIC' },
    { id: 'ENDER_GLIMMER', type: 'particle', tier: 'RARE' },
    { id: 'HEART_PARTICLES', type: 'particle', tier: 'UNCOMMON' },
    { id: 'MUSIC_NOTES', type: 'particle', tier: 'UNCOMMON' },
    { id: 'FLAME_AURA', type: 'particle', tier: 'EPIC' },
    { id: 'SNOW_AURA', type: 'particle', tier: 'RARE' },
    { id: 'RAINBOW_TRAIL', type: 'particle', tier: 'EPIC' },
    { id: 'SPARKLE_AURA', type: 'particle', tier: 'RARE' },
    { id: 'VOID_PARTICLES', type: 'particle', tier: 'EPIC' },
    { id: 'NATURE_AURA', type: 'particle', tier: 'RARE' },
    
    // PETS
    { id: 'BEE', type: 'pet', tier: 'RARE' },
    { id: 'RACCOON', type: 'pet', tier: 'RARE' },
    { id: 'DRAGON', type: 'pet', tier: 'EPIC' },
    { id: 'MINI_MOOSH', type: 'pet', tier: 'UNCOMMON' },
    { id: 'AXOLOTL', type: 'pet', tier: 'RARE' },
    { id: 'GHASTLING_PET', type: 'pet', tier: 'EPIC' },
    { id: 'WOLF_PET', type: 'pet', tier: 'UNCOMMON' },
    { id: 'CAT_PET', type: 'pet', tier: 'UNCOMMON' },
    { id: 'PARROT_PET', type: 'pet', tier: 'UNCOMMON' },
    { id: 'FOX_PET', type: 'pet', tier: 'RARE' },
    { id: 'PANDA_PET', type: 'pet', tier: 'RARE' },
    { id: 'POLAR_BEAR_PET', type: 'pet', tier: 'RARE' },
    { id: 'LLAMA_PET', type: 'pet', tier: 'UNCOMMON' },
    { id: 'RABBIT_PET', type: 'pet', tier: 'COMMON' },
    { id: 'CHICKEN_PET', type: 'pet', tier: 'COMMON' },
    { id: 'BABY_DRAGON', type: 'pet', tier: 'LEGENDARY' },
    { id: 'PHOENIX_PET', type: 'pet', tier: 'LEGENDARY' },
    { id: 'BABY_ENDERMAN', type: 'pet', tier: 'EPIC' },
    
    // HATS
    { id: 'DEMON_HORNS', type: 'hat', tier: 'EPIC' },
    { id: 'MASCOT_HEAD', type: 'hat', tier: 'LEGENDARY' },
    { id: 'TOP_HAT', type: 'hat', tier: 'RARE' },
    { id: 'COWBOY_HAT', type: 'hat', tier: 'RARE' },
    { id: 'CROWN', type: 'hat', tier: 'EPIC' },
    { id: 'SANTA_HAT', type: 'hat', tier: 'UNCOMMON' },
    { id: 'WITCH_HAT', type: 'hat', tier: 'RARE' },
    { id: 'BUNNY_EARS', type: 'hat', tier: 'UNCOMMON' },
    { id: 'CAT_EARS', type: 'hat', tier: 'UNCOMMON' },
    { id: 'VIKING_HELMET', type: 'hat', tier: 'EPIC' },
    { id: 'PIRATE_HAT', type: 'hat', tier: 'RARE' },
    { id: 'BEANIE', type: 'hat', tier: 'COMMON' },
    { id: 'Cap', type: 'hat', tier: 'COMMON' },
    { id: 'WIZARD_HAT', type: 'hat', tier: 'EPIC' },
    { id: 'ANGEL_HALO', type: 'hat', tier: 'RARE' },
    { id: 'DEVIL_HORNS', type: 'hat', tier: 'RARE' },
    
    // FULL_BODY
    { id: 'DEEP_DARK_DRAGON', type: 'full_body', tier: 'LEGENDARY' },
    { id: 'DEMONIC_OVERLORD_ARMOR', type: 'full_body', tier: 'LEGENDARY' },
    { id: 'Y2K_JACKET', type: 'full_body', tier: 'EPIC' },
    { id: 'MAID_OUTFIT', type: 'full_body', tier: 'EPIC' },
    { id: 'KNIGHT_ARMOR', type: 'full_body', tier: 'LEGENDARY' },
    { id: 'SAMURAI_ARMOR', type: 'full_body', tier: 'LEGENDARY' },
    { id: 'NUCLEAR_SUIT', type: 'full_body', tier: 'EPIC' },
    { id: 'ASTRONAUT_SUIT', type: 'full_body', tier: 'LEGENDARY' },
    { id: 'HOODIE', type: 'full_body', tier: 'UNCOMMON' },
    { id: 'TUXEDO', type: 'full_body', tier: 'EPIC' },
    { id: 'CASUAL_OUTFIT', type: 'full_body', tier: 'COMMON' },
    { id: 'ROBOT_SUIT', type: 'full_body', tier: 'LEGENDARY' },
    
    // ACCESSORIES
    { id: 'DEMONIC_CHARGE_UP', type: 'accessory', tier: 'EPIC' },
    { id: 'DEMONIC_OVERLORD_STAFF', type: 'accessory', tier: 'EPIC' },
    { id: 'SUPER_GAUNTLET', type: 'accessory', tier: 'EPIC' },
    { id: 'FANCY_BACKPACK', type: 'accessory', tier: 'RARE' },
    { id: 'WINGS_BACKPACK', type: 'accessory', tier: 'RARE' },
    { id: 'SWORD_BACK', type: 'accessory', tier: 'EPIC' },
    { id: 'SHIELD_BACK', type: 'accessory', tier: 'RARE' },
    { id: 'SCARF', type: 'accessory', tier: 'UNCOMMON' },
    { id: 'CAPE_PIN', type: 'accessory', tier: 'COMMON' },
    { id: 'BELT', type: 'accessory', tier: 'UNCOMMON' },
    { id: 'BANDANA', type: 'accessory', tier: 'COMMON' },
    { id: 'TAIL', type: 'accessory', tier: 'RARE' },
    { id: 'DRAGON_TAIL', type: 'accessory', tier: 'EPIC' },
    
    // CAPES
    { id: 'ENDERMAN_CAPE', type: 'cape', tier: 'RARE' },
    { id: 'DRAGON_CAPE', type: 'cape', tier: 'EPIC' },
    { id: 'CREEPER_CAPE', type: 'cape', tier: 'UNCOMMON' },
    { id: 'MINECON_CAPE', type: 'cape', tier: 'LEGENDARY' },
    { id: 'PRISMARINE_CAPE', type: 'cape', tier: 'RARE' },
    { id: 'BLAZE_CAPE', type: 'cape', tier: 'RARE' },
    { id: 'WITHER_CAPE', type: 'cape', tier: 'EPIC' },
    { id: 'SPIRAL_CAPE', type: 'cape', tier: 'RARE' },
    { id: 'STAR_CAPE', type: 'cape', tier: 'UNCOMMON' },
    { id: 'GRADIENT_CAPE', type: 'cape', tier: 'COMMON' },
];

// Texture sizes by type
const TEXTURE_SIZES: Record<string, [number, number]> = {
    'cape': [64, 32],
    'wings': [64, 64],
    'hat': [64, 64],
    'pet': [64, 64],
    'particle': [16, 16],
    'emote': [64, 64],
    'full_body': [128, 128],
    'accessory': [64, 64],
};

// ============================================================
// PNG GENERATION
// ============================================================

/**
 * Creates a simple PNG file with a solid color
 * PNG format: http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html
 */
function createSolidColorPNG(width: number, height: number, r: number, g: number, b: number): Buffer {
    // CRC32 lookup table
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[n] = c;
    }
    
    function crc32(data: Buffer): number {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8);  // bit depth
    ihdrData.writeUInt8(2, 9);  // color type (RGB)
    ihdrData.writeUInt8(0, 10); // compression
    ihdrData.writeUInt8(0, 11); // filter
    ihdrData.writeUInt8(0, 12); // interlace
    
    const ihdrChunk = Buffer.alloc(12 + 13);
    ihdrChunk.writeUInt32BE(13, 0);
    ihdrChunk.write('IHDR', 4, 'ascii');
    ihdrData.copy(ihdrChunk, 8);
    ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 21)), 21);
    
    // IDAT chunk (raw image data with filter bytes)
    const rawData: number[] = [];
    for (let y = 0; y < height; y++) {
        rawData.push(0); // filter byte (none)
        for (let x = 0; x < width; x++) {
            // Add some variation for texture interest
            const variation = Math.floor(Math.random() * 20) - 10;
            rawData.push(Math.max(0, Math.min(255, r + variation)));
            rawData.push(Math.max(0, Math.min(255, g + variation)));
            rawData.push(Math.max(0, Math.min(255, b + variation)));
        }
    }
    
    // Simple zlib deflate (uncompressed block)
    const rawBuffer = Buffer.from(rawData);
    const deflateData = Buffer.concat([
        Buffer.from([0x78, 0x9C]), // zlib header
        Buffer.from([0x01]), // final block, uncompressed
        Buffer.from([(rawBuffer.length & 0xFF), ((rawBuffer.length >> 8) & 0xFF)]), // len
        Buffer.from([~rawBuffer.length & 0xFF, ((~rawBuffer.length >> 8) & 0xFF)]), // nlen
        rawBuffer,
        Buffer.from([0x00, 0x00, 0x00, 0x00]) // adler32 placeholder (simplified)
    ]);
    
    const idatChunk = Buffer.alloc(12 + deflateData.length);
    idatChunk.writeUInt32BE(deflateData.length, 0);
    idatChunk.write('IDAT', 4, 'ascii');
    deflateData.copy(idatChunk, 8);
    idatChunk.writeUInt32BE(crc32(idatChunk.slice(4, 8 + deflateData.length)), 8 + deflateData.length);
    
    // IEND chunk
    const iendChunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Creates a more complex PNG with gradient and patterns
 */
function createPatternedPNG(width: number, height: number, r: number, g: number, b: number, pattern: string): Buffer {
    // For now, use simple solid color - pattern support can be expanded
    return createSolidColorPNG(width, height, r, g, b);
}

// ============================================================
// MAIN GENERATION
// ============================================================

function ensureDir(dir: string) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function generateTextures() {
    console.log('🎨 Generating textures...\n');
    
    ensureDir(COSMETICS_DIR);
    
    for (const cosmetic of COSMETICS) {
        const color = TIER_COLORS[cosmetic.tier] || TIER_COLORS['COMMON'];
        const [width, height] = TEXTURE_SIZES[cosmetic.type] || [64, 64];
        
        const png = createSolidColorPNG(width, height, color[0], color[1], color[2]);
        const texturePath = join(COSMETICS_DIR, `${cosmetic.id.toLowerCase()}.png`);
        
        writeFileSync(texturePath, png);
        console.log(`  ✓ ${cosmetic.id} (${cosmetic.type}, ${cosmetic.tier})`);
    }
    
    console.log(`\n✅ Generated ${COSMETICS.length} textures`);
}

function generateGeometryPlaceholders() {
    console.log('\n🔧 Generating geometry placeholders...\n');
    
    // Create placeholder geometries for emotes and particles
    const emoteGeometry = {
        format_version: "1.12.0",
        "minecraft:geometry": [{
            description: {
                identifier: "geometry.essential.emote",
                texture_width: 64,
                texture_height: 64,
                visible_bounds_width: 2,
                visible_bounds_height: 2,
                visible_bounds_offset: [0, 0, 0]
            },
            bones: [{
                name: "root",
                pivot: [0, 0, 0]
            }]
        }]
    };
    
    const particleGeometry = {
        format_version: "1.12.0",
        "minecraft:geometry": [{
            description: {
                identifier: "geometry.essential.particle",
                texture_width: 16,
                texture_height: 16,
                visible_bounds_width: 1,
                visible_bounds_height: 1,
                visible_bounds_offset: [0, 0, 0]
            },
            bones: [{
                name: "particle",
                pivot: [0, 0, 0],
                cubes: [{
                    origin: [-0.5, -0.5, -0.5],
                    size: [1, 1, 1],
                    uv: [0, 0]
                }]
            }]
        }]
    };
    
    const emotePath = join(STATIC_DIR, 'emote.json');
    const particlePath = join(STATIC_DIR, 'particle.json');
    
    writeFileSync(emotePath, JSON.stringify(emoteGeometry, null, 2));
    writeFileSync(particlePath, JSON.stringify(particleGeometry, null, 2));
    
    console.log('  ✓ emote.json');
    console.log('  ✓ particle.json');
    console.log('\n✅ Generated geometry placeholders');
}

function generateSeedUpdate() {
    console.log('\n📝 Generating seed update helper...\n');
    
    // Generate the mapping that should be used in seed.ts
    let output = `// Asset mapping for all ${COSMETICS.length} cosmetics\n`;
    output += `// Copy this mapping to the createCosmetic function\n\n`;
    output += `const ASSET_MAPPING: Record<string, { texture: string; geometry: string }> = {\n`;
    
    for (const cosmetic of COSMETICS) {
        const textureUrl = `${BASE_URL}/cosmetics/${cosmetic.id.toLowerCase()}.png`;
        const geometryFile = TYPE_GEOMETRY[cosmetic.type];
        output += `    "${cosmetic.id}": { texture: "${textureUrl}", geometry: "${geometryFile}" },\n`;
    }
    
    output += `};\n`;
    
    const mappingPath = join(__dirname, 'assetMapping.ts');
    writeFileSync(mappingPath, output);
    
    console.log(`  ✓ Generated assetMapping.ts with all URLs`);
    console.log('\n✅ Seed update helper generated');
}

function main() {
    console.log('═══════════════════════════════════════════');
    console.log('   Essential Cosmetics Asset Generator');
    console.log('═══════════════════════════════════════════\n');
    
    generateTextures();
    generateGeometryPlaceholders();
    generateSeedUpdate();
    
    console.log('\n═══════════════════════════════════════════');
    console.log('   Generation Complete!');
    console.log('═══════════════════════════════════════════');
    console.log(`\n📊 Summary:`);
    console.log(`   • Textures: ${COSMETICS.length} files in static/cosmetics/`);
    console.log(`   • Geometry: Multiple templates in static/`);
    console.log(`   • Helper: scripts/assetMapping.ts`);
    console.log(`\n🔄 Next steps:`);
    console.log(`   1. Update seed.ts to use generated asset URLs`);
    console.log(`   2. Replace placeholder textures with proper art`);
    console.log(`   3. Test cosmetics in-game`);
}

main();
