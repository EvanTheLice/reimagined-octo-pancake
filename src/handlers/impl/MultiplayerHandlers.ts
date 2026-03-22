import { BaseHandler } from "./BaseHandler";
import { ServerWebSocket } from "bun";
import { WebSocketData, CONNECTED_USERS } from "../../state";
import { Packet } from "../../protocol";
import { logger } from "../../logger";
import { fetchMinecraftStatus } from "../../utils/minecraftStatusPing";

export class IceRelayHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const targetUuid = packet.payload.a;
        const targetWs = CONNECTED_USERS.get(targetUuid);
        
        if (targetWs) {
            logger.debug({ from: ws.data.userUuid, to: targetUuid, type: packet.type }, "Relaying multiplayer packet");
            // Rewrap payload: sender becomes 'a'
            const newPayload = { ...packet.payload, a: ws.data.userUuid };
            this.send(targetWs, packet.type, newPayload);
        } else {
            logger.warn({ to: targetUuid, type: packet.type }, "Relay failed: Target not connected");
        }
    }
}

export class PingProxyHandler extends BaseHandler {
    async handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        try {
            const { rawJson, latency } = await fetchMinecraftStatus(
                packet.payload.a,
                packet.payload.b,
                packet.payload.c
            );

            this.send(ws, "pingproxy.ServerPingProxyResponsePacket", {
                a: rawJson,
                b: latency,
                c: "local"
            }, packet.id);
        } catch (error) {
            logger.warn({
                error,
                host: packet.payload.a,
                port: packet.payload.b
            }, "Ping proxy request failed");

            this.send(ws, "response.ResponseActionPacket", {
                a: false,
                b: "Ping proxy request failed"
            }, packet.id);
        }
    }
}

export class CosmeticAnimationTriggerHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        for (const client of CONNECTED_USERS.values()) {
            if (client.data.userUuid === ws.data.userUuid) {
                continue;
            }

            this.send(client, "cosmetic.ServerCosmeticAnimationTriggerPacket", {
                a: ws.data.userUuid,
                b: packet.payload.a,
                c: packet.payload.b
            });
        }

        this.send(ws, "response.ResponseActionPacket", { a: true }, packet.id);
    }
}
