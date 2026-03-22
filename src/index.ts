import { serve, ServerWebSocket } from "bun";
import { mkdir } from "node:fs/promises";
import { ConnectionCodec } from "./protocol";
import { WebSocketData, CONNECTED_USERS } from "./state";
import { handlePacket, sendPacket } from "./handlers";
import { User } from "./models/User";
import * as db from "./db";
import { logger } from "./logger";
import { getAllSessions, serializeSession } from "./upnpSessions";
import { getOrCreateAuthToken } from "./authTokenStore";
import { parseConnectionHandshake } from "./connectionHandshake";
import {
    getAllowedDomains,
    getChatReportReasonsPayload,
    getCommunityRulesPayload,
    getCosmeticCategoriesPayload,
    getCosmeticTypesPayload,
    getTrustedHostsPayload,
} from "./bootstrapPayloads";
import { getUserTrustedHosts } from "./trustedHostsStore";
import { buildChannelForUser } from "./chatPayloads";

const DUMMY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

type EssentialServerOptions = {
    port?: number;
    hostname?: string;
    essentialPath?: string;
    mediaBaseUrl?: string;
    keepAliveIntervalMs?: number;
};

function requestReconnect(ws: ServerWebSocket<WebSocketData>) {
    ws.data.superseded = true;
    if (ws.data.keepAliveTimer) {
        clearInterval(ws.data.keepAliveTimer);
        ws.data.keepAliveTimer = undefined;
    }
    sendPacket(ws, "connection.ServerConnectionReconnectPacket", {});
    ws.close(4507, "SERVER_REQUESTED_RECONNECT");
    setTimeout(() => {
        try {
            ws.terminate();
        } catch {}
    }, 50);
}

function resolveMediaBaseUrl(explicitBaseUrl: string | undefined, hostname: string, port: number) {
    if (explicitBaseUrl) {
        return explicitBaseUrl;
    }

    const publicHostname = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
    return `http://${publicHostname}:${port}`;
}

export function isActiveConnection(ws: ServerWebSocket<WebSocketData>) {
    return !ws.data.superseded && CONNECTED_USERS.get(ws.data.userUuid) === ws;
}

export async function processSocketMessage(
    ws: ServerWebSocket<WebSocketData>,
    message: string | Buffer | ArrayBuffer | Uint8Array
) {
    if (!isActiveConnection(ws)) {
        logger.debug({ user: ws.data.userName, uuid: ws.data.userUuid }, "Ignoring message from superseded websocket");
        return;
    }

    const buffer = message instanceof Buffer
        ? message
        : message instanceof ArrayBuffer
            ? Buffer.from(message)
            : ArrayBuffer.isView(message)
                ? Buffer.from(message.buffer, message.byteOffset, message.byteLength)
                : null;

    if (!buffer) {
        return;
    }

    const packet = ws.data.codec.decode(buffer);
    if (packet) {
        await handlePacket(ws, packet);
    }
}

