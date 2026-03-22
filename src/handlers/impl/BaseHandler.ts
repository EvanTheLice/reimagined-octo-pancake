import { ServerWebSocket } from "bun";
import { WebSocketData } from "../../state";
import { Packet } from "../../protocol";
import { sendPacket } from "../index";

export abstract class BaseHandler {
    public abstract handle(ws: ServerWebSocket<WebSocketData>, packet: Packet): void | Promise<void>;

    protected send(ws: ServerWebSocket<WebSocketData>, type: string, payload: any, id?: string) {
        sendPacket(ws, type, payload, id);
    }
}
