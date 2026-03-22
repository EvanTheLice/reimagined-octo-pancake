import { beforeEach, describe, expect, test } from "bun:test";

process.env.ESSENTIAL_DB_PATH = ".test-essential-transport.db";

const db = await import("../src/db");
const { ConnectionCodec } = await import("../src/protocol");
const { CONNECTED_USERS } = await import("../src/state");
const { processSocketMessage } = await import("../src/index");

type FakeWs = {
    data: {
        userUuid: string;
        userName: string;
        codec: InstanceType<typeof ConnectionCodec>;
        superseded?: boolean;
    };
    decodeCodec: InstanceType<typeof ConnectionCodec>;
    sent: Buffer[];
    closed: boolean;
    send: (buffer: Buffer) => void;
    close: () => void;
};

const USERS = {
    alpha: { uuid: "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa", name: "Alpha" },
    beta: { uuid: "bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb", name: "Beta" },
};

function createWs(user: { uuid: string; name: string }, superseded = false): FakeWs {
    return {
        data: {
            userUuid: user.uuid,
            userName: user.name,
            codec: new ConnectionCodec(),
            superseded,
        },
        decodeCodec: new ConnectionCodec(),
        sent: [],
        closed: false,
        send(buffer: Buffer) {
            this.sent.push(Buffer.from(buffer));
        },
        close() {
            this.closed = true;
        },
    };
}

function drainPackets(ws: FakeWs) {
    const packets = [];

    for (const buffer of ws.sent.splice(0)) {
        const decoded = ws.decodeCodec.decode(buffer);
        if (decoded) {
            packets.push(decoded);
        }
    }

    return packets;
}

function packetOfType(packets: any[], type: string) {
    return [...packets].reverse().find((packet) => packet.type === type);
}

async function sendEncodedPacket(ws: FakeWs, type: string, payload: any, id: string) {
    for (const buffer of ws.data.codec.encode(type, payload, id)) {
        await processSocketMessage(ws as any, buffer);
    }
}

beforeEach(() => {
    CONNECTED_USERS.clear();
    db.resetDatabase();

    for (const user of Object.values(USERS)) {
        db.upsertUser(user.uuid, user.name);
    }
});

describe("connection transport", () => {
    test("superseded sockets cannot emit packets after a reconnect replacement", async () => {
        const alphaOld = createWs(USERS.alpha, true);
        const alphaNew = createWs(USERS.alpha);
        const beta = createWs(USERS.beta);

        CONNECTED_USERS.set(USERS.alpha.uuid, alphaNew as any);
        CONNECTED_USERS.set(USERS.beta.uuid, beta as any);

        await sendEncodedPacket(alphaOld, "profile.ClientProfileActivityPacket", {
                a: "PLAYING",
                c: { server: "stale.example.net" },
            }, "stale-activity");

        expect(packetOfType(drainPackets(beta), "profile.ServerProfileActivityPacket")).toBeUndefined();

        await sendEncodedPacket(alphaNew, "profile.ClientProfileActivityPacket", {
                a: "PLAYING",
                c: { server: "fresh.example.net" },
            }, "fresh-activity");

        const liveBroadcast = packetOfType(drainPackets(beta), "profile.ServerProfileActivityPacket");
        expect(liveBroadcast).toBeTruthy();
        expect(liveBroadcast.payload).toEqual({
            a: USERS.alpha.uuid,
            b: "PLAYING",
            c: { server: "fresh.example.net" },
        });
    });

    test("non-binary and unknown binary frames are ignored without affecting the active connection", async () => {
        const alpha = createWs(USERS.alpha);
        const beta = createWs(USERS.beta);

        CONNECTED_USERS.set(USERS.alpha.uuid, alpha as any);
        CONNECTED_USERS.set(USERS.beta.uuid, beta as any);

        await processSocketMessage(alpha as any, "not-a-binary-frame");
        await processSocketMessage(alpha as any, Buffer.from([0, 0, 0, 99, 0, 0, 0, 0, 0, 0, 0, 2, 123, 125]));

        expect(packetOfType(drainPackets(beta), "profile.ServerProfileActivityPacket")).toBeUndefined();
        expect(alpha.closed).toBe(false);

        await sendEncodedPacket(alpha, "profile.ClientProfileActivityPacket", {
            a: "PLAYING",
            c: { server: "after-garbage.example.net" },
        }, "after-garbage");

        const broadcast = packetOfType(drainPackets(beta), "profile.ServerProfileActivityPacket");
        expect(broadcast).toBeTruthy();
        expect(broadcast.payload).toEqual({
            a: USERS.alpha.uuid,
            b: "PLAYING",
            c: { server: "after-garbage.example.net" },
        });
    });
});
