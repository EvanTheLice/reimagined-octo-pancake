import * as db from "../db";
import { getChannelMuted, getChannelLastReadMessageId, getUnreadMessageCount, setChannelMuted } from "../chatStateStore";
import { logger } from "../logger";
import { v4 as uuidv4 } from 'uuid';
import { EmoteWheel, DEFAULT_EMOTE_SLOTS } from "./EmoteWheel";
export class User {
    public readonly uuid: string;
    public username: string;
    public status: string = 'OFFLINE';
    public lastOnline: number = Date.now();
    public coins: number = 0; public rulesAccepted: boolean = false;

    constructor(uuid: string, username: string = "Unknown") {
        this.uuid = uuid;
        this.username = username;
        this.load();
    }
    private load() {
        const data: any = db.db.query("SELECT * FROM users WHERE uuid = ?").get(this.uuid);
        if (data) {
            this.username = data.username;
            this.status = data.status || 'OFFLINE';
            this.lastOnline = data.last_online;
            this.coins = data.coins !== null ? data.coins : 0;
            this.rulesAccepted = data.rules_accepted === 1;
        } else {
            this.save();
            this.importSkinFromMojang().then(skin => {
                if (skin) {
                    logger.info({ user: this.username, skinId: skin.id }, "Auto-imported skin from Mojang for new user");
                }
            });
        }
    }

    public save() {
        db.db.run(
            "INSERT OR REPLACE INTO users (uuid, username, status, last_online, coins, rules_accepted) VALUES (?, ?, ?, ?, ?, ?)",
            [this.uuid, this.username, this.status, this.lastOnline, this.coins, this.rulesAccepted ? 1 : 0]
        );
    }

    public setOnline(online: boolean) {
        this.status = online ? 'ONLINE' : 'OFFLINE';
        this.lastOnline = Date.now();
        this.save();
        logger.debug({ user: this.username, online }, "User status updated");
    }

    public acceptRules() {
        this.rulesAccepted = true;
        this.save();
        logger.info({ user: this.username }, "User agreed to community rules");
    }

    public unlockCosmetic(cosmeticId: string) {
        const unlockData = { unlocked_at: Date.now(), gifted_by: null, wardrobe_unlock: true };
        db.db.run("INSERT OR REPLACE INTO user_cosmetics (user_uuid, cosmetic_id, unlocked_at, data) VALUES (?, ?, ?, ?)",
            [this.uuid, cosmeticId, Date.now(), JSON.stringify(unlockData)]);
    }

    public getUnlockedCosmetics(): any {
        const rows = db.db.query("SELECT cosmetic_id, data FROM user_cosmetics WHERE user_uuid = ?").all(this.uuid);
        const result: any = {};
        for (const row of rows as any[]) result[row.cosmetic_id] = JSON.parse(row.data);
        return result;
    }
    public getRelationships(): any[] {
        const rows = db.db.query("SELECT * FROM relationships WHERE user_a = ?").all(this.uuid);
        return rows.map((r: any) => ({
            a: r.user_a,
            b: r.user_b,
            c: r.type.toUpperCase(),
            d: r.status.toUpperCase(),
            e: r.since || 1704067200000
        }));
    }

    public setRelationship(targetUuid: string, type: string, status: string = 'VERIFIED') {
        const upperType = type.toUpperCase();
        const upperStatus = status.toUpperCase();
        db.db.run("INSERT OR REPLACE INTO relationships (user_a, user_b, type, status, since) VALUES (?, ?, ?, ?, ?)",
            [this.uuid, targetUuid, upperType, upperStatus, Date.now()]);
        db.db.run("INSERT OR REPLACE INTO relationships (user_a, user_b, type, status, since) VALUES (?, ?, ?, ?, ?)",
            [targetUuid, this.uuid, upperType, upperStatus, Date.now()]);
    }
    public getIncomingFriendRequests(): any[] {
        const rows = db.db.query(
            "SELECT * FROM relationships WHERE user_b = ? AND type = 'FRIENDS' AND status = 'PENDING'"
        ).all(this.uuid);
        return rows.map((r: any) => ({
            a: r.user_a,
            b: r.user_b,
            c: r.type.toUpperCase(),
            d: r.status.toUpperCase(),
            e: r.since || 1704067200000
        }));
    }

