import { ServerWebSocket } from "bun";
import * as db from "../../db";
import { User } from "../../models/User";
import { Packet } from "../../protocol";
import { WebSocketData } from "../../state";
import { toInfraSkinTexture } from "../../utils/skinTexture";
import { sendPacket } from "../index";
import { BaseHandler } from "./BaseHandler";

function sendSkinPopulate(ws: ServerWebSocket<WebSocketData>, user: User, packetId?: string) {
    sendPacket(ws, "skin.ServerSkinPopulatePacket", { skins: user.getSkins() }, packetId);
}

function resolveSelectedSkinTexture(userUuid: string) {
    const outfits = db.getUserOutfits(userUuid) as any[];
    const selectedOutfit = outfits.find((outfit) => outfit.selected === 1) ?? outfits[0];

    if (selectedOutfit?.skin_texture) {
        return selectedOutfit.skin_texture;
    }

    if (selectedOutfit?.skin_id) {
        const skin: any = db.getUserSkinById(userUuid, selectedOutfit.skin_id);
        if (skin) {
            return toInfraSkinTexture(skin.hash, skin.model);
        }
    }

    const skins = db.getUserSkins(userUuid) as any[];
    const fallback = skins.sort((left, right) => (right.last_used_at ?? right.created_at) - (left.last_used_at ?? left.created_at))[0];
    return fallback ? toInfraSkinTexture(fallback.hash, fallback.model) : null;
}

export class SkinCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { name, model, hash, favorite } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.createSkin(name, model, hash, favorite);
        sendSkinPopulate(ws, user, packet.id);
    }
}

export class SkinDeleteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: skinId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.deleteSkin(skinId);
        sendSkinPopulate(ws, user, packet.id);
    }
}

export class SkinUpdateDataHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: skinId, model, hash } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateSkinData(skinId, model, hash);
        sendSkinPopulate(ws, user, packet.id);
    }
}

export class SkinUpdateLastUsedHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: skinId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateSkinLastUsed(skinId);
        sendSkinPopulate(ws, user, packet.id);
    }
}

export class SkinUpdateFavoriteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: skinId, favorited } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateSkinFavorite(skinId, favorited);
        sendSkinPopulate(ws, user, packet.id);
    }
}

export class SkinUpdateNameHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { id: skinId, name } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.updateSkinName(skinId, name);
        sendSkinPopulate(ws, user, packet.id);
    }
}

export class SelectedSkinsRequestHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const result: Record<string, string> = {};

        for (const uuid of packet.payload.uuids as string[]) {
            const skinTexture = resolveSelectedSkinTexture(uuid);
            if (skinTexture) {
                result[uuid] = skinTexture;
            }
        }

        this.send(ws, "skin.ServerSelectedSkinsResponsePacket", { skins: result }, packet.id);
    }
}
