import { db } from './db';
import { logger } from "./logger";
import { calculateFileChecksum } from "./utils/checksum";
import { existsSync } from "fs";

interface CosmeticAsset {
    a: string;
    b: string;
}

interface Cosmetic {
    a: string;
    b: string;
    c: { [lang: string]: string };
    f: number;
    g: { [currency: string]: number };
    h: string[];
    i: number;
    j: null | number;
    k: null | number;
    show_timer_after: null | number;
    l: { [part: string]: boolean };
    m: { [category: string]: number };
    n: number;
    o: number;
    p: string;
    q: { [file: string]: CosmeticAsset };
}

const BASE_URL = "http://127.0.0.1:8080/static";
const TIMESTAMP = 1609459200000;

let packageId = 1000;

const GEOMETRY_MAP: Record<string, string> = {
    cape: "cape.json",
    wings: "wings.json",
    hat: "hat.json",
    pet: "pet_quadruped.json",
    particle: "particle.json",
    emote: "emote.json",
    full_body: "outfit_full_body.json",
    accessory: "backpack.json",
};

function getChecksum(filePath: string): string {
    const fullPath = `./static/${filePath}`;
    if (existsSync(fullPath)) {
        return calculateFileChecksum(fullPath);
    }
    logger.warn({ filePath }, "File not found for checksum, using placeholder");
    return "a" .repeat(64);
}

function createCosmetic(
    id: string,
    type: string,
    displayName: string,
    tier: string,
    coinPrice: number,
    usdPrice: number,
    category: string,
    tags: string[] = [],
    skinLayers: { [part: string]: boolean } = {},
    geometryOverride?: string
): Cosmetic {
    const geometryFile = geometryOverride || GEOMETRY_MAP[type] || "cape.json";
    const textureFile = `cosmetics/${id.toLowerCase()}.png`;
    
    return {
        a: id,
        b: type,
        c: { en_us: displayName },
        f: packageId++,
        g: { USD: usdPrice },
        h: tags,
        i: TIMESTAMP,
        j: null,
        k: null,
        show_timer_after: null,
        l: skinLayers,
        m: { [category]: 0 },
        n: 0,
        o: coinPrice,
        p: tier,
        q: {
            "texture.png": { a: `${BASE_URL}/${textureFile}`, b: getChecksum(textureFile) },
            "geometry.steve.json": { a: `${BASE_URL}/${geometryFile}`, b: getChecksum(geometryFile) }
        }
    };
}

const ORIGINAL_COSMETICS: Cosmetic[] = [
    {
        a: "essential_cape_black",
        b: "cape",
        c: { "en_us": "Black Essential Cape" },
        f: 0,
        g: { "USD": 0.0 },
        h: [],
        i: TIMESTAMP,
        j: null,
        k: null,
        show_timer_after: null,
        l: { "CAPE": true },
        m: { "capes": 0 },
        n: 0,
        o: 0,
        p: "COMMON",
        q: {
            "texture.png": { a: `${BASE_URL}/cosmetics/essential_cape_black.png`, b: getChecksum("cosmetics/essential_cape_black.png") },
            "geometry.steve.json": { a: `${BASE_URL}/cape.json`, b: getChecksum("cape.json") }
        }
    },
    {
        a: "essential_cape_free",
        b: "cape",
        c: { "en_us": "Free Cape" },
        f: 1,
        g: { "USD": 0.0 },
        h: ["featured"],
        i: TIMESTAMP,
        j: null,
        k: null,
        show_timer_after: null,
        l: { "CAPE": true },
        m: { "capes": 0 },
        n: 0,
        o: 0,
        p: "RARE",
        q: {
            "texture.png": { a: `${BASE_URL}/capes/free.png`, b: getChecksum("capes/free.png") },
            "geometry.steve.json": { a: `${BASE_URL}/cape.json`, b: getChecksum("cape.json") }
        }
    },
    {
        a: "essential_wings_white",
        b: "wings",
        c: { "en_us": "White Wings" },
        f: 2,
        g: { "USD": 5.0 },
        h: ["premium"],
        i: TIMESTAMP,
        j: null,
        k: null,
        show_timer_after: null,
        l: {},
        m: { "wings": 0 },
        n: 0,
        o: 1000,
        p: "EPIC",
        q: {
            "texture.png": { a: `${BASE_URL}/cosmetics/essential_wings_white.png`, b: getChecksum("cosmetics/essential_wings_white.png") },
            "geometry.steve.json": { a: `${BASE_URL}/wings.json`, b: getChecksum("wings.json") }
        }
    }
];

