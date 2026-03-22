import { ServerWebSocket } from "bun";
import * as db from "../../db";
import { User } from "../../models/User";
import { Packet } from "../../protocol";
import { WebSocketData, CONNECTED_USERS } from "../../state";
import { sendPacket } from "../index";
import { BaseHandler } from "./BaseHandler";
import { buildChannelForUser, buildChatMessage } from "../../chatPayloads";
import {
    getChannelLastReadMessageId,
    getPreviousReadableMessageId,
    setChannelLastReadMessageId,
} from "../../chatStateStore";

function sendToChannelMembers(channelId: number, type: string, payload: any, packetIdForUser?: string, currentUserUuid?: string) {
    for (const memberUuid of db.getChannelMembers(channelId)) {
        const targetWs = CONNECTED_USERS.get(memberUuid);
        if (!targetWs) {
            continue;
        }

        const responseId = memberUuid === currentUserUuid ? packetIdForUser : undefined;
        sendPacket(targetWs, type, payload, responseId);
    }
}

export class ChatMessageHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: content, c: replyTargetId } = packet.payload;
        const numericChannelId = Number(channelId);

        if (!db.isChannelMember(numericChannelId, ws.data.userUuid)) {
            this.send(ws, "chat.ServerChatChannelMessageRejectedPacket", { reason: "NOT_A_MEMBER" }, packet.id);
            return;
        }

        const timestamp = Date.now();
        const messageId = db.saveChatMessage(numericChannelId, ws.data.userUuid, content, timestamp, replyTargetId ?? null);
        const message = buildChatMessage({
            id: messageId,
            channel_id: numericChannelId,
            sender_uuid: ws.data.userUuid,
            content,
            reply_to_id: replyTargetId ?? null,
            edited_at: null,
            timestamp
        });

        sendToChannelMembers(numericChannelId, "chat.ServerChatChannelMessagePacket", { a: [message] }, packet.id, ws.data.userUuid);
    }
}

export class ChatHistoryHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: before, d: limit } = packet.payload;
        const numericChannelId = Number(channelId);

        if (!db.isChannelMember(numericChannelId, ws.data.userUuid)) {
            this.send(ws, "chat.ServerChatChannelMessagePacket", { a: [] }, packet.id);
            return;
        }

        const messages = db.getChatMessages(numericChannelId, limit || 50, before ?? undefined);
        this.send(ws, "chat.ServerChatChannelMessagePacket", { a: messages.map(buildChatMessage) }, packet.id);
    }
}

export class ChatChannelCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: type, b: rawName, c: requestedMembers } = packet.payload;
        const members = Array.from(new Set([ws.data.userUuid, ...requestedMembers]));

        if (type === "DIRECT_MESSAGE" && members.length === 2) {
            const existing = db.findDirectMessageChannel(members[0], members[1]);
            if (existing) {
                this.send(ws, "chat.ServerChatChannelAddPacket", {
                    a: [buildChannelForUser(existing, ws.data.userUuid)]
                }, packet.id);
                return;
            }
        }

        const timestamp = Date.now();
        const channelId = Math.floor(Math.random() * 1000000);
        const channel = {
            id: channelId,
            type,
            name: rawName || (type === "DIRECT_MESSAGE" ? "Direct Message" : "New Group"),
            owner_uuid: ws.data.userUuid,
            created_at: timestamp
        };

        db.saveChatChannel(channel, members);
        const payloads = new Map(members.map((memberUuid) => [memberUuid, { a: [buildChannelForUser(channel, memberUuid)] }]));

        for (const memberUuid of members) {
            const targetWs = CONNECTED_USERS.get(memberUuid);
            if (!targetWs) {
                continue;
            }
            sendPacket(
                targetWs,
                "chat.ServerChatChannelAddPacket",
                payloads.get(memberUuid),
                memberUuid === ws.data.userUuid ? packet.id : undefined
            );
        }
    }
}

export class ChatMessageEditHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: messageId, c: content } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        if (!db.isChannelMember(Number(channelId), ws.data.userUuid)) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Not a member" }, packet.id);
            return;
        }

        const result = user.editMessage(Number(messageId), content);
        if (result.success && result.message) {
            sendToChannelMembers(
                Number(channelId),
                "chat.ServerChatChannelMessagePacket",
                { a: [buildChatMessage(result.message)] }
            );
        }

        this.send(ws, "response.ResponseActionPacket", { a: result.success }, packet.id);
    }
}

