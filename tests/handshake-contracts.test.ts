import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import crypto from "node:crypto";
import net from "node:net";

setDefaultTimeout(15000);

process.env.ESSENTIAL_DB_PATH = ".test-essential-handshake.db";

const db = await import("../src/db");
const { CONNECTED_USERS } = await import("../src/state");
const { createEssentialServer } = await import("../src/index");
const { resetAuthTokens } = await import("../src/authTokenStore");

const USERS = {
    alpha: { uuid: "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa", name: "Alpha" },
    beta: { uuid: "bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb", name: "Beta" },
};

const essentialServer = createEssentialServer({
    port: 0,
    hostname: "127.0.0.1",
    mediaBaseUrl: "",
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

function buildUpgradeRequest(headers: Record<string, string>) {
    const key = crypto.randomBytes(16).toString("base64");
    const lines = [
        "GET /v1 HTTP/1.1",
        `Host: 127.0.0.1:${essentialServer.port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Version: 13",
        `Sec-WebSocket-Key: ${key}`,
        ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
        "",
        "",
    ];

    return lines.join("\r\n");
}

async function performUpgrade(headers: Record<string, string>) {
    const socket = net.createConnection({
        host: "127.0.0.1",
        port: essentialServer.port,
    });

    const responseText = await new Promise<string>((resolve, reject) => {
        let response = "";

        socket.on("connect", () => {
            socket.write(buildUpgradeRequest(headers));
        });

        socket.on("data", (chunk) => {
            response += chunk.toString("latin1");
            const headerEndIndex = response.indexOf("\r\n\r\n");
            if (headerEndIndex !== -1) {
                resolve(response.slice(0, headerEndIndex));
            }
        });

        socket.on("error", reject);
    });

    socket.destroy();
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));

    const [statusLine, ...headerLines] = responseText.split("\r\n");
    const parsedHeaders = Object.fromEntries(
        headerLines
            .map((line) => {
                const separatorIndex = line.indexOf(":");
                if (separatorIndex === -1) {
                    return null;
                }

                return [
                    line.slice(0, separatorIndex).trim().toLowerCase(),
                    line.slice(separatorIndex + 1).trim(),
                ];
            })
            .filter((entry): entry is [string, string] => entry !== null)
    );

    return {
        statusLine,
        headers: parsedHeaders,
    };
}

beforeEach(() => {
    disconnectConnectedUsers();
    db.resetDatabase();
    resetAuthTokens();

    for (const user of Object.values(USERS)) {
        db.upsertUser(user.uuid, user.name);
    }
});

afterAll(async () => {
    disconnectConnectedUsers();
    void essentialServer.stop(true);
    db.resetDatabase();
    resetAuthTokens();
});

describe("handshake contracts", () => {
    test("websocket upgrade negotiates protocol version from max and exact headers", async () => {
        const maxProtocolResponse = await performUpgrade({
            "Essential-User-UUID": USERS.alpha.uuid,
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "999",
        });
        expect(maxProtocolResponse.statusLine).toContain("101");
        expect(maxProtocolResponse.headers["essential-protocol-version"]).toBe("9");
        expect(maxProtocolResponse.headers["essential-authentication-token"]).toContain("mock-token-");

        const exactProtocolResponse = await performUpgrade({
            "Essential-User-UUID": USERS.beta.uuid,
            "Essential-User-Name": USERS.beta.name,
            "Essential-Protocol-Version": "3",
        });
        expect(exactProtocolResponse.statusLine).toContain("101");
        expect(exactProtocolResponse.headers["essential-protocol-version"]).toBe("3");
    });

    test("protocol negotiation ignores blank or invalid max headers and falls back cleanly", async () => {
        const blankMaxResponse = await performUpgrade({
            "Essential-User-UUID": USERS.alpha.uuid,
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "   ",
            "Essential-Protocol-Version": "4",
        });
        expect(blankMaxResponse.statusLine).toContain("101");
        expect(blankMaxResponse.headers["essential-protocol-version"]).toBe("4");

        const invalidMaxResponse = await performUpgrade({
            "Essential-User-UUID": USERS.beta.uuid,
            "Essential-User-Name": USERS.beta.name,
            "Essential-Max-Protocol-Version": "not-a-number",
            "Essential-Protocol-Version": "5",
        });
        expect(invalidMaxResponse.statusLine).toContain("101");
        expect(invalidMaxResponse.headers["essential-protocol-version"]).toBe("5");

        const invalidAllResponse = await performUpgrade({
            "Essential-User-UUID": USERS.beta.uuid,
            "Essential-User-Name": USERS.beta.name,
            "Essential-Max-Protocol-Version": "not-a-number",
            "Essential-Protocol-Version": "also-invalid",
        });
        expect(invalidAllResponse.statusLine).toContain("101");
        expect(invalidAllResponse.headers["essential-protocol-version"]).toBe("9");
    });

    test("handshake rejects missing or malformed user uuid headers", async () => {
        const missingUuidResponse = await performUpgrade({
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "9",
        });
        expect(missingUuidResponse.statusLine).toContain("401");

        const malformedUuidResponse = await performUpgrade({
            "Essential-User-UUID": "not-a-uuid",
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "9",
        });
        expect(malformedUuidResponse.statusLine).toContain("400");
    });

    test("authentication token is stable across reconnect handshakes for the same user", async () => {
        const firstResponse = await performUpgrade({
            "Essential-User-UUID": USERS.alpha.uuid,
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "9",
        });
        const firstToken = firstResponse.headers["essential-authentication-token"];
        expect(firstToken).toBeTruthy();

        const resumedResponse = await performUpgrade({
            "Essential-User-UUID": USERS.alpha.uuid,
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "9",
            "Essential-Authentication-Token": firstToken,
        });
        expect(resumedResponse.headers["essential-authentication-token"]).toBe(firstToken);

        const followUpResponse = await performUpgrade({
            "Essential-User-UUID": USERS.alpha.uuid,
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "9",
        });
        expect(followUpResponse.headers["essential-authentication-token"]).toBe(firstToken);

        const mismatchedResponse = await performUpgrade({
            "Essential-User-UUID": USERS.alpha.uuid,
            "Essential-User-Name": USERS.alpha.name,
            "Essential-Max-Protocol-Version": "9",
            "Essential-Authentication-Token": "forged-token",
        });
        expect(mismatchedResponse.headers["essential-authentication-token"]).toBe(firstToken);
    });
});
