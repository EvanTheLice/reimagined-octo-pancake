import { Database } from "bun:sqlite";

function resolveDbPath() {
    return process.env.ESSENTIAL_DB_PATH || "essential.db";
}

let activeDbPath: string | null = null;
let activeDb: Database | null = null;

function initializeDatabase(database: Database) {
    database.run("PRAGMA foreign_keys = ON;");

    // Users
    database.run(`
      CREATE TABLE IF NOT EXISTS users (
        uuid TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        status TEXT DEFAULT 'OFFLINE',
        last_online INTEGER,
        coins INTEGER DEFAULT 0,
        rules_accepted INTEGER DEFAULT 0
      );
    `);

    try { database.run("ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0;"); } catch {}
    try { database.run("ALTER TABLE users ADD COLUMN rules_accepted INTEGER DEFAULT 0;"); } catch {}

    database.run(`
      CREATE TABLE IF NOT EXISTS cosmetics (
        id TEXT PRIMARY KEY,
        data JSON NOT NULL
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS user_cosmetics (
        user_uuid TEXT NOT NULL,
        cosmetic_id TEXT NOT NULL,
        unlocked_at INTEGER,
        data JSON,
        PRIMARY KEY (user_uuid, cosmetic_id)
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS relationships (
        user_a TEXT NOT NULL,
        user_b TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        since INTEGER,
        PRIMARY KEY (user_a, user_b)
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY,
        type TEXT,
        name TEXT,
        owner_uuid TEXT,
        created_at INTEGER
      );
    `);

    try { database.run("ALTER TABLE channels ADD COLUMN owner_uuid TEXT;"); } catch {}
    try { database.run("ALTER TABLE channels ADD COLUMN created_at INTEGER;"); } catch {}
    try { database.run("ALTER TABLE channels ADD COLUMN muted INTEGER DEFAULT 0;"); } catch {}

    database.run(`
      CREATE TABLE IF NOT EXISTS channel_members (
        channel_id INTEGER NOT NULL,
        user_uuid TEXT NOT NULL,
        PRIMARY KEY (channel_id, user_uuid)
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS channel_user_state (
        channel_id INTEGER NOT NULL,
        user_uuid TEXT NOT NULL,
        last_read_message_id INTEGER,
        muted INTEGER DEFAULT 0,
        PRIMARY KEY (channel_id, user_uuid)
      );
    `);
    try { database.run("ALTER TABLE channel_user_state ADD COLUMN muted INTEGER DEFAULT 0;"); } catch {}

    database.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        sender_uuid TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
    try { database.run("ALTER TABLE chat_messages ADD COLUMN edited_at INTEGER;"); } catch {}
    try { database.run("ALTER TABLE chat_messages ADD COLUMN deleted INTEGER DEFAULT 0;"); } catch {}
    try { database.run("ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER;"); } catch {}

    database.run(`
      CREATE TABLE IF NOT EXISTS user_skins (
        id TEXT PRIMARY KEY,
        user_uuid TEXT NOT NULL,
        name TEXT NOT NULL,
        model TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        favorited_at INTEGER,
        last_used_at INTEGER
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS user_outfits (
        id TEXT PRIMARY KEY,
        user_uuid TEXT NOT NULL,
        name TEXT NOT NULL,
        skin_id TEXT,
        skin_texture TEXT,
        equipped_json TEXT,
        settings_json TEXT,
        selected INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        user_uuid TEXT NOT NULL,
        title TEXT,
        description TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS emote_wheels (
        id TEXT PRIMARY KEY,
        user_uuid TEXT NOT NULL,
        selected INTEGER DEFAULT 0,
        slots_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS trusted_hosts (
        id TEXT PRIMARY KEY,
        user_uuid TEXT NOT NULL,
        name TEXT NOT NULL,
        domains_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    try {
        database.run(`
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_uuid TEXT NOT NULL,
                reported_uuid TEXT,
                message_id INTEGER,
                channel_id INTEGER,
                reason TEXT NOT NULL,
                details TEXT,
                status TEXT DEFAULT 'PENDING',
                created_at INTEGER NOT NULL
            )
        `);
    } catch {}

    try { database.run("ALTER TABLE user_outfits ADD COLUMN skin_texture TEXT;"); } catch {}
    try { database.run("ALTER TABLE user_outfits ADD COLUMN favorited_at INTEGER;"); } catch {}
}

function ensureDb() {
    const dbPath = resolveDbPath();
    if (activeDb && activeDbPath === dbPath) {
        return activeDb;
    }

    if (activeDb) {
        try {
            activeDb.close();
        } catch {}
    }

    activeDb = new Database(dbPath);
    activeDbPath = dbPath;
    initializeDatabase(activeDb);
    return activeDb;
}

export const db = new Proxy({} as Database, {
    get(_target, property) {
        const database = ensureDb() as unknown as Record<PropertyKey, unknown>;
        const value = database[property];
        return typeof value === "function" ? (value as Function).bind(database) : value;
    },
});

export function upsertUser(uuid: string, username: string) {
    const query = db.query("SELECT * FROM users WHERE uuid = ?");
    const existing = query.get(uuid);
    if (existing) {
        db.run("UPDATE users SET username = ?, last_online = ? WHERE uuid = ?", [username, Date.now(), uuid]);
    } else {
        db.run("INSERT INTO users (uuid, username, status, last_online) VALUES (?, ?, 'ONLINE', ?)", [uuid, username, Date.now()]);
    }
}

export function getUser(uuid: string): any { return db.query("SELECT * FROM users WHERE uuid = ?").get(uuid); }
export function getAllUsers(): any[] { return db.query("SELECT * FROM users").all(); }
export function setUserOffline(uuid: string) { db.run("UPDATE users SET status = 'OFFLINE', last_online = ? WHERE uuid = ?", [Date.now(), uuid]); }
export function getAllCosmetics(): any[] { 
  return db.query("SELECT id, data FROM cosmetics").all()
    .filter((r: any) => !r.id.startsWith('category_'))
    .map((r: any) => JSON.parse(r.data)); 
}

export function getAllCategories(): any[] { 
  return db.query("SELECT id, data FROM cosmetics").all()
    .filter((r: any) => r.id.startsWith('category_'))
    .map((r: any) => JSON.parse(r.data)); 
}

export function getUserCosmetics(uuid: string): any {
    const rows = db.query("SELECT cosmetic_id, data FROM user_cosmetics WHERE user_uuid = ?").all(uuid);
    const result: any = {};
    for (const row of rows as any[]) result[row.cosmetic_id] = JSON.parse(row.data);
    return result;
}

export function createRelationship(userA: string, userB: string, type: string, status: string = 'VERIFIED') {
    db.run("INSERT OR REPLACE INTO relationships (user_a, user_b, type, status, since) VALUES (?, ?, ?, ?, ?)", 
        [userA, userB, type, status, Date.now()]);
}

export function getRelationships(uuid: string): any[] {
    return db.query("SELECT * FROM relationships WHERE user_a = ?").all(uuid);
}

export function unlockCosmetic(userUuid: string, cosmeticId: string) {
    const data = { unlocked_at: Date.now(), gifted_by: null, wardrobe_unlock: true };
    db.run("INSERT OR REPLACE INTO user_cosmetics (user_uuid, cosmetic_id, unlocked_at, data) VALUES (?, ?, ?, ?)",
        [userUuid, cosmeticId, Date.now(), JSON.stringify(data)]);
}

export function saveChatChannel(channel: any, members: string[]) {
    db.run("INSERT OR REPLACE INTO channels (id, type, name, owner_uuid, created_at) VALUES (?, ?, ?, ?, ?)",
        [channel.id, channel.type, channel.name, channel.owner_uuid, channel.created_at]);
    db.run("DELETE FROM channel_members WHERE channel_id = ?", [channel.id]);
    for (const member of members) {
        db.run("INSERT INTO channel_members (channel_id, user_uuid) VALUES (?, ?)", [channel.id, member]);
    }
}

export function findDirectMessageChannel(uuidA: string, uuidB: string): any {
    return db.query(`
        SELECT c.* FROM channels c
        JOIN channel_members cm1 ON c.id = cm1.channel_id AND cm1.user_uuid = ?
        JOIN channel_members cm2 ON c.id = cm2.channel_id AND cm2.user_uuid = ?
        WHERE c.type = 'DIRECT_MESSAGE'
        LIMIT 1
    `).get(uuidA, uuidB);
}

export function getUserChannels(userUuid: string): any[] {
    const rows = db.query(`
        SELECT c.* FROM channels c
        JOIN channel_members cm ON c.id = cm.channel_id
        WHERE cm.user_uuid = ?
    `).all(userUuid);
    
    return rows.map((r: any) => ({
        ...r,
        members: db.query("SELECT user_uuid FROM channel_members WHERE channel_id = ?").all(r.id).map((m: any) => m.user_uuid)
    }));
}

export function saveChatMessage(channelId: number, senderUuid: string, content: string, timestamp: number, replyToId?: number | null) {
    const result = db.run(
        "INSERT INTO chat_messages (channel_id, sender_uuid, content, timestamp, reply_to_id) VALUES (?, ?, ?, ?, ?)",
        [channelId, senderUuid, content, timestamp, replyToId ?? null]
    );
    return Number(result.lastInsertRowid);
}

export function getChatMessages(channelId: number, limit: number, before?: number): any[] {
    let queryStr = "SELECT * FROM chat_messages WHERE channel_id = ? AND deleted = 0 ";
    const params: any[] = [channelId];
    if (before) { queryStr += "AND timestamp < ? "; params.push(before); }
    queryStr += "ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);
    return db.query(queryStr).all(...params).reverse();
}

// Chat Message operations
export function getChatMessage(messageId: number): any {
    return db.query("SELECT * FROM chat_messages WHERE id = ?").get(messageId);
}

export function updateChatMessage(messageId: number, content: string, editedAt: number): void {
    db.run("UPDATE chat_messages SET content = ?, edited_at = ? WHERE id = ?", [content, editedAt, messageId]);
}

export function softDeleteChatMessage(messageId: number): void {
    db.run("UPDATE chat_messages SET deleted = 1 WHERE id = ?", [messageId]);
}

export function createReport(reporterUuid: string, reportedUuid: string | null, messageId: number | null, channelId: number | null, reason: string, details: string | null): void {
    db.run(
        "INSERT INTO reports (reporter_uuid, reported_uuid, message_id, channel_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)",
        [reporterUuid, reportedUuid, messageId, channelId, reason, details, Date.now()]
    );
}

export function getChannelOwner(channelId: number): string | null {
    const row: any = db.query("SELECT owner_uuid FROM channels WHERE id = ?").get(channelId);
    return row?.owner_uuid || null;
}

export function saveUserSkin(skin: any) {
    db.run("INSERT OR REPLACE INTO user_skins (id, user_uuid, name, model, hash, created_at, favorited_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [skin.id, skin.user_uuid, skin.name, skin.model, skin.hash, skin.created_at, skin.favorited_at, skin.last_used_at]);
}

export function getUserSkins(userUuid: string): any[] { return db.query("SELECT * FROM user_skins WHERE user_uuid = ?").all(userUuid); }
export function getUserSkinById(userUuid: string, skinId: string): any {
    return db.query("SELECT * FROM user_skins WHERE user_uuid = ? AND id = ?").get(userUuid, skinId);
}
export function deleteUserSkin(skinId: string, userUuid: string) { db.run("DELETE FROM user_skins WHERE id = ? AND user_uuid = ?", [skinId, userUuid]); }
export function updateSkinLastUsed(skinId: string, userUuid: string) { db.run("UPDATE user_skins SET last_used_at = ? WHERE id = ? AND user_uuid = ?", [Date.now(), skinId, userUuid]); }
export function updateSkinFavorite(skinId: string, userUuid: string, favorited: boolean) { db.run("UPDATE user_skins SET favorited_at = ? WHERE id = ? AND user_uuid = ?", [favorited ? Date.now() : null, skinId, userUuid]); }
export function updateSkinName(skinId: string, userUuid: string, name: string) { db.run("UPDATE user_skins SET name = ? WHERE id = ? AND user_uuid = ?", [name, skinId, userUuid]); }
export function updateSkinData(skinId: string, userUuid: string, model: string, hash: string) {
    db.run("UPDATE user_skins SET model = ?, hash = ? WHERE id = ? AND user_uuid = ?", [model, hash, skinId, userUuid]);
}

export function saveUserOutfit(outfit: any) {
    db.run(
        "INSERT OR REPLACE INTO user_outfits (id, user_uuid, name, skin_id, skin_texture, equipped_json, settings_json, selected, created_at, favorited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            outfit.id,
            outfit.user_uuid,
            outfit.name,
            outfit.skin_id,
            outfit.skin_texture,
            outfit.equipped_json,
            outfit.settings_json,
            outfit.selected ? 1 : 0,
            outfit.created_at,
            outfit.favorited_at ?? null,
        ]
    );
}

export function getUserOutfits(userUuid: string): any[] { return db.query("SELECT * FROM user_outfits WHERE user_uuid = ?").all(userUuid); }
export function deleteUserOutfit(outfitId: string, userUuid: string) { db.run("DELETE FROM user_outfits WHERE id = ? AND user_uuid = ?", [outfitId, userUuid]); }
export function updateOutfitSelected(outfitId: string, userUuid: string) {
    db.run("UPDATE user_outfits SET selected = 0 WHERE user_uuid = ?", [userUuid]);
    db.run("UPDATE user_outfits SET selected = 1 WHERE id = ? AND user_uuid = ?", [outfitId, userUuid]);
}

export function updateOutfitEquipped(outfitId: string, userUuid: string, slot: string, cosmeticId: string | null) {
    const outfit: any = db.query("SELECT * FROM user_outfits WHERE id = ? AND user_uuid = ?").get(outfitId, userUuid);
    if (outfit) {
        const equipped = JSON.parse(outfit.equipped_json || "{}");
        if (cosmeticId) equipped[slot] = cosmeticId; else delete equipped[slot];
        db.run("UPDATE user_outfits SET equipped_json = ? WHERE id = ?", [JSON.stringify(equipped), outfitId]);
    }
}

export function updateOutfitSkin(outfitId: string, userUuid: string, skinId: string | null, skinTexture: string | null) {
    db.run("UPDATE user_outfits SET skin_id = ?, skin_texture = ? WHERE id = ? AND user_uuid = ?", [skinId, skinTexture, outfitId, userUuid]);
}

export function updateOutfitName(outfitId: string, userUuid: string, name: string) {
    db.run("UPDATE user_outfits SET name = ? WHERE id = ? AND user_uuid = ?", [name, outfitId, userUuid]);
}

export function updateOutfitFavorite(outfitId: string, userUuid: string, favorited: boolean) {
    db.run(
        "UPDATE user_outfits SET favorited_at = ? WHERE id = ? AND user_uuid = ?",
        [favorited ? Date.now() : null, outfitId, userUuid]
    );
}

export function updateOutfitSettings(outfitId: string, userUuid: string, cosmeticId: string, settings: any) {
    const outfit: any = db.query("SELECT * FROM user_outfits WHERE id = ? AND user_uuid = ?").get(outfitId, userUuid);
    if (outfit) {
        const allSettings = JSON.parse(outfit.settings_json || "{}");
        allSettings[cosmeticId] = settings;
        db.run("UPDATE user_outfits SET settings_json = ? WHERE id = ?", [JSON.stringify(allSettings), outfitId]);
    }
}

export function updateRulesAccepted(userUuid: string, accepted: boolean) { db.run("UPDATE users SET rules_accepted = ? WHERE uuid = ?", [accepted ? 1 : 0, userUuid]); }
export function hasAcceptedRules(userUuid: string): boolean {
    const row: any = db.query("SELECT rules_accepted FROM users WHERE uuid = ?").get(userUuid);
    return row ? row.rules_accepted === 1 : false;
}

export function saveMedia(media: any) {
    db.run(
        "INSERT OR REPLACE INTO media (id, user_uuid, title, description, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [media.id, media.user_uuid, media.title, media.description, JSON.stringify(media.metadata), media.created_at]
    );
}

export function getUserMedia(userUuid: string): any[] {
    return db.query("SELECT * FROM media WHERE user_uuid = ?").all(userUuid);
}

export function getUserMediaById(userUuid: string, mediaId: string): any {
    return db.query("SELECT * FROM media WHERE user_uuid = ? AND id = ?").get(userUuid, mediaId);
}

export function updateUserMedia(userUuid: string, mediaId: string, title: string | null, description: string | null, metadata: any): boolean {
    const result = db.run(
        "UPDATE media SET title = ?, description = ?, metadata_json = ? WHERE user_uuid = ? AND id = ?",
        [title, description, JSON.stringify(metadata), userUuid, mediaId]
    );
    return result.changes > 0;
}

export function deleteUserMedia(userUuid: string, mediaId: string): boolean {
    const result = db.run("DELETE FROM media WHERE user_uuid = ? AND id = ?", [userUuid, mediaId]);
    return result.changes > 0;
}

// Emote Wheels
export function getEmoteWheels(userUuid: string): any[] {
    return db.query("SELECT * FROM emote_wheels WHERE user_uuid = ?").all(userUuid);
}

export function saveEmoteWheel(wheel: any) {
    db.run("INSERT OR REPLACE INTO emote_wheels (id, user_uuid, selected, slots_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [wheel.id, wheel.user_uuid, wheel.selected ? 1 : 0, wheel.slots_json, wheel.created_at, wheel.updated_at]);
}

export function deleteEmoteWheel(wheelId: string, userUuid: string) {
    db.run("DELETE FROM emote_wheels WHERE id = ? AND user_uuid = ?", [wheelId, userUuid]);
}

export function selectEmoteWheel(wheelId: string, userUuid: string) {
    db.run("UPDATE emote_wheels SET selected = 0 WHERE user_uuid = ?", [userUuid]);
    db.run("UPDATE emote_wheels SET selected = 1 WHERE id = ? AND user_uuid = ?", [wheelId, userUuid]);
}

export function updateEmoteWheelSlots(wheelId: string, userUuid: string, slots: Record<number, string>) {
    db.run("UPDATE emote_wheels SET slots_json = ?, updated_at = ? WHERE id = ? AND user_uuid = ?",
        [JSON.stringify(slots), Date.now(), wheelId, userUuid]);
}

// Channel Member management
export function addChannelMember(channelId: number, userUuid: string): boolean {
    try {
        db.run("INSERT OR IGNORE INTO channel_members (channel_id, user_uuid) VALUES (?, ?)", [channelId, userUuid]);
        return true;
    } catch (e) {
        return false;
    }
}

export function removeChannelMember(channelId: number, userUuid: string): boolean {
    const result = db.run("DELETE FROM channel_members WHERE channel_id = ? AND user_uuid = ?", [channelId, userUuid]);
    return result.changes > 0;
}

export function getChannelMembers(channelId: number): string[] {
    const rows = db.query("SELECT user_uuid FROM channel_members WHERE channel_id = ?").all(channelId) as any[];
    return rows.map(r => r.user_uuid);
}

export function isChannelMember(channelId: number, userUuid: string): boolean {
    const row = db.query("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_uuid = ?").get(channelId, userUuid);
    return !!row;
}

export function updateChannelMuted(channelId: number, muted: boolean): void {
    db.run("UPDATE channels SET muted = ? WHERE id = ?", [muted ? 1 : 0, channelId]);
}

export function getChannel(channelId: number): any {
    return db.query("SELECT * FROM channels WHERE id = ?").get(channelId);
}

export function resetDatabase() {
    db.run("DELETE FROM channel_user_state");
    db.run("DELETE FROM trusted_hosts");
    db.run("DELETE FROM reports");
    db.run("DELETE FROM emote_wheels");
    db.run("DELETE FROM media");
    db.run("DELETE FROM user_outfits");
    db.run("DELETE FROM user_skins");
    db.run("DELETE FROM chat_messages");
    db.run("DELETE FROM channel_members");
    db.run("DELETE FROM channels");
    db.run("DELETE FROM relationships");
    db.run("DELETE FROM user_cosmetics");
    db.run("DELETE FROM cosmetics");
    db.run("DELETE FROM users");
}
