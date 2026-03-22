import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env.ESSENTIAL_DB_PATH = ".test-essential-lifecycle.db";

const db = await import("../src/db");
const { ConnectionCodec } = await import("../src/protocol");
const { CONNECTED_USERS } = await import("../src/state");
const { createEssentialServer } = await import("../src/index");

type LiveClient = {
    socket: WebSocket;
    codec: InstanceType<typeof ConnectionCodec>;
    packets: any[];
    closed: boolean;
    closeCode: number | null;
};

const USERS = {
    alpha: { uuid: "cccccccc-1111-2222-3333-cccccccccccc", name: "Alpha" },
    beta: { uuid: "dddddddd-1111-2222-3333-dddddddddddd", name: "Beta" },
};
const ACTIVE_CLIENTS = new Set<LiveClient>();

const essentialServer = createEssentialServer({
    port: 0,
    hostname: "127.0.0.1",
    mediaBaseUrl: "",
    keepAliveIntervalMs: 50,
});
essentialServer.unref();

function disconnectConnectedUsers() {
    for (const socket of CONNECTED_USERS.values()) {
        try {
            socket.terminate();
        } catch {}
    }
    CONNECTED_USERS.clear();
}

function packetOfType(packets: any[], type: string) {
    return [...packets].reverse().find((packet) => packet.type === type);
}

function drainLivePackets(client: LiveClient) {
    return client.packets.splice(0);
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (condition()) {
            return;
        }
        await Bun.sleep(10);
    }

    throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

function decodeClientBuffer(codec: InstanceType<typeof ConnectionCodec>, data: unknown) {
    if (typeof data === "string") {
        return codec.decode(Buffer.from(data));
    }
    if (data instanceof Buffer) {
        return codec.decode(data);
    }
    if (data instanceof ArrayBuffer) {
        return codec.decode(Buffer.from(data));
    }
    if (ArrayBuffer.isView(data)) {
        return codec.decode(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    }

    return null;
}

async function openLiveClient(user: { uuid: string; name: string }, protocolVersion = 9): Promise<LiveClient> {
    const client: LiveClient = {
        socket: new WebSocket(`${essentialServer.url.origin.replace("http", "ws")}/v1`, {
            headers: {
                "Essential-User-UUID": user.uuid,
                "Essential-User-Name": user.name,
                "Essential-Max-Protocol-Version": String(protocolVersion),
            }
        }),
        codec: new ConnectionCodec(),
        packets: [],
        closed: false,
        closeCode: null,
    };

    client.socket.addEventListener("message", (event: MessageEvent) => {
        const packet = decodeClientBuffer(client.codec, event.data);
        if (packet) {
            client.packets.push(packet);
        }
    });
    client.socket.addEventListener("close", (event: CloseEvent) => {
        client.closed = true;
        client.closeCode = event.code;
        ACTIVE_CLIENTS.delete(client);
    });

    await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
            client.socket.removeEventListener("error", onError);
            resolve();
        };
        const onError = (event: Event) => {
            client.socket.removeEventListener("open", onOpen);
            reject(event);
        };

        client.socket.addEventListener("open", onOpen, { once: true });
        client.socket.addEventListener("error", onError, { once: true });
    });

    ACTIVE_CLIENTS.add(client);
    return client;
}

async function closeLiveClient(client: LiveClient) {
    if (client.socket.readyState === WebSocket.CLOSED) {
        ACTIVE_CLIENTS.delete(client);
        return;
    }

    await Promise.race([
        new Promise<void>((resolve) => {
            client.socket.addEventListener("close", () => resolve(), { once: true });
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.close();
            } else if (client.socket.readyState === WebSocket.CLOSING) {
                resolve();
            }
        }),
        Bun.sleep(500),
    ]);
    ACTIVE_CLIENTS.delete(client);
}

function bestEffortCloseLiveClient(client: LiveClient) {
    try {
        if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
            client.socket.close();
        }
    } catch {}

    ACTIVE_CLIENTS.delete(client);
}

function sendLivePacket(client: LiveClient, type: string, payload: any, id = crypto.randomUUID()) {
    for (const buffer of client.codec.encode(type, payload, id)) {
        client.socket.send(buffer);
    }
}

