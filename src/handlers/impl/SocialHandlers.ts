import { BaseHandler } from "./BaseHandler";
import { ServerWebSocket } from "bun";
import { WebSocketData, CONNECTED_USERS } from "../../state";
import { Packet } from "../../protocol";
import { User } from "../../models/User";
import { sendProfileStatus, sendPacket } from "../index";
import { logger } from "../../logger";

export class RelationshipCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: targetUuid, b: type } = packet.payload;
        const sender = new User(ws.data.userUuid, ws.data.userName);
        const upperType = (type || 'FRIENDS').toUpperCase();

        logger.info({ from: sender.username, to: targetUuid, type: upperType }, "Relationship create request");

        // Handle FRIENDS type with PENDING request flow
        if (upperType === 'FRIENDS') {
            // Check if we have an incoming friend request from target (ACCEPT case)
            if (sender.hasIncomingFriendRequest(targetUuid)) {
                return this.handleAcceptFriendRequest(ws, packet, sender, targetUuid);
            }

            // Check if already friends
            if (sender.isFriendWith(targetUuid)) {
                this.send(ws, 'relationships.ServerRelationshipCreateFailedResponsePacket', {
                    reason: 'ALREADY_FRIENDS'
                }, packet.id);
                return;
            }

            // Check if already have outgoing request
            if (sender.hasOutgoingFriendRequest(targetUuid)) {
                this.send(ws, 'relationships.ServerRelationshipCreateFailedResponsePacket', {
                    reason: 'REQUEST_ALREADY_SENT'
                }, packet.id);
                return;
            }

            // Create new PENDING friend request
            return this.handleCreateFriendRequest(ws, packet, sender, targetUuid);
        }

        // Handle BLOCKED type (instant, no PENDING)
        if (upperType === 'BLOCKED') {
            sender.setRelationship(targetUuid, 'BLOCKED', 'VERIFIED');
            this.send(ws, 'relationships.ServerRelationshipPopulatePacket', {
                a: [{
                    a: sender.uuid,
                    b: targetUuid,
                    c: 'BLOCKED',
                    d: 'VERIFIED',
                    e: Date.now()
                }]
            }, packet.id);
            return;
        }

        // Default: just create the relationship
        sender.setRelationship(targetUuid, upperType, 'VERIFIED');
        this.send(ws, 'relationships.ServerRelationshipPopulatePacket', {
            a: [{
                a: sender.uuid,
                b: targetUuid,
                c: upperType,
                d: 'VERIFIED',
                e: Date.now()
            }]
        }, packet.id);
    }

    private handleCreateFriendRequest(
        ws: ServerWebSocket<WebSocketData>,
        packet: Packet,
        sender: User,
        targetUuid: string
    ) {
        const now = Date.now();

        // Create PENDING relationship from sender to target
        sender.createFriendRequest(targetUuid);

        // Notify sender of outgoing request
        this.send(ws, 'relationships.ServerRelationshipPopulatePacket', {
            a: [{
                a: sender.uuid,
                b: targetUuid,
                c: 'FRIENDS',
                d: 'PENDING',
                e: now
            }]
        }, packet.id);

        // Notify target of incoming request if online
        const targetWs = CONNECTED_USERS.get(targetUuid);
        if (targetWs) {
            this.send(targetWs, 'relationships.ServerRelationshipPopulatePacket', {
                a: [{
                    a: sender.uuid,
                    b: targetUuid,
                    c: 'FRIENDS',
                    d: 'PENDING',
                    e: now
                }]
            });
        }

        logger.info({ from: sender.username, to: targetUuid }, "Friend request sent (PENDING)");
    }

    private handleAcceptFriendRequest(
        ws: ServerWebSocket<WebSocketData>,
        packet: Packet,
        sender: User,
        targetUuid: string
    ) {
        const now = Date.now();

        // Accept the friend request - creates VERIFIED both ways
        sender.acceptFriendRequest(targetUuid);

        // Notify sender (acceptor) of new friendship
        this.send(ws, 'relationships.ServerRelationshipPopulatePacket', {
            a: [{
                a: sender.uuid,
                b: targetUuid,
                c: 'FRIENDS',
                d: 'VERIFIED',
                e: now
            }]
        }, packet.id);

        // Notify original sender of accepted request
        const targetWs = CONNECTED_USERS.get(targetUuid);
        if (targetWs) {
            this.send(targetWs, 'relationships.ServerRelationshipPopulatePacket', {
                a: [{
                    a: targetUuid,
                    b: sender.uuid,
                    c: 'FRIENDS',
                    d: 'VERIFIED',
                    e: now
                }]
            });
            sendProfileStatus(ws, targetUuid);
            sendProfileStatus(targetWs, sender.uuid);
        }

        logger.info({ from: sender.username, to: targetUuid }, "Friend request accepted (VERIFIED)");
    }
}

