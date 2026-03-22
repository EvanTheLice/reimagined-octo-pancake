import { BaseHandler } from "./BaseHandler";
import { ServerWebSocket } from "bun";
import { WebSocketData } from "../../state";
import { Packet } from "../../protocol";
import { User } from "../../models/User";
import { getAllowedDomains, getCommunityRulesPayload, getTrustedHostsPayload } from "../../bootstrapPayloads";
import { createTrustedHost, deleteTrustedHost, getUserTrustedHosts } from "../../trustedHostsStore";

export class DisabledFeaturesHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'features.ServerDisabledFeaturesPacket', {
            disabled_features: []
        }, packet.id);
    }
}

export class ExternalServiceHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const mediaBaseUrl = process.env.MEDIA_BASE_URL || "http://127.0.0.1:8080";
        this.send(ws, 'features.ServerExternalServicePopulatePacket', {
            services: {
                media: { url: mediaBaseUrl }
            }
        }, packet.id);
    }
}

export class CommunityRulesHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const user = new User(ws.data.userUuid, ws.data.userName);
        this.send(ws, 'social.ServerCommunityRulesStatePacket', getCommunityRulesPayload(user.rulesAccepted), packet.id);
    }
}

export class CommunityRulesAgreedHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const user = new User(ws.data.userUuid, ws.data.userName);
        user.acceptRules();
        this.send(ws, 'response.ResponseActionPacket', { a: true }, packet.id);
    }
}

export class SocialSuspensionHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        this.send(ws, 'social.ServerSocialSuspensionStatePacket', {
            suspended: false
        }, packet.id);
    }
}

export class TelemetryHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        // Acknowledge telemetry to satisfy mod
        this.send(ws, 'telemetry.ServerRecognizedTelemetryPacket', {}, packet.id);
    }
}

export class AllowedDomainsHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const mediaBaseUrl = process.env.MEDIA_BASE_URL || "http://127.0.0.1:8080";
        this.send(ws, "social.ServerSocialAllowedDomainsPacket", {
            domains: getAllowedDomains(mediaBaseUrl)
        }, packet.id);
    }
}

export class TrustedHostsHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const mediaBaseUrl = process.env.MEDIA_BASE_URL || "http://127.0.0.1:8080";
        this.send(ws, "profile.trustedhosts.ServerProfileTrustedHostsClearPacket", {});
        this.send(
            ws,
            "profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket",
            getTrustedHostsPayload(mediaBaseUrl, getUserTrustedHosts(ws.data.userUuid)),
            packet.id
        );
    }
}

export class TrustedHostsCreateHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const trustedHost = createTrustedHost(ws.data.userUuid, packet.payload.a, packet.payload.b);
        this.send(
            ws,
            "profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket",
            {
                a: [{
                    a: trustedHost.id,
                    b: trustedHost.name,
                    c: trustedHost.domains,
                    d: trustedHost.profileId,
                }]
            },
            packet.id
        );
    }
}

export class TrustedHostsDeleteHandler extends BaseHandler {
    handle(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
        const deleted = deleteTrustedHost(ws.data.userUuid, packet.payload.a);
        if (!deleted) {
            this.send(ws, "response.ResponseActionPacket", { a: false, b: "Trusted host not found" }, packet.id);
            return;
        }

        this.send(ws, "profile.trustedhosts.ServerProfileTrustedHostsRemovePacket", {
            a: [packet.payload.a]
        }, packet.id);
    }
}
