import { ServerWebSocket } from "bun";
import { ConnectionCodec } from "./protocol";

export interface WebSocketData {
    userUuid: string;
    userName: string;
    codec: ConnectionCodec;
    keepAliveTimer?: Timer;
    superseded?: boolean;
}

export const CONNECTED_USERS = new Map<string, ServerWebSocket<WebSocketData>>();