export function sendInitialState(ws: ServerWebSocket<WebSocketData>, user: User, mediaBaseUrl: string) {
    sendPacket(ws, 'features.ServerDisabledFeaturesPacket', { disabled_features: [] });
    sendPacket(ws, 'profile.ServerProfileStatusPacket', {
        a: user.uuid,
        b: 'ONLINE',
        lastOnlineTimestamp: user.lastOnline,
        punishment_status: null
    });
    sendPacket(ws, 'chat.ServerChatChannelMessageReportReasonsPacket', getChatReportReasonsPayload());
    sendPacket(ws, 'chat.ChatUnfilteredContentSettingPacket', { show_unfiltered_content: false });
    sendPacket(ws, 'social.ServerSocialAllowedDomainsPacket', { domains: getAllowedDomains(mediaBaseUrl) });
    sendPacket(ws, 'profile.trustedhosts.ServerProfileTrustedHostsClearPacket', {});
    sendPacket(
        ws,
        'profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket',
        getTrustedHostsPayload(mediaBaseUrl, getUserTrustedHosts(user.uuid))
    );
    sendPacket(ws, 'features.ServerExternalServicePopulatePacket', { services: { media: { url: mediaBaseUrl } } });
    sendPacket(ws, 'social.ServerCommunityRulesStatePacket', getCommunityRulesPayload(user.rulesAccepted));
    sendPacket(ws, 'social.ServerSocialSuspensionStatePacket', { suspended: false });
    sendPacket(ws, 'partner.ServerPartneredModsPopulatePacket', { mods: [] });
    sendPacket(ws, 'cosmetic.ServerCosmeticTypesPopulatePacket', getCosmeticTypesPayload());
    sendPacket(ws, 'cosmetic.categories.ServerCosmeticCategoriesPopulatePacket', getCosmeticCategoriesPayload(mediaBaseUrl));

    sendPacket(ws, 'cosmetic.ServerCosmeticsPopulatePacket', { a: db.getAllCosmetics() });
    sendPacket(ws, 'cosmetic.ServerCosmeticsUserEquippedPacket', { a: user.uuid, b: {} });
    sendPacket(ws, 'cosmetic.ServerCosmeticsUserEquippedVisibilityPacket', { a: true });
    
    const unlocked = user.getUnlockedCosmetics();
    sendPacket(ws, 'cosmetic.ServerCosmeticsUserUnlockedPacket', { a: Object.keys(unlocked), b: false, c: user.uuid, d: unlocked });
    sendPacket(ws, 'cosmetic.outfit.ServerCosmeticOutfitPopulatePacket', { outfits: user.getOutfits() });
    
    sendPacket(ws, 'cosmetic.emote.ServerCosmeticEmoteWheelPopulatePacket', {
        a: user.getEmoteWheels()
    });

    sendPacket(ws, 'skin.ServerSkinPopulatePacket', { skins: user.getSkins() });
    sendPacket(ws, 'upnp.ServerUPnPSessionPopulatePacket', {
        a: getAllSessions().map(serializeSession)
    });

    // 6. Chat Channels
    const channels = user.getChannels().map((channel) => buildChannelForUser({
        id: channel.a,
        type: channel.b,
        name: channel.c,
        owner_uuid: channel.g?.b,
        created_at: channel.g?.a,
        muted: channel.i ? 1 : 0
    }, user.uuid));
    if (channels.length > 0) {
        sendPacket(ws, 'chat.ServerChatChannelAddPacket', { a: channels });
    }

    // 7. Relationships (includes friends, outgoing requests, blocked)
    const relationships = user.getRelationships();
    if (relationships.length > 0) {
        sendPacket(ws, 'relationships.ServerRelationshipPopulatePacket', { a: relationships });
    }

    // 8. Incoming friend requests (PENDING where this user is the target)
    const incomingRequests = user.getIncomingFriendRequests();
    if (incomingRequests.length > 0) {
        sendPacket(ws, 'relationships.ServerRelationshipPopulatePacket', { a: incomingRequests });
    }
}

function broadcastPresence(user: User, status: string) {
    for (const client of CONNECTED_USERS.values()) {
        if (client.data.userUuid !== user.uuid) {
            sendPacket(client, 'profile.ServerProfileStatusPacket', { a: user.uuid, b: status });
        }
    }
}