    public getOutgoingFriendRequests(): any[] {
        const rows = db.db.query(
            "SELECT * FROM relationships WHERE user_a = ? AND type = 'FRIENDS' AND status = 'PENDING'"
        ).all(this.uuid);
        return rows.map((r: any) => ({
            a: r.user_a,
            b: r.user_b,
            c: r.type.toUpperCase(),
            d: r.status.toUpperCase(),
            e: r.since || 1704067200000
        }));
    }

    public hasIncomingFriendRequest(fromUuid: string): boolean {
        const row = db.db.query(
            "SELECT * FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS' AND status = 'PENDING'"
        ).get(fromUuid, this.uuid);
        return !!row;
    }

    public hasOutgoingFriendRequest(toUuid: string): boolean {
        const row = db.db.query(
            "SELECT * FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS' AND status = 'PENDING'"
        ).get(this.uuid, toUuid);
        return !!row;
    }

    public isFriendWith(otherUuid: string): boolean {
        const row = db.db.query(
            "SELECT * FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS' AND status = 'VERIFIED'"
        ).get(this.uuid, otherUuid);
        return !!row;
    }

    public createFriendRequest(targetUuid: string): void {
        db.db.run(
            "INSERT OR REPLACE INTO relationships (user_a, user_b, type, status, since) VALUES (?, ?, 'FRIENDS', 'PENDING', ?)",
            [this.uuid, targetUuid, Date.now()]
        );
    }

    public acceptFriendRequest(fromUuid: string): void {
        const now = Date.now();
        // Update the incoming request to VERIFIED
        db.db.run(
            "UPDATE relationships SET status = 'VERIFIED', since = ? WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS' AND status = 'PENDING'",
            [now, fromUuid, this.uuid]
        );
        // Create reverse VERIFIED relationship
        db.db.run(
            "INSERT OR REPLACE INTO relationships (user_a, user_b, type, status, since) VALUES (?, ?, 'FRIENDS', 'VERIFIED', ?)",
            [this.uuid, fromUuid, now]
        );
    }

    public declineFriendRequest(fromUuid: string): void {
        // Delete the PENDING relationship
        db.db.run(
            "DELETE FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS' AND status = 'PENDING'",
            [fromUuid, this.uuid]
        );
    }

    public cancelFriendRequest(toUuid: string): void {
        // Delete the outgoing PENDING relationship
        db.db.run(
            "DELETE FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS' AND status = 'PENDING'",
            [this.uuid, toUuid]
        );
    }

    public removeFriend(otherUuid: string): void {
        // Remove both directions
        db.db.run("DELETE FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS'", [this.uuid, otherUuid]);
        db.db.run("DELETE FROM relationships WHERE user_a = ? AND user_b = ? AND type = 'FRIENDS'", [otherUuid, this.uuid]);
    }

    public getRelationshipWith(otherUuid: string): any | null {
        const row = db.db.query("SELECT * FROM relationships WHERE user_a = ? AND user_b = ?").get(this.uuid, otherUuid);
        if (!row) return null;
        const r = row as any;
        return {
            a: r.user_a,
            b: r.user_b,
            c: r.type.toUpperCase(),
            d: r.status.toUpperCase(),
            e: r.since || 1704067200000
        };
    }

    public deleteRelationship(otherUuid: string, type: string): boolean {
        const upperType = type.toUpperCase();
        const result = db.db.run(
            "DELETE FROM relationships WHERE user_a = ? AND user_b = ? AND type = ?",
            [this.uuid, otherUuid, upperType]
        );
        return result.changes > 0;
    }

    public createSkin(name: string, model: string, hash: string, favorite: boolean): any {
        const skin = { id: uuidv4(), user_uuid: this.uuid, name, model: model.toUpperCase(), hash, created_at: Date.now(), favorited_at: favorite ? Date.now() : null, last_used_at: Date.now() };
        db.saveUserSkin(skin);
        return skin;
    }

