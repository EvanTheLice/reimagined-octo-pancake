import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(15000);

process.env.ESSENTIAL_DB_PATH = ".test-essential.db";
process.env.MEDIA_BASE_URL = "http://127.0.0.1:18080";

const { ConnectionCodec } = await import("../src/protocol");
const { handlePacket } = await import("../src/handlers/index");
const db = await import("../src/db");
const { User } = await import("../src/models/User");
const { CONNECTED_USERS } = await import("../src/state");
const { resetSessions } = await import("../src/upnpSessions");
const { createEssentialServer } = await import("../src/index");
const { buildChannelForUser } = await import("../src/chatPayloads");

type FakeWs = {
    data: {
        userUuid: string;
        userName: string;
        codec: InstanceType<typeof ConnectionCodec>;
    };
    decodeCodec: InstanceType<typeof ConnectionCodec>;
    sent: Buffer[];
    closed: boolean;
    send: (buffer: Buffer) => void;
    close: () => void;
};

type LiveClient = {
    socket: WebSocket;
    codec: InstanceType<typeof ConnectionCodec>;
    packets: any[];
    closed: boolean;
    closeCode: number | null;
};

function createWs(userUuid: string, userName: string): FakeWs {
    return {
        data: {
            userUuid,
            userName,
            codec: new ConnectionCodec(),
        },
        decodeCodec: new ConnectionCodec(),
        sent: [],
        closed: false,
        send(buffer: Buffer) {
            this.sent.push(Buffer.from(buffer));
        },
        close() {
            this.closed = true;
        }
    };
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

function connectUser(user: { uuid: string; name: string }) {
    const ws = createWs(user.uuid, user.name);
    CONNECTED_USERS.set(ws.data.userUuid, ws as any);
    return ws;
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

const USERS = {
    alpha: { uuid: "11111111-1111-1111-1111-111111111111", name: "Alpha" },
    beta: { uuid: "22222222-2222-2222-2222-222222222222", name: "Beta" },
    gamma: { uuid: "33333333-3333-3333-3333-333333333333", name: "Gamma" }
};

const essentialServer = createEssentialServer({
    port: 0,
    hostname: "127.0.0.1",
    mediaBaseUrl: "",
});
essentialServer.unref();
process.env.MEDIA_BASE_URL = essentialServer.url.origin;

function closeAllServerConnections() {
    for (const socket of CONNECTED_USERS.values()) {
        try {
            socket.terminate();
        } catch {}
    }
    CONNECTED_USERS.clear();
}

beforeEach(() => {
    closeAllServerConnections();
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
    closeAllServerConnections();
    void essentialServer.stop(true);
    db.resetDatabase();
    resetSessions();
});

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

    return client;
}

function drainLivePackets(client: LiveClient) {
    return client.packets.splice(0);
}

async function closeLiveClient(client: LiveClient) {
    if (client.socket.readyState === WebSocket.CLOSED) {
        return;
    }

    await new Promise<void>((resolve) => {
        client.socket.addEventListener("close", () => resolve(), { once: true });
        client.socket.close();
    });
}

function sendLivePacket(client: LiveClient, type: string, payload: any, id = crypto.randomUUID()) {
    for (const buffer of client.codec.encode(type, payload, id)) {
        client.socket.send(buffer);
    }

    return id;
}

describe("contract tests", () => {
    test("chat create + message history keep the same message id", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);
        const { channelId, ownerPackets: alphaCreatePackets } = createChannel(alpha, [USERS.beta.uuid]);
        const betaCreatePackets = readSentPackets(beta);
        const alphaAdd = packetOfType(alphaCreatePackets, "chat.ServerChatChannelAddPacket");
        const betaAdd = packetOfType(betaCreatePackets, "chat.ServerChatChannelAddPacket");

        expect(alphaAdd).toBeTruthy();
        expect(betaAdd).toBeTruthy();
        const { messageId: liveMessageId, packets: alphaMessagePackets } = createMessage(alpha, channelId);
        const betaMessagePackets = readSentPackets(beta);
        const livePacket = packetOfType(alphaMessagePackets, "chat.ServerChatChannelMessagePacket");
        const mirroredPacket = packetOfType(betaMessagePackets, "chat.ServerChatChannelMessagePacket");

        expect(livePacket).toBeTruthy();
        expect(mirroredPacket).toBeTruthy();

        handlePacket(alpha as any, {
            type: "chat.ClientChatChannelMessagesRetrievePacket",
            id: "history",
            payload: {
                a: channelId,
                b: null,
                c: null,
                d: 50
            }
        });

        const historyPackets = readSentPackets(alpha);
        const history = packetOfType(historyPackets, "chat.ServerChatChannelMessagePacket");
        expect(history.payload.a[0].a).toBe(liveMessageId);
    });

    test("invalid payload is rejected before handler execution", () => {
        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);

        handlePacket(alpha as any, {
            type: "chat.ClientChatChannelMessageCreatePacket",
            id: "invalid",
            payload: {
                a: 1,
                b: "",
                c: null
            }
        });

        const packets = readSentPackets(alpha);
        const response = packetOfType(packets, "response.ResponseActionPacket");
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(false);
    });

    test("selected skins request returns infra-formatted skin texture map", () => {
        const owner = new User(USERS.alpha.uuid, USERS.alpha.name);
        owner.createSkin("Skin", "CLASSIC", "abc123hash", false);

        const requester = createWs(USERS.beta.uuid, USERS.beta.name);
        handlePacket(requester as any, {
            type: "skin.ClientSelectedSkinsRequestPacket",
            id: "selected-skins",
            payload: {
                uuids: [USERS.alpha.uuid]
            }
        });

        const packets = readSentPackets(requester);
        const response = packetOfType(packets, "skin.ServerSelectedSkinsResponsePacket");
        expect(response).toBeTruthy();
        expect(response.payload.skins[USERS.alpha.uuid]).toBe("0;abc123hash");
    });

    test("selected outfit response uses infra packet shape expected by Essential", () => {
        const owner = new User(USERS.alpha.uuid, USERS.alpha.name);
        const skin = owner.createSkin("Skin", "SLIM", "slimhash", false);
        owner.createOutfit("Outfit", skin.id, { CAPE: "cape_free" }, { cape_free: [] });

        const requester = createWs(USERS.beta.uuid, USERS.beta.name);
        handlePacket(requester as any, {
            type: "cosmetic.outfit.ClientCosmeticOutfitSelectedRequestPacket",
            id: "selected-outfit",
            payload: { a: USERS.alpha.uuid }
        });

        const packets = readSentPackets(requester);
        const response = packetOfType(packets, "cosmetic.outfit.ServerCosmeticOutfitSelectedResponsePacket");
        expect(response).toBeTruthy();
        expect(response.payload.uuid).toBe(USERS.alpha.uuid);
        expect(response.payload.skinTexture).toBe("1;slimhash");
        expect(response.payload.equippedCosmetics.CAPE).toBe("cape_free");
        expect(response.payload.cosmeticSettings.cape_free).toEqual([]);
    });

    test("upnp session invite flow populates sessions and sends invite packet", () => {
        const host = connectUser(USERS.alpha);
        const guest = connectUser(USERS.beta);

        handlePacket(host as any, {
            type: "upnp.ClientUPnPSessionCreatePacket",
            id: "sps-create",
            payload: {
                a: "alpha.essential-sps",
                b: 25565,
                c: "INVITE_ONLY",
                d: 765,
                e: "Test World"
            }
        });

        let packets = readSentPackets(host);
        let response = packetOfType(packets, "upnp.ServerUPnPSessionPopulatePacket");
        expect(response).toBeTruthy();
        expect(response.payload.a[0].a).toBe(USERS.alpha.uuid);
        expect(response.payload.a[0].b).toBe("alpha.essential-sps");

        handlePacket(host as any, {
            type: "upnp.ClientUPnPSessionInvitesAddPacket",
            id: "sps-invite",
            payload: {
                a: [USERS.beta.uuid]
            }
        });

        packets = readSentPackets(guest);
        const invitePacket = packetOfType(packets, "upnp.ServerUPnPSessionInviteAddPacket");
        const populatePacket = packetOfType(packets, "upnp.ServerUPnPSessionPopulatePacket");
        expect(invitePacket).toBeTruthy();
        expect(invitePacket.payload.a).toBe(USERS.alpha.uuid);
        expect(populatePacket.payload.a[0].e).toContain(USERS.beta.uuid);
    });

    test("friend request accept flow matches Essential relationship manager expectations", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);

        handlePacket(alpha as any, {
            type: "relationships.ClientRelationshipCreatePacket",
            id: "friend-request",
            payload: {
                a: USERS.beta.uuid,
                b: "FRIENDS"
            }
        });

        let packets = readSentPackets(alpha);
        let populate = packetOfType(packets, "relationships.ServerRelationshipPopulatePacket");
        expect(populate).toBeTruthy();
        expect(populate.payload.a[0]).toMatchObject({
            a: USERS.alpha.uuid,
            b: USERS.beta.uuid,
            c: "FRIENDS",
            d: "PENDING"
        });

        packets = readSentPackets(beta);
        populate = packetOfType(packets, "relationships.ServerRelationshipPopulatePacket");
        expect(populate).toBeTruthy();
        expect(populate.payload.a[0]).toMatchObject({
            a: USERS.alpha.uuid,
            b: USERS.beta.uuid,
            c: "FRIENDS",
            d: "PENDING"
        });

        handlePacket(beta as any, {
            type: "relationships.ClientRelationshipCreatePacket",
            id: "friend-accept",
            payload: {
                a: USERS.alpha.uuid,
                b: "FRIENDS"
            }
        });

        packets = readSentPackets(beta);
        populate = packetOfType(packets, "relationships.ServerRelationshipPopulatePacket");
        const betaStatus = packetOfType(packets, "profile.ServerProfileStatusPacket");
        expect(populate).toBeTruthy();
        expect(populate.payload.a[0]).toMatchObject({
            a: USERS.beta.uuid,
            b: USERS.alpha.uuid,
            c: "FRIENDS",
            d: "VERIFIED"
        });
        expect(betaStatus).toBeTruthy();
        expect(betaStatus.payload.a).toBe(USERS.alpha.uuid);

        packets = readSentPackets(alpha);
        populate = packetOfType(packets, "relationships.ServerRelationshipPopulatePacket");
        const alphaStatus = packetOfType(packets, "profile.ServerProfileStatusPacket");
        expect(populate).toBeTruthy();
        expect(populate.payload.a[0]).toMatchObject({
            a: USERS.alpha.uuid,
            b: USERS.beta.uuid,
            c: "FRIENDS",
            d: "VERIFIED"
        });
        expect(alphaStatus).toBeTruthy();
        expect(alphaStatus.payload.a).toBe(USERS.beta.uuid);
        expect(new User(USERS.alpha.uuid, USERS.alpha.name).isFriendWith(USERS.beta.uuid)).toBe(true);
        expect(new User(USERS.beta.uuid, USERS.beta.name).isFriendWith(USERS.alpha.uuid)).toBe(true);
    });

    test("declining a friend request emits delete packet with pending state for client cache removal", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);

        handlePacket(alpha as any, {
            type: "relationships.ClientRelationshipCreatePacket",
            id: "friend-request",
            payload: {
                a: USERS.beta.uuid,
                b: "FRIENDS"
            }
        });

        readSentPackets(alpha);
        readSentPackets(beta);

        handlePacket(beta as any, {
            type: "relationships.RelationshipDeletePacket",
            id: "friend-decline",
            payload: {
                a: USERS.alpha.uuid,
                b: "FRIENDS"
            }
        });

        let packets = readSentPackets(beta);
        const betaDelete = packetOfType(packets, "relationships.ServerRelationshipDeletePacket");
        const response = packetOfType(packets, "response.ResponseActionPacket");
        expect(betaDelete).toBeTruthy();
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(true);

        packets = readSentPackets(alpha);
        const alphaDelete = packetOfType(packets, "relationships.ServerRelationshipDeletePacket");
        expect(alphaDelete).toBeTruthy();
        expect(alphaDelete.payload.a).toMatchObject({
            a: USERS.alpha.uuid,
            b: USERS.beta.uuid,
            c: "FRIENDS",
            d: "PENDING"
        });
        expect(new User(USERS.alpha.uuid, USERS.alpha.name).hasOutgoingFriendRequest(USERS.beta.uuid)).toBe(false);
        expect(new User(USERS.beta.uuid, USERS.beta.name).hasIncomingFriendRequest(USERS.alpha.uuid)).toBe(false);
    });

    test("channel member add and remove packets keep group membership in sync", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);
        const gamma = connectUser(USERS.gamma);
        const { channelId } = createChannel(alpha, [USERS.beta.uuid], "GROUP_DIRECT_MESSAGE", "Group");

        readSentPackets(beta);
        readSentPackets(gamma);

        handlePacket(alpha as any, {
            type: "chat.ChatChannelMemberAddPacket",
            id: "member-add",
            payload: {
                a: channelId,
                b: [USERS.gamma.uuid]
            }
        });

        let packets = readSentPackets(alpha);
        let response = packetOfType(packets, "chat.ServerChannelMemberActionResponsePacket");
        let memberPacket = packetOfType(packets, "chat.ChatChannelMemberAddPacket");
        expect(response).toBeTruthy();
        expect(response.payload.a[USERS.gamma.uuid]).toBe(true);
        expect(memberPacket).toBeTruthy();
        expect(memberPacket.payload.b).toContain(USERS.gamma.uuid);

        packets = readSentPackets(beta);
        memberPacket = packetOfType(packets, "chat.ChatChannelMemberAddPacket");
        expect(memberPacket).toBeTruthy();
        expect(memberPacket.payload.a).toBe(channelId);

        packets = readSentPackets(gamma);
        const gammaMemberAdd = packetOfType(packets, "chat.ChatChannelMemberAddPacket");
        const gammaChannelAdd = packetOfType(packets, "chat.ServerChatChannelAddPacket");
        expect(gammaMemberAdd).toBeTruthy();
        expect(gammaChannelAdd).toBeTruthy();
        expect(gammaChannelAdd.payload.a[0].f).toContain(USERS.gamma.uuid);

        handlePacket(alpha as any, {
            type: "chat.ChatChannelMemberRemovePacket",
            id: "member-remove",
            payload: {
                a: channelId,
                b: [USERS.gamma.uuid]
            }
        });

        packets = readSentPackets(alpha);
        response = packetOfType(packets, "chat.ServerChannelMemberActionResponsePacket");
        memberPacket = packetOfType(packets, "chat.ChatChannelMemberRemovePacket");
        expect(response).toBeTruthy();
        expect(response.payload.a[USERS.gamma.uuid]).toBe(true);
        expect(memberPacket).toBeTruthy();
        expect(memberPacket.payload.b).toContain(USERS.gamma.uuid);

        packets = readSentPackets(beta);
        memberPacket = packetOfType(packets, "chat.ChatChannelMemberRemovePacket");
        expect(memberPacket).toBeTruthy();
        expect(memberPacket.payload.a).toBe(channelId);

        packets = readSentPackets(gamma);
        const gammaChannelRemove = packetOfType(packets, "chat.ServerChatChannelRemovePacket");
        expect(gammaChannelRemove).toBeTruthy();
        expect(gammaChannelRemove.payload.a).toEqual([channelId]);
    });

    test("message report and delete flows emit the packets the client consumes", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);
        const { channelId } = createChannel(alpha, [USERS.beta.uuid]);

        readSentPackets(beta);

        const { messageId } = createMessage(alpha, channelId, "report me");
        readSentPackets(beta);

        handlePacket(beta as any, {
            type: "chat.ClientChatChannelMessageReportPacket",
            id: "report-message",
            payload: {
                a: channelId,
                b: messageId,
                c: "SPAM"
            }
        });

        let packets = readSentPackets(beta);
        const report = packetOfType(packets, "chat.ServerChatChannelMessageReportPacket");
        expect(report).toBeTruthy();
        expect(report.payload.report).toMatchObject({
            b: channelId,
            c: messageId,
            d: "SPAM",
            f: false
        });
        expect(report.payload.report.e.b).toBe(USERS.beta.uuid);

        handlePacket(alpha as any, {
            type: "chat.ChatChannelMessageDeletePacket",
            id: "delete-message",
            payload: {
                a: channelId,
                b: messageId
            }
        });

        packets = readSentPackets(alpha);
        const alphaDelete = packetOfType(packets, "chat.ChatChannelMessageDeletePacket");
        const response = packetOfType(packets, "response.ResponseActionPacket");
        expect(alphaDelete).toBeTruthy();
        expect(alphaDelete.payload).toEqual({ a: channelId, b: messageId });
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(true);

        packets = readSentPackets(beta);
        const betaDelete = packetOfType(packets, "chat.ChatChannelMessageDeletePacket");
        expect(betaDelete).toBeTruthy();
        expect(betaDelete.payload).toEqual({ a: channelId, b: messageId });
    });

    test("lookup by name returns both direct response and uuid-name map", () => {
        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);

        handlePacket(alpha as any, {
            type: "relationships.ClientLookupUuidByNamePacket",
            id: "lookup-name",
            payload: {
                username: USERS.beta.name.toLowerCase()
            }
        });

        const packets = readSentPackets(alpha);
        const lookup = packetOfType(packets, "relationships.ServerLookupUuidByNameResponsePacket");
        const map = packetOfType(packets, "relationships.ServerUuidNameMapPacket");
        expect(lookup).toBeTruthy();
        expect(lookup.payload).toEqual({
            uuid: USERS.beta.uuid,
            username: USERS.beta.name
        });
        expect(map).toBeTruthy();
        expect(map.payload.a[USERS.beta.uuid]).toBe(USERS.beta.name);
    });

    test("profile activity is broadcast to other connected users only", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);

        handlePacket(alpha as any, {
            type: "profile.ClientProfileActivityPacket",
            id: "activity",
            payload: {
                a: "PLAYING",
                c: { server: "mc.example.net" }
            }
        });

        const alphaPackets = readSentPackets(alpha);
        const betaPackets = readSentPackets(beta);
        expect(packetOfType(alphaPackets, "profile.ServerProfileActivityPacket")).toBeUndefined();

        const broadcast = packetOfType(betaPackets, "profile.ServerProfileActivityPacket");
        expect(broadcast).toBeTruthy();
        expect(broadcast.payload).toEqual({
            a: USERS.alpha.uuid,
            b: "PLAYING",
            c: { server: "mc.example.net" }
        });
    });

    test("social invite is relayed only to the targeted connected user", () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);

        handlePacket(alpha as any, {
            type: "social.SocialInviteToServerPacket",
            id: "social-invite",
            payload: {
                a: USERS.beta.uuid,
                b: "mc.example.net"
            }
        });

        const alphaPackets = readSentPackets(alpha);
        const betaPackets = readSentPackets(beta);
        expect(packetOfType(alphaPackets, "social.SocialInviteToServerPacket")).toBeUndefined();

        const invite = packetOfType(betaPackets, "social.SocialInviteToServerPacket");
        expect(invite).toBeTruthy();
        expect(invite.payload).toEqual({
            a: USERS.alpha.uuid,
            b: "mc.example.net"
        });
    });

    test("message edit and channel mute flows return the packets the client expects", async () => {
        const alpha = connectUser(USERS.alpha);
        const beta = connectUser(USERS.beta);
        const { channelId } = createChannel(alpha, [USERS.beta.uuid]);
        readSentPackets(beta);

        const { messageId } = createMessage(alpha, channelId, "before edit");
        readSentPackets(beta);

        await handlePacket(alpha as any, {
            type: "chat.ClientChatChannelMessageUpdatePacket",
            id: "edit-message",
            payload: {
                a: channelId,
                b: messageId,
                c: "after edit"
            }
        });

        let packets = readSentPackets(alpha);
        let response = packetOfType(packets, "response.ResponseActionPacket");
        let edited = packetOfType(packets, "chat.ServerChatChannelMessagePacket");
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(true);
        expect(edited).toBeTruthy();
        expect(edited.payload.a[0].a).toBe(messageId);
        expect(edited.payload.a[0].d).toBe("after edit");
        expect(edited.payload.a[0].g).toBeNumber();

        packets = readSentPackets(beta);
        edited = packetOfType(packets, "chat.ServerChatChannelMessagePacket");
        expect(edited).toBeTruthy();
        expect(edited.payload.a[0].d).toBe("after edit");

        await handlePacket(alpha as any, {
            type: "chat.ClientChatChannelMutePacket",
            id: "mute-channel",
            payload: {
                a: channelId,
                b: true
            }
        });

        packets = readSentPackets(alpha);
        response = packetOfType(packets, "response.ResponseActionPacket");
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(true);

        const alphaChannel = buildChannelForUser(db.getChannel(channelId), USERS.alpha.uuid);
        const betaChannel = buildChannelForUser(db.getChannel(channelId), USERS.beta.uuid);
        expect(alphaChannel.i).toBe(true);
        expect(betaChannel.i).toBe(false);
    });

    test("live profile status updates are broadcast on connect and disconnect", async () => {
        const beta = await openLiveClient(USERS.beta);

        try {
            await waitUntil(() => beta.packets.length > 0);
            drainLivePackets(beta);

            const alpha = await openLiveClient(USERS.alpha);
            try {
                await waitUntil(() => beta.packets.some((packet) =>
                    packet.type === "profile.ServerProfileStatusPacket" && packet.payload.a === USERS.alpha.uuid && packet.payload.b === "ONLINE"
                ));
                let packets = drainLivePackets(beta);
                const online = packetOfType(packets, "profile.ServerProfileStatusPacket");
                expect(online).toBeTruthy();
                expect(online.payload.a).toBe(USERS.alpha.uuid);
                expect(online.payload.b).toBe("ONLINE");

                await closeLiveClient(alpha);
                await waitUntil(() => beta.packets.some((packet) =>
                    packet.type === "profile.ServerProfileStatusPacket" && packet.payload.a === USERS.alpha.uuid && packet.payload.b === "OFFLINE"
                ));
                packets = drainLivePackets(beta);
                const offline = packetOfType(packets, "profile.ServerProfileStatusPacket");
                expect(offline).toBeTruthy();
                expect(offline.payload.a).toBe(USERS.alpha.uuid);
                expect(offline.payload.b).toBe("OFFLINE");
            } finally {
                if (alpha.socket.readyState !== WebSocket.CLOSED) {
                    await closeLiveClient(alpha);
                }
            }
        } finally {
            await closeLiveClient(beta);
        }
    });

    test("reconnecting the same user asks the previous socket to reconnect without broadcasting a false offline", async () => {
        const beta = await openLiveClient(USERS.beta);

        try {
            await waitUntil(() => beta.packets.length > 0);
            drainLivePackets(beta);

            const alphaFirst = await openLiveClient(USERS.alpha);
            try {
                await waitUntil(() => beta.packets.some((packet) =>
                    packet.type === "profile.ServerProfileStatusPacket" && packet.payload.a === USERS.alpha.uuid && packet.payload.b === "ONLINE"
                ));
                drainLivePackets(beta);
                drainLivePackets(alphaFirst);

                const alphaSecond = await openLiveClient(USERS.alpha);
                try {
                    await waitUntil(() => alphaFirst.closed && alphaFirst.packets.some((packet) => packet.type === "connection.ServerConnectionReconnectPacket"), 4000);

                    const reconnectPacket = packetOfType(drainLivePackets(alphaFirst), "connection.ServerConnectionReconnectPacket");
                    expect(reconnectPacket).toBeTruthy();
                    expect(alphaFirst.closeCode).toBe(4507);

                    await Bun.sleep(150);
                    const betaPackets = drainLivePackets(beta);
                    expect(betaPackets.some((packet) =>
                        packet.type === "profile.ServerProfileStatusPacket" && packet.payload.a === USERS.alpha.uuid && packet.payload.b === "OFFLINE"
                    )).toBe(false);

                    sendLivePacket(alphaSecond, "media.ClientMediaRequestPacket", {}, "media-request-after-reconnect");
                    await waitUntil(() => alphaSecond.packets.some((packet) => packet.type === "media.ServerMediaPopulatePacket"));
                    const secondPackets = drainLivePackets(alphaSecond);
                    const mediaPopulate = packetOfType(secondPackets, "media.ServerMediaPopulatePacket");
                    expect(mediaPopulate).toBeTruthy();
                } finally {
                    if (alphaSecond.socket.readyState !== WebSocket.CLOSED) {
                        await closeLiveClient(alphaSecond);
                    }
                }
            } finally {
                if (alphaFirst.socket.readyState !== WebSocket.CLOSED) {
                    await closeLiveClient(alphaFirst);
                }
            }
        } finally {
            await closeLiveClient(beta);
        }
    });

    test("media upload url, HTTP upload, and media populate flow stay consistent", async () => {
        const alpha = await openLiveClient(USERS.alpha);

        try {
            await waitUntil(() => alpha.packets.length > 0);
            drainLivePackets(alpha);

            sendLivePacket(alpha, "media.ClientMediaGetUploadUrlPacket", {}, "media-upload-url");
            await waitUntil(() => alpha.packets.some((packet) => packet.type === "media.ServerMediaUploadUrlPacket"));
            let packets = drainLivePackets(alpha);
            const uploadPacket = packetOfType(packets, "media.ServerMediaUploadUrlPacket");
            expect(uploadPacket).toBeTruthy();
            expect(uploadPacket.payload.upload_url).toContain(`/uploads/${uploadPacket.payload.media_id}.png`);

            const form = new FormData();
            form.append("file", new Blob(["essential-upload-test"], { type: "image/png" }), "file");
            const uploadResponse = await fetch(uploadPacket.payload.upload_url, { method: "POST", body: form });
            expect(uploadResponse.status).toBe(200);

            sendLivePacket(alpha, "media.ClientMediaCreatePacket", {
                a: uploadPacket.payload.media_id,
                b: "Alpha Screenshot",
                c: "Created in tests",
                d: { favorite: true, test: "contract" }
            }, "media-create");

            await waitUntil(() => alpha.packets.some((packet) => packet.type === "media.ServerMediaPopulatePacket" && packet.id === "media-create"));
            packets = drainLivePackets(alpha);
            const createPopulate = packetOfType(packets, "media.ServerMediaPopulatePacket");
            expect(createPopulate).toBeTruthy();
            expect(createPopulate.payload.a[0].a).toBe(uploadPacket.payload.media_id);
            expect(createPopulate.payload.a[0].d.original.a).toBe(uploadPacket.payload.upload_url);
            expect(createPopulate.payload.a[0].d.embed.a).toBe(`https://media.essential.gg/${uploadPacket.payload.media_id}`);

            sendLivePacket(alpha, "media.ClientMediaRequestPacket", {}, "media-request");
            await waitUntil(() => alpha.packets.some((packet) => packet.type === "media.ServerMediaPopulatePacket"));
            packets = drainLivePackets(alpha);
            const mediaPopulate = packetOfType(packets, "media.ServerMediaPopulatePacket");
            expect(mediaPopulate).toBeTruthy();
            expect(mediaPopulate.payload.a[0].b).toBe("Alpha Screenshot");
            expect(mediaPopulate.payload.a[0].e).toEqual({ favorite: true, test: "contract" });

            sendLivePacket(alpha, "media.ClientMediaUpdatePacket", {
                a: uploadPacket.payload.media_id,
                b: "Renamed Screenshot",
                c: "Updated in tests",
                d: false
            }, "media-update");
            await waitUntil(() => alpha.packets.some((packet) => packet.type === "media.ServerMediaPopulatePacket"));
            packets = drainLivePackets(alpha);
            const mediaUpdate = packetOfType(packets, "media.ServerMediaPopulatePacket");
            expect(mediaUpdate).toBeTruthy();
            expect(mediaUpdate.payload.a[0].b).toBe("Renamed Screenshot");
            expect(mediaUpdate.payload.a[0].c).toBe("Updated in tests");
            expect(mediaUpdate.payload.a[0].e.e).toBe(false);

            sendLivePacket(alpha, "media.ClientMediaDeleteRequestPacket", {
                a: uploadPacket.payload.media_id
            }, "media-delete");
            await waitUntil(() => alpha.packets.some((packet) => packet.type === "response.ResponseActionPacket"));
            packets = drainLivePackets(alpha);
            const mediaDelete = packetOfType(packets, "response.ResponseActionPacket");
            expect(mediaDelete).toBeTruthy();
            expect(mediaDelete.payload.a).toBe(true);

            sendLivePacket(alpha, "media.ClientMediaRequestPacket", {}, "media-request-after-delete");
            await waitUntil(() => alpha.packets.some((packet) => packet.type === "media.ServerMediaPopulatePacket"));
            packets = drainLivePackets(alpha);
            const afterDeletePopulate = packetOfType(packets, "media.ServerMediaPopulatePacket");
            expect(afterDeletePopulate).toBeTruthy();
            expect(afterDeletePopulate.payload.a).toEqual([]);

            const uploadedFile = await fetch(uploadPacket.payload.upload_url);
            expect(uploadedFile.status).toBe(404);
        } finally {
            await closeLiveClient(alpha);
        }
    });

    test("thumbnail url with size suffix still serves the image", async () => {
        const alpha = await openLiveClient(USERS.alpha);

        try {
            await waitUntil(() => alpha.packets.length > 0);
            drainLivePackets(alpha);

            sendLivePacket(alpha, "media.ClientMediaGetUploadUrlPacket", {}, crypto.randomUUID());
            await waitUntil(() => alpha.packets.some((p) => p.type === "media.ServerMediaUploadUrlPacket"));
            const uploadPacket = packetOfType(drainLivePackets(alpha), "media.ServerMediaUploadUrlPacket");

            const form = new FormData();
            form.append("file", new Blob(["fake-png-data"], { type: "image/png" }), "file");
            await fetch(uploadPacket.payload.upload_url, { method: "POST", body: form });

            const thumbnailUrl = `${uploadPacket.payload.upload_url}/width=128,height=128`;
            const res = await fetch(thumbnailUrl);
            expect(res.status).toBe(200);
        } finally {
            await closeLiveClient(alpha);
        }
    });

    test("websocket bootstrap sends initial state packets and persisted user data", async () => {
        const alphaUser = new User(USERS.alpha.uuid, USERS.alpha.name);
        const skin = alphaUser.createSkin("Bootstrap Skin", "CLASSIC", "bootstraphash", false);
        alphaUser.createOutfit("Bootstrap Outfit", skin.id, { CAPE: "cape_free" }, { cape_free: [] });
        alphaUser.setRelationship(USERS.beta.uuid, "FRIENDS", "VERIFIED");
        db.saveChatChannel({
            id: 42,
            type: "DIRECT_MESSAGE",
            name: "Bootstrap DM",
            owner_uuid: USERS.alpha.uuid,
            created_at: Date.now()
        }, [USERS.alpha.uuid, USERS.beta.uuid]);
        resetSessions();
        const { createOrReplaceSession } = await import("../src/upnpSessions");
        createOrReplaceSession({
            hostUuid: USERS.beta.uuid,
            ip: "beta.sps.test",
            port: 25565,
            privacy: "INVITE_ONLY",
            createdAt: Date.now(),
            protocolVersion: 765,
            worldName: "Bootstrap World",
            rawStatus: null,
            invites: [USERS.alpha.uuid]
        });

        const alpha = await openLiveClient(USERS.alpha, 999);

        try {
            await waitUntil(() => {
                const types = new Set(alpha.packets.map((packet) => packet.type));
                return types.has("features.ServerDisabledFeaturesPacket")
                    && types.has("chat.ServerChatChannelMessageReportReasonsPacket")
                    && types.has("features.ServerExternalServicePopulatePacket")
                    && types.has("social.ServerCommunityRulesStatePacket")
                    && types.has("skin.ServerSkinPopulatePacket")
                    && types.has("cosmetic.outfit.ServerCosmeticOutfitPopulatePacket")
                    && types.has("upnp.ServerUPnPSessionPopulatePacket")
                    && types.has("chat.ServerChatChannelAddPacket")
                    && types.has("relationships.ServerRelationshipPopulatePacket");
            });

            const packets = drainLivePackets(alpha);
            const externalServices = packetOfType(packets, "features.ServerExternalServicePopulatePacket");
            const reportReasons = packetOfType(packets, "chat.ServerChatChannelMessageReportReasonsPacket");
            const skins = packetOfType(packets, "skin.ServerSkinPopulatePacket");
            const outfits = packetOfType(packets, "cosmetic.outfit.ServerCosmeticOutfitPopulatePacket");
            const sessions = packetOfType(packets, "upnp.ServerUPnPSessionPopulatePacket");
            const channels = packetOfType(packets, "chat.ServerChatChannelAddPacket");
            const relationships = packetOfType(packets, "relationships.ServerRelationshipPopulatePacket");

            expect(externalServices).toBeTruthy();
            expect(externalServices.payload.services.media.url).toBe(essentialServer.url.origin);
            expect(reportReasons).toBeTruthy();
            expect(reportReasons.payload.a.SPAM.en_US).toBe("Spam or disruptive activity");
            expect(skins).toBeTruthy();
            expect(skins.payload.skins[0].hash).toBe("bootstraphash");
            expect(outfits).toBeTruthy();
            expect(outfits.payload.outfits[0].b).toBe("Bootstrap Outfit");
            expect(sessions).toBeTruthy();
            expect(sessions.payload.a[0]).toMatchObject({
                a: USERS.beta.uuid,
                b: "beta.sps.test",
                c: 25565,
                d: "INVITE_ONLY",
                h: "Bootstrap World"
            });
            expect(channels).toBeTruthy();
            expect(channels.payload.a[0].a).toBe(42);
            expect(relationships).toBeTruthy();
            expect(relationships.payload.a[0]).toMatchObject({
                a: USERS.alpha.uuid,
                b: USERS.beta.uuid,
                c: "FRIENDS",
                d: "VERIFIED"
            });
        } finally {
            await closeLiveClient(alpha);
        }
    });

    test("discovery and system helper packets return stable client-facing payloads", () => {
        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);

        handlePacket(alpha as any, {
            type: "notices.ClientNoticeRequestPacket",
            id: "notice-request",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "serverdiscovery.ClientServerDiscoveryRequestPopulatePacket",
            id: "serverdiscovery-populate",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "serverdiscovery.ClientServerDiscoveryRequestPacket",
            id: "serverdiscovery-request",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "knownservers.ClientKnownServersRequestPacket",
            id: "knownservers-request",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "features.ServerDisabledFeaturesPacket",
            id: "disabled-features",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "features.ServerExternalServicePopulatePacket",
            id: "external-services",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "social.ServerSocialSuspensionStatePacket",
            id: "social-suspension",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "telemetry.ClientTelemetryPacket",
            id: "telemetry",
            payload: {
                event: "contract-test"
            }
        });

        const packets = readSentPackets(alpha);
        const notices = packetOfType(packets, "notices.ServerNoticePopulatePacket");
        const discoveryPopulate = packetOfType(packets, "serverdiscovery.ServerServerDiscoveryPopulatePacket");
        const discoveryResponse = packetOfType(packets, "serverdiscovery.ServerServerDiscoveryResponsePacket");
        const knownServers = packetOfType(packets, "knownservers.ServerKnownServersResponsePacket");
        const disabledFeatures = packetOfType(packets, "features.ServerDisabledFeaturesPacket");
        const externalServices = packetOfType(packets, "features.ServerExternalServicePopulatePacket");
        const suspension = packetOfType(packets, "social.ServerSocialSuspensionStatePacket");
        const telemetry = packetOfType(packets, "telemetry.ServerRecognizedTelemetryPacket");

        expect(notices).toBeTruthy();
        expect(notices.payload.a).toEqual([]);
        expect(discoveryPopulate).toBeTruthy();
        expect(discoveryPopulate.payload.a).toEqual([]);
        expect(discoveryResponse).toBeTruthy();
        expect(discoveryResponse.payload).toEqual({
            recommended: [],
            featured: []
        });
        expect(knownServers).toBeTruthy();
        expect(knownServers.payload.knownServers[0]).toEqual({
            id: "hypixel",
            names: { en_US: "Hypixel" },
            addresses: ["mc.hypixel.net"]
        });
        expect(disabledFeatures).toBeTruthy();
        expect(disabledFeatures.payload.disabled_features).toEqual([]);
        expect(externalServices).toBeTruthy();
        expect(externalServices.payload.services.media.url).toBe(essentialServer.url.origin);
        expect(suspension).toBeTruthy();
        expect(suspension.payload.suspended).toBe(false);
        expect(telemetry).toBeTruthy();
        expect(telemetry.payload).toEqual({});
    });

    test("community rules agreement persists and later state reflects acceptance", () => {
        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);

        handlePacket(alpha as any, {
            type: "social.ServerCommunityRulesStatePacket",
            id: "rules-before",
            payload: {}
        });
        let packets = readSentPackets(alpha);
        let rules = packetOfType(packets, "social.ServerCommunityRulesStatePacket");
        expect(rules).toBeTruthy();
        expect(rules.payload.accepted).toBe(false);

        handlePacket(alpha as any, {
            type: "social.ClientCommunityRulesAgreedPacket",
            id: "rules-agree",
            payload: {}
        });
        packets = readSentPackets(alpha);
        const response = packetOfType(packets, "response.ResponseActionPacket");
        expect(response).toBeTruthy();
        expect(response.payload.a).toBe(true);

        handlePacket(alpha as any, {
            type: "social.ServerCommunityRulesStatePacket",
            id: "rules-after",
            payload: {}
        });
        packets = readSentPackets(alpha);
        rules = packetOfType(packets, "social.ServerCommunityRulesStatePacket");
        expect(rules).toBeTruthy();
        expect(rules.payload.accepted).toBe(true);
        expect(new User(USERS.alpha.uuid, USERS.alpha.name).rulesAccepted).toBe(true);
    });

    test("wardrobe and cosmetic catalog packets stay compatible with client expectations", () => {
        db.db.run("INSERT INTO cosmetics (id, data) VALUES (?, ?)", [
            "TEST_CAPE",
            JSON.stringify({
                a: "TEST_CAPE",
                b: "CAPE",
                c: { en_US: "Test Cape" },
                f: 1,
                g: { USD: 0 },
                h: [],
                i: 1609459200000,
                q: {
                    "texture.png": { a: `${essentialServer.url.origin}/static/texture.png`, b: "hash" },
                    "geometry.steve.json": { a: `${essentialServer.url.origin}/static/cape.json`, b: "hash" }
                }
            })
        ]);

        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);

        handlePacket(alpha as any, {
            type: "wardrobe.ClientWardrobeSettingsPacket",
            id: "wardrobe-settings",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "cosmetic.ClientCosmeticRequestPacket",
            id: "cosmetic-request",
            payload: {
                a: ["TEST_CAPE", "UNKNOWN_CAPE"]
            }
        });
        handlePacket(alpha as any, {
            type: "cosmetic.categories.ClientCosmeticCategoriesRequestPacket",
            id: "categories-request",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "wardrobe.ClientWardrobeStoreBundleRequestPacket",
            id: "bundle-request",
            payload: {
                store_bundle_ids: ["LICH_OVERLORD"]
            }
        });

        const packets = readSentPackets(alpha);
        const wardrobe = packetOfType(packets, "wardrobe.ServerWardrobeSettingsPacket");
        const cosmeticTypes = packetOfType(packets, "cosmetic.ServerCosmeticTypesPopulatePacket");
        const categories = packetOfType(packets, "cosmetic.categories.ServerCosmeticCategoriesPopulatePacket");
        const cosmetics = packetOfType(packets, "cosmetic.ServerCosmeticsPopulatePacket");
        const bundles = packetOfType(packets, "wardrobe.ServerWardrobeStoreBundlePacket");

        expect(wardrobe).toBeTruthy();
        expect(wardrobe.payload.outfits_limit).toBe(10);
        expect(wardrobe.payload.fallback_featured_page_config.a).toBe(`${essentialServer.url.origin}/featured.json`);
        expect(cosmeticTypes).toBeTruthy();
        expect(cosmeticTypes.payload.a.some((entry: any) => entry.a === "CAPE" && entry.c.en_US === "Cape")).toBe(true);
        expect(categories).toBeTruthy();
        expect(categories.payload.a[0].c.a).toBe(`${essentialServer.url.origin}/static/texture.png`);
        expect(cosmetics).toBeTruthy();
        expect(cosmetics.payload.a.some((entry: any) => entry.a === "TEST_CAPE")).toBe(true);
        const placeholder = cosmetics.payload.a.find((entry: any) => entry.a === "UNKNOWN_CAPE");
        expect(placeholder).toBeTruthy();
        expect(placeholder.q["texture.png"].a).toBe(`${essentialServer.url.origin}/static/texture.png`);
        expect(bundles).toBeTruthy();
        expect(bundles.payload.store_bundles[0].id).toBe("LICH_OVERLORD");
    });

    test("checkout, balance, currency, and unlock-state packets remain stable", () => {
        db.db.run("INSERT INTO cosmetics (id, data) VALUES (?, ?)", [
            "STORE_CAPE",
            JSON.stringify({
                a: "STORE_CAPE",
                b: "CAPE",
                c: { en_US: "Store Cape" },
                f: 2,
                g: { USD: 1.99 },
                h: [],
                i: 1609459200000,
                q: {}
            })
        ]);

        const alphaUser = new User(USERS.alpha.uuid, USERS.alpha.name);
        alphaUser.coins = 1234;
        alphaUser.save();

        const alpha = createWs(USERS.alpha.uuid, USERS.alpha.name);

        handlePacket(alpha as any, {
            type: "checkout.ClientCheckoutCosmeticsPacket",
            id: "checkout",
            payload: {
                cosmetic_ids: ["STORE_CAPE"],
                gift_to: null
            }
        });
        handlePacket(alpha as any, {
            type: "coins.ClientCoinsBalancePacket",
            id: "coins-balance",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "coins.ClientCoinBundleOptionsPacket",
            id: "coin-bundles",
            payload: {
                currency: "USD"
            }
        });
        handlePacket(alpha as any, {
            type: "currency.ClientCurrencyOptionsPacket",
            id: "currencies",
            payload: {}
        });
        handlePacket(alpha as any, {
            type: "cosmetic.ClientCosmeticBulkRequestUnlockStatePacket",
            id: "bulk-unlock",
            payload: {
                target_user_ids: [USERS.beta.uuid, USERS.gamma.uuid],
                cosmetic_id: "STORE_CAPE"
            }
        });

        const packets = readSentPackets(alpha);
        const unlocked = packetOfType(packets, "cosmetic.ServerCosmeticsUserUnlockedPacket");
        const checkoutResponse = packetOfType(packets, "response.ResponseActionPacket");
        const balance = packetOfType(packets, "coins.ServerCoinsBalancePacket");
        const coinBundles = packetOfType(packets, "coins.ServerCoinBundleOptionsPacket");
        const currencies = packetOfType(packets, "currency.ServerCurrencyOptionsPacket");
        const unlockStates = packetOfType(packets, "cosmetic.ServerCosmeticBulkRequestUnlockStateResponsePacket");

        expect(unlocked).toBeTruthy();
        expect(unlocked.payload.a).toContain("STORE_CAPE");
        expect(unlocked.payload.b).toBe(true);
        expect(unlocked.payload.c).toBe(USERS.alpha.uuid);
        expect(checkoutResponse).toBeTruthy();
        expect(checkoutResponse.payload.a).toBe(true);
        expect(new User(USERS.alpha.uuid, USERS.alpha.name).getUnlockedCosmetics().STORE_CAPE).toBeTruthy();
        expect(balance).toBeTruthy();
        expect(balance.payload.coins).toBe(1234);
        expect(balance.payload.coins_spent).toBe(0);
        expect(coinBundles).toBeTruthy();
        expect(coinBundles.payload.coinBundles).toEqual([]);
        expect(currencies).toBeTruthy();
        expect(currencies.payload.currencies).toEqual(["USD"]);
        expect(unlockStates).toBeTruthy();
        expect(unlockStates.payload.unlock_states).toEqual({
            [USERS.beta.uuid]: false,
            [USERS.gamma.uuid]: false
        });
    });
});
