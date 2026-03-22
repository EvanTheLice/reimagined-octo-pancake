import net from "node:net";

type VarIntReadResult = {
    value: number;
    bytesRead: number;
};

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

function decodeVarInt(buffer: Buffer, offset = 0): VarIntReadResult | null {
    let value = 0;
    let position = 0;
    let currentOffset = offset;

    while (currentOffset < buffer.length) {
        const currentByte = buffer[currentOffset++];
        value |= (currentByte & 0x7f) << position;

        if ((currentByte & 0x80) === 0) {
            return {
                value,
                bytesRead: currentOffset - offset,
            };
        }

        position += 7;
        if (position >= 35) {
            throw new Error("VarInt is too large");
        }
    }

    return null;
}

function encodeString(value: string) {
    const encoded = Buffer.from(value, "utf8");
    return Buffer.concat([encodeVarInt(encoded.length), encoded]);
}

function wrapPacket(data: Buffer) {
    return Buffer.concat([encodeVarInt(data.length), data]);
}

function tryReadPacket(buffer: Buffer) {
    const lengthInfo = decodeVarInt(buffer);
    if (!lengthInfo) {
        return null;
    }

    const packetEnd = lengthInfo.bytesRead + lengthInfo.value;
    if (buffer.length < packetEnd) {
        return null;
    }

    return {
        packet: buffer.subarray(lengthInfo.bytesRead, packetEnd),
        remaining: buffer.subarray(packetEnd),
    };
}

function buildHandshakePacket(hostname: string, port: number, protocolVersion: number) {
    const packetData = Buffer.concat([
        encodeVarInt(0),
        encodeVarInt(protocolVersion),
        encodeString(hostname),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        encodeVarInt(1),
    ]);

    return wrapPacket(packetData);
}

function buildStatusRequestPacket() {
    return wrapPacket(encodeVarInt(0));
}

function buildPingPacket(timestamp: bigint) {
    const payload = Buffer.alloc(8);
    payload.writeBigInt64BE(timestamp, 0);
    return wrapPacket(Buffer.concat([encodeVarInt(1), payload]));
}

function readStatusJson(packet: Buffer) {
    const packetIdInfo = decodeVarInt(packet);
    if (!packetIdInfo || packetIdInfo.value !== 0) {
        throw new Error("Unexpected status response packet id");
    }

    const jsonLengthInfo = decodeVarInt(packet, packetIdInfo.bytesRead);
    if (!jsonLengthInfo) {
        throw new Error("Incomplete status response");
    }

    const start = packetIdInfo.bytesRead + jsonLengthInfo.bytesRead;
    const end = start + jsonLengthInfo.value;
    return packet.toString("utf8", start, end);
}

function readPong(packet: Buffer) {
    const packetIdInfo = decodeVarInt(packet);
    if (!packetIdInfo || packetIdInfo.value !== 1) {
        throw new Error("Unexpected pong packet id");
    }

    if (packet.length < packetIdInfo.bytesRead + 8) {
        throw new Error("Incomplete pong response");
    }
}

export async function fetchMinecraftStatus(hostname: string, port: number, protocolVersion: number, timeoutMs = 3000) {
    return new Promise<{ rawJson: string; latency: number }>((resolve, reject) => {
        const socket = net.createConnection({ host: hostname, port });
        const startedAt = Date.now();
        let buffer = Buffer.alloc(0);
        let rawJson: string | null = null;
        let pingSentAt = 0;

        const finish = (error?: Error) => {
            socket.removeAllListeners();
            socket.destroy();
            if (error) {
                reject(error);
            }
        };

        socket.setTimeout(timeoutMs, () => {
            finish(new Error("Ping proxy request timed out"));
        });

        socket.once("error", (error) => finish(error));

        socket.once("connect", () => {
            socket.write(buildHandshakePacket(hostname, port, protocolVersion));
            socket.write(buildStatusRequestPacket());
        });

        socket.on("data", (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            while (true) {
                const packetResult = tryReadPacket(buffer);
                if (!packetResult) {
                    return;
                }

                buffer = packetResult.remaining;

                if (rawJson === null) {
                    rawJson = readStatusJson(packetResult.packet);
                    pingSentAt = Date.now();
                    socket.write(buildPingPacket(BigInt(pingSentAt)));
                    continue;
                }

                readPong(packetResult.packet);
                resolve({
                    rawJson,
                    latency: Math.max(0, Date.now() - pingSentAt || Date.now() - startedAt),
                });
                finish();
                return;
            }
        });
    });
}
