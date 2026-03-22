import { ServerWebSocket } from "bun";
import { User } from "../../models/User";
import { Packet } from "../../protocol";
import { WebSocketData } from "../../state";
import { sendPacket } from "../index";
import { BaseHandler } from "./BaseHandler";

function sendEmotePopulate(ws: ServerWebSocket<WebSocketData>, user: User, packetId?: string) {
    sendPacket(ws, "cosmetic.emote.ServerCosmeticEmoteWheelPopulatePacket", {
        a: user.getEmoteWheels()
    }, packetId);
}

export class EmoteWheelUpdateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: wheelId, b: index, c: value } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);
        const wheel = user.getEmoteWheels().find((item) => item.a === wheelId);

        if (!wheel) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Unknown emote wheel" }, packet.id);
            return;
        }

        const slots = { ...wheel.c } as Record<number, string>;
        if (value == null) {
            delete slots[index];
        } else {
            slots[index] = value;
        }
        user.updateEmoteWheel(wheelId, slots);
        sendEmotePopulate(ws, user, packet.id);
    }
}

export class EmoteWheelSelectHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: wheelId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        user.selectEmoteWheel(wheelId);
        sendEmotePopulate(ws, user, packet.id);
    }
}
