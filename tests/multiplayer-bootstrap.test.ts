import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import net from "node:net";

setDefaultTimeout(15000);

process.env.ESSENTIAL_DB_PATH = ".test-essential-multiplayer.db";
process.env.MEDIA_BASE_URL = "http://127.0.0.1:18082";

const { ConnectionCodec } = await import("../src/protocol");
const { handlePacket } = await import("../src/handlers/index");
const db = await import("../src/db");
const { CONNECTED_USERS } = await import("../src/state");
const { resetSessions } = await import("../src/upnpSessions");
const { buildChannelForUser } = await import("../src/chatPayloads");
const { User } = await import("../src/models/User");
const { createEssentialServer, sendInitialState } = await import("../src/index");

type FakeWs = {
    data: {
        userUuid: string;
        userName: string;
        codec: InstanceType<typeof ConnectionCodec>;
    };
    decodeCodec: InstanceType<typeof ConnectionCodec>;
    sent: Buffer[];
    send: (buffer: Buffer) => void;
    close: () => void;
};

const USERS = {
    alpha: { uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Alpha" },
    beta: { uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Beta" },
};

const essentialServer = createEssentialServer({
    port: 0,
    hostname: "127.0.0.1",
    mediaBaseUrl: "",
});
essentialServer.unref();
process.env.MEDIA_BASE_URL = essentialServer.url.origin;

function createWs(userUuid: string, userName: string): FakeWs {
    return {
        data: {
            userUuid,
            userName,
            codec: new ConnectionCodec(),
        },
        decodeCodec: new ConnectionCodec(),
        sent: [],
        send(buffer: Buffer) {
            this.sent.push(Buffer.from(buffer));
        },
        close() {
            return;
        }
    };
}

function connectUser(user: { uuid: string; name: string }) {
    const ws = createWs(user.uuid, user.name);
    CONNECTED_USERS.set(user.uuid, ws as any);
    return ws;
}

function readSentPackets(ws: FakeWs) {
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

function createChannel(owner: FakeWs, members: string[], type = "DIRECT_MESSAGE", name = "DM") {
    handlePacket(owner as any, {
        type: "chat.ClientChatChannelCreatePacket",
        id: "create-channel",
        payload: {
            a: type,
            b: name,
            c: members
        }
    });

    const ownerPackets = readSentPackets(owner);
    const channel = packetOfType(ownerPackets, "chat.ServerChatChannelAddPacket");
    if (!channel) {
        throw new Error("Channel creation did not produce ServerChatChannelAddPacket");
    }

    return {
        channelId: channel.payload.a[0].a,
        ownerPackets
    };
}

function createMessage(sender: FakeWs, channelId: number, content = "hello world") {
    handlePacket(sender as any, {
        type: "chat.ClientChatChannelMessageCreatePacket",
        id: "create-message",
        payload: {
            a: channelId,
            b: content,
            c: null
        }
    });

    const packets = readSentPackets(sender);
    const livePacket = packetOfType(packets, "chat.ServerChatChannelMessagePacket");
    if (!livePacket) {
        throw new Error("Message creation did not produce ServerChatChannelMessagePacket");
    }

    return {
        messageId: livePacket.payload.a[0].a,
        packets
    };
}

function disconnectConnectedUsers() {
    const connectedUsers = [...CONNECTED_USERS.values()];
    for (const client of connectedUsers) {
        try {
            client.terminate();
        } catch {
            // Ignore best-effort cleanup errors during tests.
        }
    }
    CONNECTED_USERS.clear();
}

function encodeVarInt(value: number) {
    const bytes: number[] = [];
    let current = value >>> 0;

    do {
        let temp = current & 0x7f;
        current >>>= 7;
        if (current !== 0) {
            temp |= 0x80;
        }
        bytes.push(temp);
    } while (current !== 0);

    return Buffer.from(bytes);
}

function wrapPacket(data: Buffer) {
    return Buffer.concat([encodeVarInt(data.length), data]);
}

function encodeString(value: string) {
    const encoded = Buffer.from(value, "utf8");
    return Buffer.concat([encodeVarInt(encoded.length), encoded]);
}

async function createMockMinecraftStatusServer(statusJson: string) {
    const server = net.createServer((socket) => {
        let step = 0;

        socket.on("data", () => {
            if (step === 0) {
                const responsePayload = Buffer.concat([encodeVarInt(0), encodeString(statusJson)]);
                socket.write(wrapPacket(responsePayload));
                step = 1;
                return;
            }

            if (step === 1) {
                const pongPayload = Buffer.concat([encodeVarInt(1), Buffer.alloc(8)]);
                socket.write(wrapPacket(pongPayload));
                step = 2;
            }
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => resolve());
        server.once("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Failed to resolve mock server address");
    }

    return {
        port: address.port,
        async close() {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
            });
        }
    };
}

beforeEach(() => {
    disconnectConnectedUsers();
    db.resetDatabase();
    resetSessions();

    for (const user of Object.values(USERS)) {
        db.upsertUser(user.uuid, user.name);
    }
});

beforeAll(() => {
    process.env.MEDIA_BASE_URL = essentialServer.url.origin;
});

afterAll(async () => {
    disconnectConnectedUsers();
    void essentialServer.stop(true);
    db.resetDatabase();
    resetSessions();
});

describe("multiplayer and bootstrap contracts", () => {
    test("bootstrap publishes allowed domains, trusted hosts, visibility state, and normalized locales", () => {
        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);
        sendInitialState(alpha as any, new User(USERS.alpha.uuid, USERS.alpha.name), essentialServer.url.origin);

        const packets = readSentPackets(alpha);
        const allowedDomains = packetOfType(packets, "social.ServerSocialAllowedDomainsPacket");
        const trustedHosts = packetOfType(packets, "profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket");
        const visibility = packetOfType(packets, "cosmetic.ServerCosmeticsUserEquippedVisibilityPacket");
        const cosmeticTypes = packetOfType(packets, "cosmetic.ServerCosmeticTypesPopulatePacket");
        const categories = packetOfType(packets, "cosmetic.categories.ServerCosmeticCategoriesPopulatePacket");

        expect(allowedDomains.payload.domains).toContain("127.0.0.1");
        expect(allowedDomains.payload.domains).toContain("localhost");
        expect(trustedHosts.payload.a[0].c).toEqual(expect.arrayContaining(["127.0.0.1", "localhost"]));
        expect(visibility.payload.a).toBe(true);
        expect(typeof cosmeticTypes.payload.a[0].c.en_US).toBe("string");
        expect(cosmeticTypes.payload.a[0].c.en_us).toBeUndefined();
        expect(categories.payload.a[0].b.en_US).toBe("Capes");
        expect(categories.payload.a[0].b.en_us).toBeUndefined();
    });

    test("cosmetic animation trigger is broadcast to other connected clients", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);

        handlePacket(alpha as any, {
            type: "cosmetic.ClientCosmeticAnimationTriggerPacket",
            id: "animation-trigger",
            payload: {
                a: "EMOTE",
                b: "wave",
            }
        });

        const alphaPackets = readSentPackets(alpha);
        const betaPackets = readSentPackets(beta);
        const ack = packetOfType(alphaPackets, "response.ResponseActionPacket");
        const broadcast = packetOfType(betaPackets, "cosmetic.ServerCosmeticAnimationTriggerPacket");

        expect(ack?.payload.a).toBe(true);
        expect(broadcast?.payload.a).toBe(USERS.alpha.uuid);
        expect(broadcast?.payload.b).toBe("EMOTE");
        expect(broadcast?.payload.c).toBe("wave");
    });

    test("ping proxy returns a Minecraft status response through CM", async () => {
        const alpha = connectUser(USERS.alpha);
        const mockServer = await createMockMinecraftStatusServer(JSON.stringify({
            version: { name: "1.20.1", protocol: 763 },
            players: { online: 2, max: 8 },
            description: { text: "Local Test - My SPS World" },
        }));

        try {
            await handlePacket(alpha as any, {
                type: "pingproxy.ClientPingProxyPacket",
                id: "ping-proxy",
                payload: {
                    a: "127.0.0.1",
                    b: mockServer.port,
                    c: 763,
                }
            });

            const packets = readSentPackets(alpha);
            const response = packetOfType(packets, "pingproxy.ServerPingProxyResponsePacket");

            expect(response).toBeTruthy();
            expect(JSON.parse(response.payload.a).players.online).toBe(2);
            expect(JSON.parse(response.payload.a).description.text).toBe("Local Test - My SPS World");
            expect(response.payload.b).toBeGreaterThanOrEqual(0);
            expect(response.payload.c).toBe("local");
        } finally {
            await mockServer.close();
        }
    });

    test("trusted host create/delete packets persist user hosts and affect later bootstrap state", async () => {
        const alpha = connectUser(USERS.alpha);

        await handlePacket(alpha as any, {
            type: "profile.trustedhosts.ClientProfileTrustedHostsCreatePacket",
            id: "trusted-host-create",
            payload: {
                a: "Screenshots",
                b: ["images.example.test", "cdn.example.test"],
            }
        });

        let packets = readSentPackets(alpha);
        const created = packetOfType(packets, "profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket");
        expect(created).toBeTruthy();
        expect(created.payload.a[0].b).toBe("Screenshots");
        expect(created.payload.a[0].c).toEqual(["images.example.test", "cdn.example.test"]);
        const trustedHostId = created.payload.a[0].a;

        let bootstrapWs = createWs(USERS.alpha.uuid, USERS.alpha.name);
        sendInitialState(bootstrapWs as any, new User(USERS.alpha.uuid, USERS.alpha.name), essentialServer.url.origin);

        packets = readSentPackets(bootstrapWs);
        let bootstrapPopulate = packetOfType(packets, "profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket");
        expect(bootstrapPopulate.payload.a.some((entry: any) => entry.a === trustedHostId && entry.d === USERS.alpha.uuid)).toBe(true);

        await handlePacket(alpha as any, {
            type: "profile.trustedhosts.ClientProfileTrustedHostsDeletePacket",
            id: "trusted-host-delete",
            payload: {
                a: trustedHostId,
            }
        });

        packets = readSentPackets(alpha);
        const removed = packetOfType(packets, "profile.trustedhosts.ServerProfileTrustedHostsRemovePacket");
        expect(removed).toBeTruthy();
        expect(removed.payload.a).toContain(trustedHostId);

        bootstrapWs = createWs(USERS.alpha.uuid, USERS.alpha.name);
        sendInitialState(bootstrapWs as any, new User(USERS.alpha.uuid, USERS.alpha.name), essentialServer.url.origin);

        packets = readSentPackets(bootstrapWs);
        bootstrapPopulate = packetOfType(packets, "profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket");
        expect(bootstrapPopulate.payload.a.some((entry: any) => entry.a === trustedHostId)).toBe(false);
    });

    test("chat read-state packets persist last read message id and computed unread counts", async () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);
        const { channelId } = createChannel(alpha, [USERS.beta.uuid]);
        readSentPackets(beta);

        const firstMessage = createMessage(beta, channelId, "first unread");
        readSentPackets(alpha);
        const secondMessage = createMessage(beta, channelId, "second unread");
        readSentPackets(alpha);

        await handlePacket(alpha as any, {
            type: "chat.ClientChatChannelReadStatePacket",
            id: "mark-second-read",
            payload: {
                channel_id: channelId,
                last_read_message_id: secondMessage.messageId,
            }
        });

        const thirdMessage = createMessage(beta, channelId, "third unread");
        readSentPackets(alpha);

        const bootstrappedChannel = buildChannelForUser(db.getChannel(channelId), USERS.alpha.uuid);

        expect(bootstrappedChannel.last_read_message_id).toBe(secondMessage.messageId);
        expect(bootstrappedChannel.unread_messages).toBe(1);
        expect(bootstrappedChannel.last_read_message_id).toBeGreaterThanOrEqual(firstMessage.messageId);
        expect(thirdMessage.messageId).toBeGreaterThan(secondMessage.messageId);
    });

    test("chat mute state is persisted per user and isolated between channel members", async () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);
        const { channelId } = createChannel(alpha, [USERS.beta.uuid]);
        readSentPackets(alpha);
        readSentPackets(beta);

        await handlePacket(alpha as any, {
            type: "chat.ClientChatChannelMutePacket",
            id: "mute-channel",
            payload: {
                a: channelId,
                b: true,
            }
        });

        let packets = readSentPackets(alpha);
        const response = packetOfType(packets, "response.ResponseActionPacket");
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(true);

        expect(buildChannelForUser(db.getChannel(channelId), USERS.alpha.uuid).i).toBe(true);
        expect(buildChannelForUser(db.getChannel(channelId), USERS.beta.uuid).i).toBe(false);

        let bootstrapWs = createWs(USERS.alpha.uuid, USERS.alpha.name);
        sendInitialState(bootstrapWs as any, new User(USERS.alpha.uuid, USERS.alpha.name), essentialServer.url.origin);
        packets = readSentPackets(bootstrapWs);
        let channelAdd = packetOfType(packets, "chat.ServerChatChannelAddPacket");
        expect(channelAdd.payload.a.some((channel: any) => channel.a === channelId && channel.i === true)).toBe(true);

        bootstrapWs = createWs(USERS.beta.uuid, USERS.beta.name);
        sendInitialState(bootstrapWs as any, new User(USERS.beta.uuid, USERS.beta.name), essentialServer.url.origin);
        packets = readSentPackets(bootstrapWs);
        channelAdd = packetOfType(packets, "chat.ServerChatChannelAddPacket");
        expect(channelAdd.payload.a.some((channel: any) => channel.a === channelId && channel.i === true)).toBe(false);
    });
});