export class LookupUuidHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const username: string = packet.payload.username;
        if (!username) {
            if (packet.id) sendPacket(ws, 'relationships.ServerUuidNameMapPacket', { a: {} }, packet.id);
            return;
        }

        const foundUser = User.findByUsername(username);
        if (foundUser) {
            this.send(ws, 'relationships.ServerLookupUuidByNameResponsePacket', {
                uuid: foundUser.uuid,
                username: foundUser.username
            }, packet.id);

            const map: any = {};
            map[foundUser.uuid] = foundUser.username;
            this.send(ws, 'relationships.ServerUuidNameMapPacket', { a: map }, packet.id);
        } else {
            this.send(ws, 'relationships.ServerUuidNameMapPacket', { a: {} }, packet.id);
        }
    }
}

export class RelationshipDeleteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: targetUuid, b: type } = packet.payload;
        const user = new User(ws.data.userUuid, ws.data.userName);
        const upperType = (type || 'FRIENDS').toUpperCase();

        logger.info({ from: user.username, to: targetUuid, type: upperType }, "Relationship delete request");

        if (upperType === 'FRIENDS') {
            // Check for incoming PENDING request (DECLINE case)
            if (user.hasIncomingFriendRequest(targetUuid)) {
                user.declineFriendRequest(targetUuid);
                this.sendRelationshipDelete(ws, targetUuid, 'FRIENDS', packet.id);

                // Notify the sender that their request was declined
                const senderWs = CONNECTED_USERS.get(targetUuid);
                if (senderWs) {
                    this.send(senderWs, 'relationships.ServerRelationshipDeletePacket', {
                        a: { a: targetUuid, b: user.uuid, c: 'FRIENDS', d: 'PENDING', e: Date.now() }
                    });
                }

                logger.info({ from: user.username, to: targetUuid }, "Friend request declined");
                return;
            }

            // Check for outgoing PENDING request (CANCEL case)
            if (user.hasOutgoingFriendRequest(targetUuid)) {
                user.cancelFriendRequest(targetUuid);
                this.sendRelationshipDelete(ws, targetUuid, 'FRIENDS', packet.id);

                // Notify the target that the request was cancelled
                const targetWs = CONNECTED_USERS.get(targetUuid);
                if (targetWs) {
                    this.send(targetWs, 'relationships.ServerRelationshipDeletePacket', {
                        a: { a: user.uuid, b: targetUuid, c: 'FRIENDS', d: 'PENDING', e: Date.now() }
                    });
                }

                logger.info({ from: user.username, to: targetUuid }, "Friend request cancelled");
                return;
            }

            // Check for existing friendship (REMOVE FRIEND case)
            if (user.isFriendWith(targetUuid)) {
                user.removeFriend(targetUuid);
                this.sendRelationshipDelete(ws, targetUuid, 'FRIENDS', packet.id);

                // Notify the other user
                const targetWs = CONNECTED_USERS.get(targetUuid);
                if (targetWs) {
                    this.send(targetWs, 'relationships.ServerRelationshipDeletePacket', {
                        a: { a: targetUuid, b: user.uuid, c: 'FRIENDS', d: 'VERIFIED', e: Date.now() }
                    });
                }

                logger.info({ from: user.username, to: targetUuid }, "Friend removed");
                return;
            }

            // No relationship found
            this.send(ws, 'relationships.ServerRelationshipCreateFailedResponsePacket', {
                reason: 'NO_RELATIONSHIP'
            }, packet.id);
            return;
        }

        // Handle BLOCKED type
        if (upperType === 'BLOCKED') {
            if (user.deleteRelationship(targetUuid, 'BLOCKED')) {
                this.sendRelationshipDelete(ws, targetUuid, 'BLOCKED', packet.id);
                logger.info({ from: user.username, to: targetUuid }, "Unblocked user");
            }
            return;
        }

        // Generic delete
        if (user.deleteRelationship(targetUuid, upperType)) {
            this.sendRelationshipDelete(ws, targetUuid, upperType, packet.id);
        }
    }

    private sendRelationshipDelete(ws: ServerWebSocket<WebSocketData>, targetUuid: string, type: string, packetId?: string) {
        this.send(ws, 'relationships.ServerRelationshipDeletePacket', {
            a: { a: ws.data.userUuid, b: targetUuid, c: type, d: 'VERIFIED', e: Date.now() }
        }, packetId);
        // Also send success response
        this.send(ws, 'response.ResponseActionPacket', { a: true }, packetId);
    }
}

export class SocialInviteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const { a: targetUuid, b: address } = packet.payload;
        const targetWs = CONNECTED_USERS.get(targetUuid);
        if (targetWs) {
            logger.info({ from: ws.data.userName, to: targetUuid }, "Relaying social invite");
            this.send(targetWs, 'social.SocialInviteToServerPacket', {
                a: ws.data.userUuid,
                b: address
            });
        }
    }
}
