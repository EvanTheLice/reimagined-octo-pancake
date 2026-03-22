import * as db from "./db";
import { getChannelLastReadMessageId, getChannelMuted, getUnreadMessageCount } from "./chatStateStore";

export function buildChatMessage(message: any) {
    return {
        a: message.id,
        b: message.channel_id,
        c: message.sender_uuid,
        d: message.content,
        e: false,
        f: message.reply_to_id,
        g: message.edited_at,
        created_at: message.timestamp,
    };
}

export function buildChannelForUser(channel: any, userUuid: string) {
    const lastReadMessageId = getChannelLastReadMessageId(channel.id, userUuid);
    const unreadMessages = getUnreadMessageCount(channel.id, userUuid, lastReadMessageId);

    return {
        a: channel.id,
        b: channel.type,
        c: channel.name,
        d: null,
        e: null,
        f: db.getChannelMembers(channel.id),
        g: { a: channel.created_at, b: channel.owner_uuid },
        h: null,
        i: getChannelMuted(channel.id, userUuid),
        joined_at: channel.created_at,
        last_read_message_id: lastReadMessageId,
        unread_messages: unreadMessages,
    };
}