    public deleteSkin(skinId: string) { db.deleteUserSkin(skinId, this.uuid); }
    public updateSkinData(skinId: string, model: string, hash: string) { db.updateSkinData(skinId, this.uuid, model, hash); }
    public updateSkinLastUsed(skinId: string) { db.updateSkinLastUsed(skinId, this.uuid); }
    public updateSkinFavorite(skinId: string, favorited: boolean) { db.updateSkinFavorite(skinId, this.uuid, favorited); }
    public updateSkinName(skinId: string, name: string) { db.updateSkinName(skinId, this.uuid, name); }

    public getSkins(): any[] {
        const rows = db.getUserSkins(this.uuid);
        return rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            model: r.model.toUpperCase(),
            hash: r.hash,
            created_at: r.created_at,
            favorited_at: r.favorited_at,
            last_used_at: r.last_used_at
        }));
    }

    public async importSkinFromMojang(): Promise<any | null> {
        try {
            // Fetch profile from Mojang API
            const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${this.username}`);
            if (!profileRes.ok) return null;
            
            const profile = await profileRes.json();
            const uuid = profile.id;
            
            // Fetch skin from Mojang session server
            const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
            if (!sessionRes.ok) return null;
            
            const session = await sessionRes.json();
            const textures = session.properties?.find((p: any) => p.name === "textures")?.value;
            if (!textures) return null;
            
            const decoded = JSON.parse(Buffer.from(textures, 'base64').toString());
            const skinUrl = decoded.textures?.SKIN?.url;
            const skinModel = decoded.textures?.SKIN?.metadata?.model || "classic";
            if (!skinUrl) return null;
            
            // Download skin and calculate hash
            const skinRes = await fetch(skinUrl);
            if (!skinRes.ok) return null;
            
            const skinBuffer = Buffer.from(await skinRes.arrayBuffer());
            const hash = require('crypto').createHash('sha256').update(skinBuffer).digest('hex');
            
            // Save skin to database
            const skin = {
                id: uuidv4(),
                user_uuid: this.uuid,
                name: `${this.username}'s Skin`,
                model: skinModel.toUpperCase(),
                hash: hash,
                created_at: Date.now(),
                favorited_at: null,
                last_used_at: Date.now()
            };
            db.saveUserSkin(skin);
            
            logger.info({ user: this.username, skinId: skin.id }, "Auto-imported skin from Mojang");
            return skin;
        } catch (e) {
            logger.error({ user: this.username, error: e }, "Failed to import skin from Mojang");
            return null;
        }
    }

    public createOutfit(name: string, skinId: string, equipped: any = {}, settings: any = {}): any {
        const outfit = {
            id: uuidv4(),
            user_uuid: this.uuid,
            name,
            skin_id: skinId,
            skin_texture: null,
            equipped_json: JSON.stringify(equipped),
            settings_json: JSON.stringify(settings),
            selected: true,
            created_at: Date.now(),
            favorited_at: null
        };
        db.saveUserOutfit(outfit);
        this.selectOutfit(outfit.id);
        return outfit;
    }

    public selectOutfit(outfitId: string) { db.updateOutfitSelected(outfitId, this.uuid); }
    public deleteOutfit(outfitId: string) { db.deleteUserOutfit(outfitId, this.uuid); }
    public updateOutfitEquipped(outfitId: string, slot: string, cosmeticId: string | null) { db.updateOutfitEquipped(outfitId, this.uuid, slot, cosmeticId); }
    public updateOutfitSkin(outfitId: string, skinId: string | null, skinTexture: string | null) { db.updateOutfitSkin(outfitId, this.uuid, skinId, skinTexture); }
    public updateOutfitName(outfitId: string, name: string) { db.updateOutfitName(outfitId, this.uuid, name); }
    public updateOutfitSettings(outfitId: string, cosmeticId: string, settings: any) { db.updateOutfitSettings(outfitId, this.uuid, cosmeticId, settings); }

    public updateOutfitFavorite(outfitId: string, favorited: boolean) {
        db.updateOutfitFavorite(outfitId, this.uuid, favorited);
    }

    public getOutfits(): any[] {
        const rows = db.db.query("SELECT * FROM user_outfits WHERE user_uuid = ?").all(this.uuid);
        
        // Auto-create default outfit if none exists
        if (rows.length === 0) {
            const outfitId = uuidv4();
            const now = Date.now();
            db.db.run(
                "INSERT INTO user_outfits (id, user_uuid, name, skin_id, skin_texture, equipped_json, settings_json, selected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [outfitId, this.uuid, "Default", null, null, "{}", "{}", 1, now]
            );
            logger.info({ user: this.username, outfitId }, "Auto-created default outfit");
            return [{ a: outfitId, b: "Default", c: null, d: {}, e: {}, f: true, g: now, h: null, j: null }];
        }
        
        return rows.map((r: any) => ({
            a: r.id,
            b: r.name,
            c: r.skin_texture,
            d: JSON.parse(r.equipped_json || "{}"),
            e: JSON.parse(r.settings_json || "{}"),
            f: r.selected === 1,
            g: r.created_at,
            h: r.favorited_at,
            j: r.skin_id
        }));
    }

    public getSelectedOutfitId(): string | null {
        const outfits = this.getOutfits();
        const selected = outfits.find(o => o.f);
        return selected ? selected.a : (outfits.length > 0 ? outfits[0].a : null);
    }

    public getChannels(): any[] {
        const rows = db.getUserChannels(this.uuid);
        return rows.map((r: any) => {
            const lastReadMessageId = getChannelLastReadMessageId(r.id, this.uuid);

            return {
                a: r.id,
                b: r.type,
                c: r.name,
                d: null,
                e: null,
                f: r.members,
                g: { a: r.created_at, b: r.owner_uuid },
                h: null,
                i: getChannelMuted(r.id, this.uuid),
                joined_at: r.created_at,
                last_read_message_id: lastReadMessageId,
                unread_messages: getUnreadMessageCount(r.id, this.uuid, lastReadMessageId)
            };
        });
    }

    public isChannelOwner(channelId: number): boolean {
        const row: any = db.db.query("SELECT owner_uuid FROM channels WHERE id = ?").get(channelId);
        return row?.owner_uuid === this.uuid;
    }

    public addChannelMember(channelId: number, memberUuid: string): boolean {
        // Check if user is owner
        if (!this.isChannelOwner(channelId)) return false;
        
        // Insert into channel_members
        return db.addChannelMember(channelId, memberUuid);
    }

    public removeChannelMember(channelId: number, memberUuid: string): boolean {
        // Allow if owner or self-removal
        if (!this.isChannelOwner(channelId) && memberUuid !== this.uuid) return false;
        
        // Cannot remove owner
        const row: any = db.db.query("SELECT owner_uuid FROM channels WHERE id = ?").get(channelId);
        if (row?.owner_uuid === memberUuid) return false;
        
        return db.removeChannelMember(channelId, memberUuid);
    }

    public muteChannel(channelId: number, muted: boolean): void {
        setChannelMuted(channelId, this.uuid, muted);
    }

    public addMedia(id: string, title: string | null, description: string | null, metadata: any) {
        db.saveMedia({
            id,
            user_uuid: this.uuid,
            title,
            description,
            metadata,
            created_at: Date.now()
        });
    }

    public getUserMedia(): any[] {
        const rows = db.getUserMedia(this.uuid);
        const baseUrl = process.env.MEDIA_BASE_URL || 'http://127.0.0.1:8080';
        return rows.map((r: any) => {
            const originalUrl = `${baseUrl}/uploads/${r.id}.png`;
            return {
                a: r.id,
                b: r.title,
                c: r.description,
                d: {
                    original: { a: originalUrl },
                    embed: { a: `https://media.essential.gg/${r.id}` },
                    flexible: { a: originalUrl },
                },
                e: JSON.parse(r.metadata_json || "{}"),
                f: r.created_at
            };
        });
    }

    public getEmoteWheels(): EmoteWheel[] {
        const rows = db.getEmoteWheels(this.uuid);
        if (rows.length === 0) {
            this.createEmoteWheel("default", DEFAULT_EMOTE_SLOTS);
            return this.getEmoteWheels();
        }
        return rows.map((r: any) => ({
            a: r.id,
            b: r.selected === 1,
            c: JSON.parse(r.slots_json),
            d: r.created_at,
            e: r.updated_at
        }));
    }

    public createEmoteWheel(name: string, slots: Record<number, string>): EmoteWheel {
        const id = name === "default" ? "default" : uuidv4();
        const now = Date.now();
        const wheel = {
            id,
            user_uuid: this.uuid,
            selected: true,
            slots_json: JSON.stringify(slots),
            created_at: now,
            updated_at: null
        };
        db.db.run("UPDATE emote_wheels SET selected = 0 WHERE user_uuid = ?", [this.uuid]);
        db.saveEmoteWheel(wheel);
        return { a: id, b: true, c: slots, d: now, e: null };
    }

    public updateEmoteWheel(wheelId: string, slots: Record<number, string>) {
        db.updateEmoteWheelSlots(wheelId, this.uuid, slots);
    }

    public selectEmoteWheel(wheelId: string) {
        db.selectEmoteWheel(wheelId, this.uuid);
    }

    public deleteEmoteWheel(wheelId: string) {
        const wheels = this.getEmoteWheels();
        const wasSelected = wheels.find(w => w.a === wheelId)?.b;
        db.deleteEmoteWheel(wheelId, this.uuid);
        if (wasSelected && wheels.length > 1) {
            const remaining = wheels.filter(w => w.a !== wheelId);
            if (remaining.length > 0) {
                db.selectEmoteWheel(remaining[0].a, this.uuid);
            }
        }
    }

    // ===== CHAT MESSAGE METHODS =====

    public editMessage(messageId: number, newContent: string): { success: boolean; message?: any } {
        const message: any = db.getChatMessage(messageId);
        if (!message) {
            return { success: false };
        }

        // Only sender can edit
        if (message.sender_uuid !== this.uuid) {
            return { success: false };
        }

        // Must be within 15 minutes
        const fifteenMinutes = 15 * 60 * 1000;
        if (Date.now() - message.timestamp > fifteenMinutes) {
            return { success: false };
        }

        // Cannot edit deleted messages
        if (message.deleted === 1) {
            return { success: false };
        }

        db.updateChatMessage(messageId, newContent, Date.now());
        
        const updatedMessage: any = db.getChatMessage(messageId);
        return { success: true, message: updatedMessage };
    }

    public deleteMessage(messageId: number): { success: boolean; channelId?: number } {
        const message: any = db.getChatMessage(messageId);
        if (!message) {
            return { success: false };
        }

        // Already deleted
        if (message.deleted === 1) {
            return { success: false };
        }

        // Sender can delete their own message
        if (message.sender_uuid === this.uuid) {
            db.softDeleteChatMessage(messageId);
            return { success: true, channelId: message.channel_id };
        }

        // Channel owner can delete any message in their channel
        const channelOwner = db.getChannelOwner(message.channel_id);
        if (channelOwner === this.uuid) {
            db.softDeleteChatMessage(messageId);
            return { success: true, channelId: message.channel_id };
        }

        return { success: false };
    }

    public reportMessage(messageId: number, reason: string, details?: string): boolean {
        const message: any = db.getChatMessage(messageId);
        if (!message) {
            return false;
        }

        db.createReport(
            this.uuid,
            message.sender_uuid,
            messageId,
            message.channel_id,
            reason,
            details || null
        );

        return true;
    }

    public static findByUsername(name: string): User | null {
        const row: any = db.db.query("SELECT uuid, username FROM users WHERE LOWER(username) = LOWER(?)").get(name);
        if (row) return new User(row.uuid, row.username);
        return null;
    }

    public getUnlockedCosmeticsByType(type: string): any[] {
        const allCosmetics = db.getUserCosmetics(this.uuid);
        return Object.entries(allCosmetics).flatMap(([cosmeticId, cosmetic]: [string, any]) => {
            const cosmeticData: any = db.db.query("SELECT data FROM cosmetics WHERE id = ?").get(cosmeticId);
            if (cosmeticData) {
                const data = JSON.parse(cosmeticData.data);
                return data.b?.toUpperCase() === type.toUpperCase() ? [{ id: cosmeticId, ...cosmetic }] : [];
            }
            return [];
        });
    }
}