export function createEssentialServer(options: EssentialServerOptions = {}) {
    const port = options.port ?? (Number(process.env.PORT) || 8080);
    const hostname = options.hostname ?? "0.0.0.0";
    const essentialPath = options.essentialPath ?? (process.env.ESSENTIAL_PATH || "/v1");
    const keepAliveIntervalMs = options.keepAliveIntervalMs ?? 10000;
    let mediaBaseUrl = options.mediaBaseUrl ?? process.env.MEDIA_BASE_URL;

    const server = serve<WebSocketData>({
        port,
        hostname,
        async fetch(req, server) {
            const url = new URL(req.url);
            const isWs = req.headers.get("upgrade")?.toLowerCase() === "websocket";
            
            const mediaIdMatch = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(url.pathname);
            if (mediaIdMatch && req.method === "GET") {
                const mediaFile = Bun.file(`./uploads/${mediaIdMatch[1]}.png`);
                if (await mediaFile.exists()) {
                    return new Response(mediaFile, { headers: { "Content-Type": "image/png" } });
                }
                return new Response("Not Found", { status: 404 });
            }

            if (url.pathname === "/featured.json") {
                const file = Bun.file("./static/featured.json");
                if (await file.exists()) return new Response(file, { headers: { "Content-Type": "application/json" } });
                return new Response(JSON.stringify({ metadata_revision: 1, id: "DEFAULT", pages: { "3": { rows: [] } } }));
            }

            if (url.pathname.startsWith("/static/")) {
                const fileName = url.pathname.replace("/static/", "");
                
                if (fileName.endsWith(".png")) {
                    const filePath = `./static/${fileName}`;
                    const file = Bun.file(filePath);
                    if (await file.exists()) {
                        return new Response(file, { headers: { "Content-Type": "image/png" } });
                    }
                    logger.warn({ fileName }, "PNG not found, serving placeholder");
                    return new Response(DUMMY_PNG, { headers: { "Content-Type": "image/png" } });
                }

                const file = Bun.file(`./static/${fileName}`);
                if (await file.exists()) {
                    logger.debug({ fileName }, "Serving static file");
                    const contentType = fileName.endsWith(".json") ? "application/json" : "application/octet-stream";
                    return new Response(file, { headers: { "Content-Type": contentType } });
                }

                if (fileName.endsWith(".json")) {
                    logger.debug({ fileName }, "Serving fallback JSON for missing file");
                    return new Response(JSON.stringify({
                        format_version: "1.12.0",
                        "minecraft:geometry": []
                    }), { headers: { "Content-Type": "application/json" } });
                }

                logger.warn({ fileName }, "Static file not found");
                return new Response("Not Found", { status: 404 });
            }

            if (url.pathname.startsWith("/uploads/")) {
                const fileName = url.pathname.replace("/uploads/", "").split("/")[0];
                if (req.method === "PUT") {
                    await mkdir("./uploads", { recursive: true });
                    await Bun.write(`./uploads/${fileName}`, await req.arrayBuffer());
                    logger.info({ fileName }, "File uploaded via PUT");
                    return new Response("OK");
                }
                if (req.method === "POST") {
                    await mkdir("./uploads", { recursive: true });
                    const formData = await req.formData();
                    const file = formData.get("file");
                    if (!file || !(file instanceof Blob)) {
                        return new Response("Bad Request: missing 'file' field", { status: 400 });
                    }
                    await Bun.write(`./uploads/${fileName}`, await file.arrayBuffer());
                    logger.info({ fileName }, "File uploaded via POST multipart");
                    return new Response("OK");
                }
                const file = Bun.file(`./uploads/${fileName}`);
                if (await file.exists()) return new Response(file);
                return new Response("Not Found", { status: 404 });
            }

            logger.debug({ method: req.method, path: url.pathname, isWs }, "Incoming request");

            if (isWs && url.pathname.startsWith(essentialPath)) {
                const handshake = parseConnectionHandshake(req.headers);
                if (!handshake.success) {
                    return new Response(handshake.body, { status: handshake.status });
                }
                const authToken = getOrCreateAuthToken(
                    handshake.handshake.userUuid,
                    handshake.handshake.authenticationToken
                );
                const success = server.upgrade(req, {
                    data: {
                        userUuid: handshake.handshake.userUuid,
                        userName: handshake.handshake.userName,
                        codec: new ConnectionCodec(),
                    },
                    headers: {
                        "Essential-Protocol-Version": String(handshake.handshake.protocolVersion),
                        "Essential-Authentication-Token": authToken
                    }
                });
                if (success) return undefined;
            }
            return new Response(`Essential Private Server Running.`);
        },
        websocket: {
            idleTimeout: 120,
            open(ws) {
                const user = new User(ws.data.userUuid, ws.data.userName);
                const existingWs = CONNECTED_USERS.get(user.uuid);
                const replacingExistingConnection = existingWs && existingWs !== ws;
                logger.info({ user: user.username, uuid: user.uuid }, "User connected");
                CONNECTED_USERS.set(user.uuid, ws);
                user.setOnline(true);
                sendInitialState(ws, user, mediaBaseUrl!);
                if (replacingExistingConnection) {
                    requestReconnect(existingWs);
                } else {
                    broadcastPresence(user, 'ONLINE');
                }
                ws.data.keepAliveTimer = setInterval(() => {
                    if (!isActiveConnection(ws)) {
                        clearInterval(ws.data.keepAliveTimer);
                        ws.data.keepAliveTimer = undefined;
                        return;
                    }
                    sendPacket(ws, 'connection.ConnectionKeepAlivePacket', {});
                }, keepAliveIntervalMs);
            },
            message(ws, message) {
                void processSocketMessage(ws, message);
            },
            close(ws) {
                const user = new User(ws.data.userUuid, ws.data.userName);
                logger.info({ user: user.username }, "User disconnected");
                if (CONNECTED_USERS.get(user.uuid) === ws) {
                    CONNECTED_USERS.delete(user.uuid);
                    user.setOnline(false);
                    broadcastPresence(user, 'OFFLINE');
                }
                if (ws.data.keepAliveTimer) {
                    clearInterval(ws.data.keepAliveTimer);
                    ws.data.keepAliveTimer = undefined;
                }
            },
        },
    });

    mediaBaseUrl = resolveMediaBaseUrl(mediaBaseUrl, server.hostname, server.port);
    logger.info(`Server listening on port ${server.port}`);
    return server;
}

export const server = import.meta.main ? createEssentialServer() : null;
