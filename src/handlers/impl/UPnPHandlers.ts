import { ServerWebSocket } from "bun";
import { Packet } from "../../protocol";
import { WebSocketData, CONNECTED_USERS } from "../../state";
import {
    addInvites,
    createOrReplaceSession,
    getSession,
    removeInvites,
    removeSession,
    serializeSession,
    updateSession
} from "../../upnpSessions";
import { sendPacket } from "../index";
import { BaseHandler } from "./BaseHandler";

function broadcastSession(session: ReturnType<typeof getSession>) {
    if (!session) {
        return;
    }

    const payload = { a: [serializeSession(session)] };
    for (const client of CONNECTED_USERS.values()) {
        sendPacket(client, "upnp.ServerUPnPSessionPopulatePacket", payload);
    }
}

export class UPnPSessionCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: ip, b: port, c: privacy, d: protocolVersion, e: worldName } = packet.payload;
        const session = createOrReplaceSession({
            hostUuid: ws.data.userUuid,
            ip,
            port,
            privacy,
            invites: [],
            createdAt: Date.now(),
            protocolVersion: protocolVersion ?? null,
            worldName: worldName ?? null,
            rawStatus: null
        });

        sendPacket(ws, "upnp.ServerUPnPSessionPopulatePacket", { a: [serializeSession(session)] }, packet.id);
        broadcastSession(session);
    }
}

export class UPnPSessionCloseHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        removeSession(ws.data.userUuid);

        for (const client of CONNECTED_USERS.values()) {
            sendPacket(client, "upnp.ServerUPnPSessionRemovePacket", { a: [ws.data.userUuid] });
        }

        if (packet.id) {
            sendPacket(ws, "response.ResponseActionPacket", { a: true }, packet.id);
        }
    }
}

export class UPnPSessionUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const updated = updateSession(ws.data.userUuid, {
            ip: packet.payload.a ?? undefined,
            port: packet.payload.b ?? undefined,
            privacy: packet.payload.c ?? undefined,
        });

        if (!updated) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "No active session" }, packet.id);
            return;
        }

        sendPacket(ws, "upnp.ServerUPnPSessionPopulatePacket", { a: [serializeSession(updated)] }, packet.id);
        broadcastSession(updated);
    }
}

export class UPnPSessionInvitesAddHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const session = addInvites(ws.data.userUuid, packet.payload.a as string[]);
        if (!session) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "No active session" }, packet.id);
            return;
        }

        for (const invitee of packet.payload.a as string[]) {
            const targetWs = CONNECTED_USERS.get(invitee);
            if (!targetWs) {
                continue;
            }
            sendPacket(targetWs, "upnp.ServerUPnPSessionPopulatePacket", { a: [serializeSession(session)] });
            sendPacket(targetWs, "upnp.ServerUPnPSessionInviteAddPacket", { a: ws.data.userUuid });
        }

        sendPacket(ws, "upnp.ServerUPnPSessionPopulatePacket", { a: [serializeSession(session)] }, packet.id);
        broadcastSession(session);
    }
}

export class UPnPSessionInvitesRemoveHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const session = removeInvites(ws.data.userUuid, packet.payload.a as string[]);
        if (!session) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "No active session" }, packet.id);
            return;
        }

        sendPacket(ws, "upnp.ServerUPnPSessionPopulatePacket", { a: [serializeSession(session)] }, packet.id);
        broadcastSession(session);
    }
}

export class UPnPSessionPingProxyUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        updateSession(ws.data.userUuid, { rawStatus: packet.payload.a });
        this.send(ws, "response.ResponseActionPacket", { a: true }, packet.id);
    }
}
