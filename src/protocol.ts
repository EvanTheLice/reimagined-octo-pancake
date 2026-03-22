import { v4 as uuidv4 } from 'uuid';
import { logger } from "./logger";

export interface Packet {
    type: string;
    id: string;
    payload: any;
}

export class ConnectionCodec {
    private outgoingPacketTypeIds = new Map<string, number>();
    private incomingPacketTypeIds = new Map<number, string>();
    private nextTypeId = 1;

    constructor() {
        this.outgoingPacketTypeIds.set('connection.ConnectionRegisterPacketTypeIdPacket', 0);
        this.incomingPacketTypeIds.set(0, 'connection.ConnectionRegisterPacketTypeIdPacket');
    }

    decode(buffer: Buffer): Packet | null {
        let offset = 0;
        
        if (buffer.length < 4) return null;
        const packetTypeId = buffer.readInt32BE(offset);
        offset += 4;

        const packetName = this.incomingPacketTypeIds.get(packetTypeId);
        if (!packetName) {
            // logger.trace({ packetTypeId }, "Unknown packet type id");
            return null;
        }

        const packetIdLength = buffer.readInt32BE(offset);
        offset += 4;
        const packetIdString = buffer.toString('utf8', offset, offset + packetIdLength);
        offset += packetIdLength;

        const payloadLength = buffer.readInt32BE(offset);
        offset += 4;
        const payloadJson = buffer.toString('utf8', offset, offset + payloadLength);
        
        // Special handling for packet registration
        if (packetName === 'connection.ConnectionRegisterPacketTypeIdPacket') {
            try {
                const packet = JSON.parse(payloadJson);
                this.incomingPacketTypeIds.set(packet.b, packet.a);
                logger.trace({ packetName: packet.a, typeId: packet.b }, "Registered incoming packet");
            } catch (e) {
                logger.error(e, "Failed to parse registration packet");
            }
            return null;
        }

        try {
            const payload = JSON.parse(payloadJson);
            return {
                type: packetName,
                id: packetIdString,
                payload: payload
            };
        } catch (e) {
            logger.error({ payloadJson }, "Failed to parse packet JSON");
            return null;
        }
    }

    encode(packetName: string, payload: any, packetId: string = uuidv4()): Buffer[] {
        const buffers: Buffer[] = [];
        if (!this.outgoingPacketTypeIds.has(packetName)) {
            // We need to register this packet type first
            const newId = this.nextTypeId++;
            this.outgoingPacketTypeIds.set(packetName, newId);
            
            const registerPayload = {
                a: packetName,
                b: newId
            };
            // Register packet is always ID 0
            buffers.push(this.encodeDirect('connection.ConnectionRegisterPacketTypeIdPacket', registerPayload, uuidv4(), 0));
        }

        const typeId = this.outgoingPacketTypeIds.get(packetName)!;
        buffers.push(this.encodeDirect(packetName, payload, packetId, typeId));
        
        return buffers;
    }

    private encodeDirect(packetName: string, payload: any, packetId: string, typeId: number): Buffer {
        const payloadJson = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(payloadJson, 'utf8');
        const packetIdBuffer = Buffer.from(packetId, 'utf8');

        // Total size: 4 (type) + 4 (id len) + id bytes + 4 (payload len) + payload bytes
        const totalSize = 4 + 4 + packetIdBuffer.length + 4 + payloadBuffer.length;
        const buffer = Buffer.alloc(totalSize);
        let offset = 0;

        buffer.writeInt32BE(typeId, offset);
        offset += 4;

        buffer.writeInt32BE(packetIdBuffer.length, offset);
        offset += 4;
        packetIdBuffer.copy(buffer, offset);
        offset += packetIdBuffer.length;

        buffer.writeInt32BE(payloadBuffer.length, offset);
        offset += 4;
        payloadBuffer.copy(buffer, offset);
        
        return buffer;
    }
}