async function closeTrackedClients() {
    for (const client of [...ACTIVE_CLIENTS]) {
        bestEffortCloseLiveClient(client);
    }
    await Bun.sleep(25);
}

beforeEach(async () => {
    await closeTrackedClients();
    disconnectConnectedUsers();
    await Bun.sleep(25);
    db.resetDatabase();

    for (const user of Object.values(USERS)) {
        db.upsertUser(user.uuid, user.name);
    }
});

afterAll(async () => {
    await closeTrackedClients();
    disconnectConnectedUsers();
    await Bun.sleep(25);
    void essentialServer.stop(true);
    db.resetDatabase();
});

describe("connection lifecycle", () => {
    test("active websocket receives periodic keepalive packets", async () => {
        const alpha = await openLiveClient(USERS.alpha);

        try {
            await waitUntil(() => alpha.packets.length > 0);
            drainLivePackets(alpha);

            await waitUntil(
                () => alpha.packets.some((packet) => packet.type === "connection.ConnectionKeepAlivePacket"),
                1500
            );

            const keepalive = packetOfType(drainLivePackets(alpha), "connection.ConnectionKeepAlivePacket");
            expect(keepalive).toBeTruthy();
        } finally {
            bestEffortCloseLiveClient(alpha);
        }
    });

    test("client disconnect packet closes the active socket and broadcasts offline presence", async () => {
        const beta = await openLiveClient(USERS.beta);

        try {
            await waitUntil(() => beta.packets.length > 0);
            drainLivePackets(beta);

            const alpha = await openLiveClient(USERS.alpha);
            try {
                await waitUntil(() => beta.packets.some((packet) =>
                    packet.type === "profile.ServerProfileStatusPacket"
                    && packet.payload.a === USERS.alpha.uuid
                    && packet.payload.b === "ONLINE"
                ));
                drainLivePackets(beta);
                drainLivePackets(alpha);

                sendLivePacket(alpha, "connection.ClientConnectionDisconnectPacket", {
                    message: "client requested disconnect",
                }, "client-disconnect");

                await waitUntil(() => alpha.closed, 1500);
                await waitUntil(() => beta.packets.some((packet) =>
                    packet.type === "profile.ServerProfileStatusPacket"
                    && packet.payload.a === USERS.alpha.uuid
                    && packet.payload.b === "OFFLINE"
                ), 1500);

                const offline = packetOfType(drainLivePackets(beta), "profile.ServerProfileStatusPacket");
                expect(offline).toBeTruthy();
                expect(offline.payload.a).toBe(USERS.alpha.uuid);
                expect(offline.payload.b).toBe("OFFLINE");
            } finally {
                if (alpha.socket.readyState !== WebSocket.CLOSED) {
                    bestEffortCloseLiveClient(alpha);
                }
            }
        } finally {
            bestEffortCloseLiveClient(beta);
        }
    });

    test("replacement socket keeps receiving keepalive packets after forced reconnect", async () => {
        const alphaFirst = await openLiveClient(USERS.alpha);

        try {
            await waitUntil(() => alphaFirst.packets.length > 0);
            drainLivePackets(alphaFirst);

            const alphaSecond = await openLiveClient(USERS.alpha);
            try {
                await waitUntil(() => alphaFirst.closed, 1500);
                await waitUntil(
                    () => alphaSecond.packets.some((packet) => packet.type === "connection.ConnectionKeepAlivePacket"),
                    1500
                );

                const reconnectPacket = packetOfType(drainLivePackets(alphaFirst), "connection.ServerConnectionReconnectPacket");
                const keepalive = packetOfType(drainLivePackets(alphaSecond), "connection.ConnectionKeepAlivePacket");
                expect(reconnectPacket).toBeTruthy();
                expect(alphaFirst.closeCode).toBe(4507);
                expect(keepalive).toBeTruthy();
            } finally {
                bestEffortCloseLiveClient(alphaSecond);
            }
        } finally {
            if (alphaFirst.socket.readyState !== WebSocket.CLOSED) {
                bestEffortCloseLiveClient(alphaFirst);
            }
        }
    });
});