const WINGS_COSMETICS: Cosmetic[] = [
    createCosmetic("UNDEAD_WINGS", "wings", "Undead Wings", "EPIC", 1200, 6.00, "wings", ["featured"]),
    createCosmetic("DOUBLE_DEMONIC_OVERLORD_WINGS", "wings", "Demonic Overlord Wings", "LEGENDARY", 2500, 12.00, "wings", ["featured"]),
    createCosmetic("DRAGON_WINGS", "wings", "Dragon Wings", "EPIC", 1500, 8.00, "wings", []),
    createCosmetic("DEMONIC_WINGS", "wings", "Demonic Wings", "RARE", 800, 4.00, "wings", []),
    createCosmetic("MECHANICAL_WINGS", "wings", "Mechanical Wings", "EPIC", 1400, 7.00, "wings", ["tech"]),
    createCosmetic("ANGEL_WINGS", "wings", "Angel Wings", "RARE", 900, 4.50, "wings", []),
    createCosmetic("FALLEN_ANGEL_WINGS", "wings", "Fallen Angel Wings", "EPIC", 1300, 6.50, "wings", ["dark"]),
    createCosmetic("BUTTERFLY_WINGS", "wings", "Butterfly Wings", "UNCOMMON", 500, 2.50, "wings", []),
    createCosmetic("PIXIE_WINGS", "wings", "Pixie Wings", "UNCOMMON", 400, 2.00, "wings", []),
    createCosmetic("COSMIC_WINGS", "wings", "Cosmic Wings", "LEGENDARY", 3000, 15.00, "wings", ["space", "featured"]),
];

const CAPE_COSMETICS: Cosmetic[] = [
    createCosmetic("MINECON_CAPE", "cape", "Minecon Cape", "LEGENDARY", 5000, 25.00, "capes", ["rare", "event"]),
    createCosmetic("MOJANG_CAPE", "cape", "Mojang Cape", "LEGENDARY", 10000, 50.00, "capes", ["official"]),
    createCosmetic("SPIRAL_CAPE", "cape", "Spiral Cape", "EPIC", 1200, 6.00, "capes", ["pattern"]),
    createCosmetic("DRAGON_CAPE", "cape", "Dragon Cape", "EPIC", 1500, 7.50, "capes", []),
    createCosmetic("HEROBRINE_CAPE", "cape", "Herobrine Cape", "LEGENDARY", 3000, 15.00, "capes", ["creepy"]),
    createCosmetic("ENDER_CAPE", "cape", "Ender Cape", "RARE", 1000, 5.00, "capes", []),
    createCosmetic("RAINBOW_CAPE", "cape", "Rainbow Cape", "EPIC", 1800, 9.00, "capes", ["colorful"]),
    createCosmetic("FIRE_CAPE", "cape", "Fire Cape", "EPIC", 1600, 8.00, "capes", []),
    createCosmetic("ICE_CAPE", "cape", "Ice Cape", "RARE", 900, 4.50, "capes", []),
    createCosmetic("GOLDEN_CAPE", "cape", "Golden Cape", "RARE", 1100, 5.50, "capes", []),
    createCosmetic("ROYAL_CAPE", "cape", "Royal Cape", "EPIC", 1400, 7.00, "capes", []),
    createCosmetic("NINJA_CAPE", "cape", "Ninja Cape", "UNCOMMON", 600, 3.00, "capes", []),
];

const HAT_COSMETICS: Cosmetic[] = [
    createCosmetic("TOP_HAT", "hat", "Top Hat", "UNCOMMON", 300, 1.50, "hats", []),
    createCosmetic("FEDORA", "hat", "Fedora", "COMMON", 200, 1.00, "hats", []),
    createCosmetic("SANTA_HAT", "hat", "Santa Hat", "RARE", 800, 4.00, "hats", ["holiday"]),
    createCosmetic("PARTY_HAT", "hat", "Party Hat", "UNCOMMON", 400, 2.00, "hats", ["celebration"]),
    createCosmetic("CROWN", "hat", "Crown", "LEGENDARY", 2000, 10.00, "hats", ["royal"]),
    createCosmetic("HOOD", "hat", "Dark Hood", "RARE", 700, 3.50, "hats", ["dark"]),
    createCosmetic("HEADPHONES", "hat", "Headphones", "UNCOMMON", 500, 2.50, "hats", ["tech"]),
    createCosmetic("WIZARD_HAT", "hat", "Wizard Hat", "EPIC", 1000, 5.00, "hats", ["magic"]),
    createCosmetic("HALO", "hat", "Angel Halo", "EPIC", 1200, 6.00, "hats", []),
    createCosmetic("HORNS", "hat", "Demon Horns", "RARE", 850, 4.25, "hats", ["dark"]),
];

const PET_COSMETICS: Cosmetic[] = [
    createCosmetic("PET_DRAGON", "pet", "Dragon Pet", "LEGENDARY", 5000, 25.00, "pets", ["epic"]),
    createCosmetic("PET_DOG", "pet", "Dog Pet", "COMMON", 100, 0.50, "pets", []),
    createCosmetic("PET_CAT", "pet", "Cat Pet", "COMMON", 100, 0.50, "pets", []),
    createCosmetic("PET_FOX", "pet", "Fox Pet", "UNCOMMON", 300, 1.50, "pets", []),
    createCosmetic("PET_PANDA", "pet", "Panda Pet", "RARE", 800, 4.00, "pets", ["cute"]),
    createCosmetic("PET_PARROT", "pet", "Parrot Pet", "UNCOMMON", 400, 2.00, "pets", []),
    createCosmetic("PET_WOLF", "pet", "Wolf Pet", "UNCOMMON", 350, 1.75, "pets", []),
    createCosmetic("PET_TURTLE", "pet", "Turtle Pet", "RARE", 600, 3.00, "pets", []),
    createCosmetic("PET_BEE", "pet", "Bee Pet", "COMMON", 150, 0.75, "pets", ["cute"]),
    createCosmetic("PET_SLIME", "pet", "Slime Pet", "UNCOMMON", 250, 1.25, "pets", []),
];

