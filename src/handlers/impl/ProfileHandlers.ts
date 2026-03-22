import { BaseHandler } from "./BaseHandler";
import { ServerWebSocket } from "bun";
import { WebSocketData, CONNECTED_USERS } from "../../state";
import { Packet } from "../../protocol";

export class ProfileActivityHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        // ClientProfileActivityPacket: a (type), c (metadata)
        // ServerProfileActivityPacket: a (uuid), b (type), c (metadata)
        const senderUuid = ws.data.userUuid;
        const { a: type, c: metadata } = packet.payload;

        // Broadcast to others
        for (const client of CONNECTED_USERS.values()) {
            if (client.data.userUuid !== senderUuid) {
                this.send(client, 'profile.ServerProfileActivityPacket', {
                    a: senderUuid,
                    b: type,
                    c: metadata
                });
            }
        }
    }
}
