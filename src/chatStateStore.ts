import { db } from "./db";

db.run(`
  CREATE TABLE IF NOT EXISTS channel_user_state (
    channel_id INTEGER NOT NULL,
    user_uuid TEXT NOT NULL,
    last_read_message_id INTEGER,
    muted INTEGER DEFAULT 0,
    PRIMARY KEY (channel_id, user_uuid)
  );
`);

try { db.run("ALTER TABLE channel_user_state ADD COLUMN muted INTEGER DEFAULT 0;"); } catch (e) {}

export function getChannelLastReadMessageId(channelId: number, userUuid: string) {
    const row = db.query(
        "SELECT last_read_message_id FROM channel_user_state WHERE channel_id = ? AND user_uuid = ?"
    ).get(channelId, userUuid) as { last_read_message_id: number | null } | null;

    return row?.last_read_message_id ?? null;
}

export function setChannelLastReadMessageId(channelId: number, userUuid: string, lastReadMessageId: number | null) {
    db.run(
        `
        INSERT INTO channel_user_state (channel_id, user_uuid, last_read_message_id, muted)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(channel_id, user_uuid) DO UPDATE SET
            last_read_message_id = excluded.last_read_message_id
        `,
        [channelId, userUuid, lastReadMessageId]
    );
}

export function getChannelMuted(channelId: number, userUuid: string) {
    const row = db.query(
        "SELECT muted FROM channel_user_state WHERE channel_id = ? AND user_uuid = ?"
    ).get(channelId, userUuid) as { muted: number } | null;

    return row?.muted === 1;
}

export function setChannelMuted(channelId: number, userUuid: string, muted: boolean) {
    db.run(
        `
        INSERT INTO channel_user_state (channel_id, user_uuid, last_read_message_id, muted)
        VALUES (?, ?, NULL, ?)
        ON CONFLICT(channel_id, user_uuid) DO UPDATE SET
            muted = excluded.muted
        `,
        [channelId, userUuid, muted ? 1 : 0]
    );
}

export function getPreviousReadableMessageId(channelId: number, userUuid: string, beforeMessageId: number) {
    const row = db.query(
        `
        SELECT id FROM chat_messages
        WHERE channel_id = ?
          AND sender_uuid != ?
          AND deleted = 0
          AND id < ?
        ORDER BY id DESC
        LIMIT 1
        `
    ).get(channelId, userUuid, beforeMessageId) as { id: number } | null;

    return row?.id ?? null;
}

export function getUnreadMessageCount(channelId: number, userUuid: string, lastReadMessageId: number | null) {
    const row = db.query(
        `
        SELECT COUNT(*) as unread_count FROM chat_messages
        WHERE channel_id = ?
          AND sender_uuid != ?
          AND deleted = 0
          AND (? IS NULL OR id > ?)
        `
    ).get(channelId, userUuid, lastReadMessageId, lastReadMessageId) as { unread_count: number };

    return Number(row?.unread_count ?? 0);
}