const EMOTE_COSMETICS: Cosmetic[] = [
    createCosmetic("EMOTE_SIT", "emote", "Sit Emote", "COMMON", 50, 0.25, "emotes", []),
    createCosmetic("EMOTE_WAVE", "emote", "Wave Emote", "COMMON", 50, 0.25, "emotes", []),
    createCosmetic("EMOTE_DANCE", "emote", "Dance Emote", "UNCOMMON", 200, 1.00, "emotes", []),
    createCosmetic("EMOTE_DAB", "emote", "Dab Emote", "RARE", 500, 2.50, "emotes", ["trendy"]),
    createCosmetic("EMOTE_FLOSS", "emote", "Floss Emote", "EPIC", 1000, 5.00, "emotes", ["viral"]),
    createCosmetic("EMOTE_TPOSE", "emote", "T-Pose Emote", "UNCOMMON", 250, 1.25, "emotes", []),
    createCosmetic("EMOTE_CLAP", "emote", "Clap Emote", "COMMON", 75, 0.35, "emotes", []),
    createCosmetic("EMOTE_FACEPALM", "emote", "Facepalm Emote", "UNCOMMON", 300, 1.50, "emotes", []),
    createCosmetic("EMOTE_LAUGH", "emote", "Laugh Emote", "RARE", 600, 3.00, "emotes", []),
    createCosmetic("EMOTE_CRY", "emote", "Cry Emote", "COMMON", 100, 0.50, "emotes", []),
];

const ACCESSORY_COSMETICS: Cosmetic[] = [
    createCosmetic("BACKPACK", "accessory", "Backpack", "UNCOMMON", 400, 2.00, "accessories", []),
    createCosmetic("SWORD_BACK", "accessory", "Back Sword", "RARE", 800, 4.00, "accessories", ["weapon"]),
    createCosmetic("SHIELD_BACK", "accessory", "Back Shield", "UNCOMMON", 450, 2.25, "accessories", []),
    createCosmetic("QUIVER", "accessory", "Quiver", "COMMON", 200, 1.00, "accessories", []),
    createCosmetic("WINGS_SMALL", "accessory", "Small Wings", "UNCOMMON", 600, 3.00, "accessories", []),
];

const ALL_COSMETICS = [
    ...ORIGINAL_COSMETICS,
    ...WINGS_COSMETICS,
    ...CAPE_COSMETICS,
    ...HAT_COSMETICS,
    ...PET_COSMETICS,
    ...EMOTE_COSMETICS,
    ...ACCESSORY_COSMETICS
];

const CATEGORIES = [
    { a: "capes", b: { "en_us": "Capes" }, c: { a: "cape", b: "deadb33f" }, d: ["CAPE"], e: [], f: 0, g: null, h: null, i: {}, j: {} },
    { a: "wings", b: { "en_us": "Wings" }, c: { a: "wings", b: "deadb33f" }, d: ["WINGS"], e: [], f: 1, g: null, h: null, i: {}, j: {} },
    { a: "hats", b: { "en_us": "Hats" }, c: { a: "hat", b: "deadb33f" }, d: ["HAT"], e: [], f: 2, g: null, h: null, i: {}, j: {} },
    { a: "pets", b: { "en_us": "Pets" }, c: { a: "pet", b: "deadb33f" }, d: ["PET"], e: [], f: 3, g: null, h: null, i: {}, j: {} },
    { a: "emotes", b: { "en_us": "Emotes" }, c: { a: "emote", b: "deadb33f" }, d: ["EMOTE"], e: [], f: 4, g: null, h: null, i: {}, j: {} },
    { a: "accessories", b: { "en_us": "Accessories" }, c: { a: "accessory", b: "deadb33f" }, d: ["BACK", "FACE"], e: [], f: 5, g: null, h: null, i: {}, j: {} },
];

export function seedDatabase() {
    logger.info("Seeding database with cosmetics...");

    for (const cosmetic of ALL_COSMETICS) {
        db.run("INSERT OR REPLACE INTO cosmetics (id, data) VALUES (?, ?)", [cosmetic.a, JSON.stringify(cosmetic)]);
    }

    for (const category of CATEGORIES) {
        db.run("INSERT OR REPLACE INTO cosmetics (id, data) VALUES (?, ?)", ["category_" + category.a, JSON.stringify(category)]);
    }

    logger.info(`Seeded ${ALL_COSMETICS.length} cosmetics and ${CATEGORIES.length} categories`);
}

if (import.meta.main) {
    seedDatabase();
}
