import { BaseHandler } from "./BaseHandler";
import { ServerWebSocket } from "bun";
import { WebSocketData } from "../../state";
import { Packet } from "../../protocol";
import { User } from "../../models/User";
import { sendPacket } from "../index";
import * as db from "../../db";
import { getCosmeticCategoriesPayload, getCosmeticTypesPayload } from "../../bootstrapPayloads";

function getMediaBaseUrl() {
    return process.env.MEDIA_BASE_URL || "http://127.0.0.1:8080";
}

export class WardrobeSettingsHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const mediaBaseUrl = getMediaBaseUrl();
        this.send(ws, 'wardrobe.ServerWardrobeSettingsPacket', {
            outfits_limit: 10,
            skins_limit: 10,
            gifting_coin_spend_requirement: 0,
            fallback_featured_page_config: { 
                a: `${mediaBaseUrl}/featured.json`, 
                b: "hash" 
            },
            current_featured_page_config: null,
            you_need_minimum_amount: 0
        }, packet.id);

        const user = new User(ws.data.userUuid, ws.data.userName);

        sendPacket(ws, 'cosmetic.ServerCosmeticTypesPopulatePacket', getCosmeticTypesPayload());
        sendPacket(ws, 'cosmetic.categories.ServerCosmeticCategoriesPopulatePacket', getCosmeticCategoriesPayload(mediaBaseUrl));

        sendPacket(ws, 'cosmetic.ServerCosmeticsPopulatePacket', { a: db.getAllCosmetics() });

        const unlocked = user.getUnlockedCosmetics();
        sendPacket(ws, 'cosmetic.ServerCosmeticsUserUnlockedPacket', {
            a: Object.keys(unlocked),
            b: false,
            c: user.uuid,
            d: unlocked
        });

        sendPacket(ws, 'cosmetic.outfit.ServerCosmeticOutfitPopulatePacket', { outfits: user.getOutfits() });
        sendPacket(ws, 'cosmetic.emote.ServerCosmeticEmoteWheelPopulatePacket', { a: user.getEmoteWheels() });
    }
}

export class CosmeticRequestHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const requestedIds: string[] = packet.payload.a || [];
        const knownCosmetics = db.getAllCosmetics();
        const responseList: any[] = [];
        const mediaBaseUrl = getMediaBaseUrl();

        for (const id of requestedIds) {
            const found = knownCosmetics.find(c => c.a === id);
            if (found) {
                responseList.push(found);
            } else {
                // Return placeholder to avoid infinite "Error loading item"
                responseList.push({
                    a: id, b: "CAPE", c: { en_US: id }, f: 0, g: { USD: 0.0 }, h: [], i: 1609459200000,
                    q: {
                        "texture.png": { a: `${mediaBaseUrl}/static/texture.png`, b: "hash" },
                        "geometry.steve.json": { a: `${mediaBaseUrl}/static/cape.json`, b: "hash" }
                    }
                });
            }
        }
        this.send(ws, 'cosmetic.ServerCosmeticsPopulatePacket', { a: responseList }, packet.id);
    }
}

export class CheckoutCosmeticsHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const cosmeticIds: string[] = packet.payload.cosmetic_ids || [];
        const user = new User(ws.data.userUuid, ws.data.userName);
        for (const id of cosmeticIds) user.unlockCosmetic(id);
        const unlocked = user.getUnlockedCosmetics();
        this.send(ws, 'cosmetic.ServerCosmeticsUserUnlockedPacket', { a: Object.keys(unlocked), b: true, c: user.uuid, d: unlocked });
        this.send(ws, 'response.ResponseActionPacket', { a: true }, packet.id);
    }
}

// Merged into CheckoutCosmeticsHandler - removed duplicate
// The ClientCosmeticCheckoutPacket is now handled by CheckoutCosmeticsHandler

export class CoinsBalanceHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const user = new User(ws.data.userUuid, ws.data.userName);
        this.send(ws, 'coins.ServerCoinsBalancePacket', { coins: user.coins, coins_spent: 0 }, packet.id);
    }
}

export class CoinBundleOptionsHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'coins.ServerCoinBundleOptionsPacket', { coinBundles: [] }, packet.id);
    }
}

export class CurrencyHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'currency.ServerCurrencyOptionsPacket', { currencies: ["USD"] }, packet.id);
    }
}

export class CosmeticCategoriesRequestHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'cosmetic.categories.ServerCosmeticCategoriesPopulatePacket', getCosmeticCategoriesPayload(getMediaBaseUrl()), packet.id);
    }
}

export class WardrobeStoreBundleRequestHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { store_bundle_ids } = packet.payload;
        const bundles: any[] = [];
        if (store_bundle_ids && store_bundle_ids.includes("LICH_OVERLORD")) {
            bundles.push({ id: "LICH_OVERLORD", name: "Lich Overlord", skin: null, tier: "EPIC", discount: 0, rotate_on_preview: true, cosmetics: {}, settings: {} });
        }
        this.send(ws, 'wardrobe.ServerWardrobeStoreBundlePacket', { store_bundles: bundles }, packet.id);
    }
}

export class CosmeticBulkRequestUnlockStateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const result: any = {};
        (packet.payload.target_user_ids || []).forEach((id: string) => { result[id] = false; });
        this.send(ws, 'cosmetic.ServerCosmeticBulkRequestUnlockStateResponsePacket', { unlock_states: result }, packet.id);
    }
}