export class ChatMessageDeleteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: messageId } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        if (!db.isChannelMember(Number(channelId), ws.data.userUuid)) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Not a member" }, packet.id);
            return;
        }

        const result = user.deleteMessage(Number(messageId));
        if (result.success && result.channelId) {
            sendToChannelMembers(result.channelId, "chat.ChatChannelMessageDeletePacket", {
                a: result.channelId,
                b: Number(messageId)
            });
        }

        this.send(ws, "response.ResponseActionPacket", { a: result.success }, packet.id);
    }
}

export class ChatMessageReportHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: messageId, c: reason } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        if (!db.isChannelMember(Number(channelId), ws.data.userUuid)) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Not a member" }, packet.id);
            return;
        }

        const success = user.reportMessage(Number(messageId), reason);
        if (!success) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Unable to create report" }, packet.id);
            return;
        }

        this.send(ws, "chat.ServerChatChannelMessageReportPacket", {
            report: {
                a: Date.now(),
                b: Number(channelId),
                c: Number(messageId),
                d: reason,
                e: { a: Date.now(), b: ws.data.userUuid },
                f: false,
                g: null
            }
        }, packet.id);
    }
}

export class ChatMemberAddHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: members } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);
        const results: Record<string, boolean> = {};

        for (const memberUuid of members as string[]) {
            results[memberUuid] = user.addChannelMember(Number(channelId), memberUuid);
        }

        const addedMembers = Object.entries(results)
            .filter(([, success]) => success)
            .map(([memberUuid]) => memberUuid);

        if (addedMembers.length > 0) {
            sendToChannelMembers(Number(channelId), "chat.ChatChannelMemberAddPacket", {
                a: Number(channelId),
                b: addedMembers
            });

            for (const memberUuid of addedMembers) {
                const targetWs = CONNECTED_USERS.get(memberUuid);
                if (targetWs) {
                    const channel = db.getChannel(Number(channelId));
                    sendPacket(targetWs, "chat.ServerChatChannelAddPacket", {
                        a: [buildChannelForUser(channel, memberUuid)]
                    });
                }
            }
        }

        this.send(ws, "chat.ServerChannelMemberActionResponsePacket", { a: results }, packet.id);
    }
}

export class ChatMemberRemoveHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: members } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);
        const results: Record<string, boolean> = {};

        for (const memberUuid of members as string[]) {
            results[memberUuid] = user.removeChannelMember(Number(channelId), memberUuid);
        }

        const removedMembers = Object.entries(results)
            .filter(([, success]) => success)
            .map(([memberUuid]) => memberUuid);

        if (removedMembers.length > 0) {
            sendToChannelMembers(Number(channelId), "chat.ChatChannelMemberRemovePacket", {
                a: Number(channelId),
                b: removedMembers
            });

            for (const memberUuid of removedMembers) {
                const removedWs = CONNECTED_USERS.get(memberUuid);
                if (removedWs) {
                    sendPacket(removedWs, "chat.ServerChatChannelRemovePacket", { a: [Number(channelId)] });
                }
            }
        }

        this.send(ws, "chat.ServerChannelMemberActionResponsePacket", { a: results }, packet.id);
    }
}

export class ChatChannelMuteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: channelId, b: muted } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);

        if (!db.isChannelMember(Number(channelId), ws.data.userUuid)) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Not a member" }, packet.id);
            return;
        }

        user.muteChannel(Number(channelId), muted);
        this.send(ws, "response.ResponseActionPacket", { a: true }, packet.id);
    }
}

export class ChatChannelReadStateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const channelId = Number(packet.payload.channel_id);
        const lastReadMessageId = packet.payload.last_read_message_id ?? null;

        if (!db.isChannelMember(channelId, ws.data.userUuid)) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Not a member" }, packet.id);
            return;
        }

        setChannelLastReadMessageId(channelId, ws.data.userUuid, lastReadMessageId);
        if (packet.id) {
            this.send(ws, "response.ResponseActionPacket", { a: true }, packet.id);
        }
    }
}

export class ChatMessageReadStateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const channelId = Number(packet.payload.a);
        const messageId = Number(packet.payload.b);
        const state = Boolean(packet.payload.c);

        if (!db.isChannelMember(channelId, ws.data.userUuid)) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Not a member" }, packet.id);
            return;
        }

        if (state) {
            const currentLastRead = getChannelLastReadMessageId(channelId, ws.data.userUuid);
            setChannelLastReadMessageId(channelId, ws.data.userUuid, Math.max(currentLastRead ?? 0, messageId));
        } else {
            setChannelLastReadMessageId(
                channelId,
                ws.data.userUuid,
                getPreviousReadableMessageId(channelId, ws.data.userUuid, messageId)
            );
        }

        if (packet.id) {
            this.send(ws, "response.ResponseActionPacket", { a: true }, packet.id);
        }
    }
}
