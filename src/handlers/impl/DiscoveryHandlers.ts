import { BaseHandler } from "./BaseHandler";
import { ServerWebSocket } from "bun";
import { WebSocketData } from "../../state";
import { Packet } from "../../protocol";
import { v4 } from "uuid";
import { User } from "../../models/User";
import * as db from "../../db";
import { unlink } from "node:fs/promises";

export class NoticesHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'notices.ServerNoticePopulatePacket', { a: [] }, packet.id);
    }
}

export class ServerDiscoveryHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        if (packet.type.endsWith('PopulatePacket')) {
            this.send(ws, 'serverdiscovery.ServerServerDiscoveryPopulatePacket', { a: [] }, packet.id);
        } else {
            this.send(ws, 'serverdiscovery.ServerServerDiscoveryResponsePacket', { 
                recommended: [],
                featured: []
            }, packet.id);
        }
    }
}

export class KnownServersHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'knownservers.ServerKnownServersResponsePacket', {
            knownServers: [
                {
                    id: "hypixel",
                    names: { "en_US": "Hypixel" },
                    addresses: ["mc.hypixel.net"]
                }
            ]
        }, packet.id);
    }
}

export class MediaHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const user = new User(ws.data.userUuid, ws.data.userName);
        this.send(ws, 'media.ServerMediaPopulatePacket', { a: user.getUserMedia() }, packet.id);
    }
}

export class MediaGetUploadUrlHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const mediaId = v4();
        const baseUrl = process.env.MEDIA_BASE_URL || `http://127.0.0.1:8080`;
        this.send(ws, 'media.ServerMediaUploadUrlPacket', {
            media_id: mediaId,
            upload_url: `${baseUrl}/uploads/${mediaId}.png`
        }, packet.id);
    }
}

export class MediaCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: mediaId, b: title, c: description, d: metadata } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.addMedia(mediaId, title, description, metadata);

        const newMedia = user.getUserMedia().find((m: any) => m.a === mediaId);
        this.send(ws, 'media.ServerMediaPopulatePacket', {
            a: newMedia ? [newMedia] : []
        }, packet.id);
    }
}

export class MediaUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: mediaId, b: title, c: description, d: favorite } = packet.payload;
        const existing = db.getUserMediaById(ws.data.userUuid, mediaId);

        if (!existing) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Media not found" }, packet.id);
            return;
        }

        const nextMetadata = JSON.parse(existing.metadata_json || "{}");
        if (favorite !== null && favorite !== undefined) {
            nextMetadata.e = favorite;
        }

        const success = db.updateUserMedia(
            ws.data.userUuid,
            mediaId,
            title ?? existing.title ?? null,
            description ?? existing.description ?? null,
            nextMetadata
        );

        if (!success) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Failed to update media" }, packet.id);
            return;
        }

        const user = new User(ws.data.userUuid, ws.data.userName);
        this.send(ws, "media.ServerMediaPopulatePacket", {
            a: user.getUserMedia().filter((media) => media.a === mediaId)
        }, packet.id);
    }
}

export class MediaDeleteHandler extends BaseHandler {
    async handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const mediaId = packet.payload.a;
        const success = db.deleteUserMedia(ws.data.userUuid, mediaId);

        if (!success) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Media not found" }, packet.id);
            return;
        }

        try {
            await unlink(`./uploads/${mediaId}.png`);
        } catch {}

        this.send(ws, "response.ResponseActionPacket", { a: true }, packet.id);
    }
}
