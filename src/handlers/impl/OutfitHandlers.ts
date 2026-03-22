import { ServerWebSocket } from "bun";
import * as db from "../../db";
import { User } from "../../models/User";
import { Packet } from "../../protocol";
import { WebSocketData, CONNECTED_USERS } from "../../state";
import { toInfraSkinTexture } from "../../utils/skinTexture";
import { sendPacket } from "../index";
import { BaseHandler } from "./BaseHandler";

function sendOutfitPopulate(ws: ServerWebSocket<WebSocketData>, user: User, packetId?: string) {
    sendPacket(ws, "cosmetic.outfit.ServerCosmeticOutfitPopulatePacket", { outfits: user.getOutfits() }, packetId);
}

function getSelectedOutfit(user: User) {
    return user.getOutfits().find((outfit: any) => outfit.f) ?? null;
}

function resolveSelectedSkinTexture(userUuid: string, selectedOutfit: any) {
    if (!selectedOutfit) {
        return null;
    }

    if (selectedOutfit.c) {
        return selectedOutfit.c;
    }

    if (selectedOutfit.j) {
        const skin: any = db.getUserSkinById(userUuid, selectedOutfit.j);
        if (skin) {
            return toInfraSkinTexture(skin.hash, skin.model);
        }
    }

    return null;
}

function sendSelectedOutfitResponse(ws: ServerWebSocket<WebSocketData>, targetUuid: string, packetId?: string) {
    const user = new User(targetUuid);
    const selected = getSelectedOutfit(user);

    sendPacket(ws, "cosmetic.outfit.ServerCosmeticOutfitSelectedResponsePacket", {
        uuid: targetUuid,
        skinTexture: resolveSelectedSkinTexture(targetUuid, selected),
        equippedCosmetics: selected?.d ?? {},
        cosmeticSettings: selected?.e ?? {}
    }, packetId);
}

function broadcastSelectedOutfitState(user: User) {
    const selected = getSelectedOutfit(user);
    const skinTexture = resolveSelectedSkinTexture(user.uuid, selected);
    const equippedCosmetics = selected?.d ?? {};
    const cosmeticSettings = selected?.e ?? {};

    for (const client of CONNECTED_USERS.values()) {
        if (client.data.userUuid === user.uuid) {
            continue;
        }

        sendPacket(client, "cosmetic.ServerCosmeticsUserEquippedPacket", {
            a: user.uuid,
            b: equippedCosmetics
        });
        sendPacket(client, "cosmetic.ServerCosmeticPlayerSettingsPacket", {
            a: user.uuid,
            b: cosmeticSettings
        });
        sendPacket(client, "cosmetic.ServerCosmeticsSkinTexturePacket", {
            a: user.uuid,
            b: skinTexture
        });
    }
}

export class OutfitCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { name, skin_id, equipped_cosmetics, cosmetic_settings } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.createOutfit(name, skin_id, equipped_cosmetics, cosmetic_settings);
        sendOutfitPopulate(ws, user, packet.id);
        broadcastSelectedOutfitState(user);
    }
}

export class OutfitDeleteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: outfitId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.deleteOutfit(outfitId);
        sendOutfitPopulate(ws, user, packet.id);
        broadcastSelectedOutfitState(user);
    }
}

export class OutfitSelectHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: outfitId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.selectOutfit(outfitId);
        sendOutfitPopulate(ws, user, packet.id);
        broadcastSelectedOutfitState(user);
    }
}

export class OutfitEquippedUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: outfitId, b: slot, c: cosmeticId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateOutfitEquipped(outfitId, slot, cosmeticId ?? null);
        sendOutfitPopulate(ws, user, packet.id);
        broadcastSelectedOutfitState(user);
    }
}

export class OutfitSkinUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: outfitId, b: skinTexture, c: skinId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateOutfitSkin(outfitId, skinId ?? null, skinTexture ?? null);
        sendOutfitPopulate(ws, user, packet.id);
        broadcastSelectedOutfitState(user);
    }
}

export class OutfitNameUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: outfitId, name } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateOutfitName(outfitId, name);
        sendOutfitPopulate(ws, user, packet.id);
    }
}

export class OutfitCosmeticSettingsUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: outfitId, b: cosmeticId, c: settings } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateOutfitSettings(outfitId, cosmeticId, settings);
        sendOutfitPopulate(ws, user, packet.id);
        broadcastSelectedOutfitState(user);
    }
}

export class OutfitFavoriteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: outfitId, state } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateOutfitFavorite(outfitId, state);
        sendOutfitPopulate(ws, user, packet.id);
    }
}

export class OutfitSelectedRequestHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        sendSelectedOutfitResponse(ws, packet.payload.a, packet.id);
    }
}
