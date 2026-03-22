import { ServerWebSocket } from "bun";
import { ConnectionCodec, Packet } from "../protocol";
import { WebSocketData, CONNECTED_USERS } from "../state";
import { logger } from "../logger";
import { BaseHandler } from "./impl/BaseHandler";
import { User } from "../models/User";
import { validatePacketPayload } from "../packetSchemas";
import * as Social from "./impl/SocialHandlers";
import * as Cosmetic from "./impl/CosmeticHandlers";
import * as Chat from "./impl/ChatHandlers";
import * as Discovery from "./impl/DiscoveryHandlers";
import * as Multiplayer from "./impl/MultiplayerHandlers";
import * as Profile from "./impl/ProfileHandlers";
import * as Skin from "./impl/SkinHandlers";
import * as Outfit from "./impl/OutfitHandlers";
import * as System from "./impl/SystemHandlers";
import * as Emote from "./impl/EmoteHandlers";
import * as UPnP from "./impl/UPnPHandlers";

export function sendPacket(ws: ServerWebSocket<WebSocketData>, type: string, payload: any, id?: string) {
    logger.debug({ user: ws.data.userName, type, id }, "Sending packet");
    const buffers = ws.data.codec.encode(type, payload, id);
    for (const buffer of buffers) {
        ws.send(buffer);
    }
}

export function sendProfileStatus(targetWs: ServerWebSocket<WebSocketData>, subjectUuid: string) {
    sendPacket(targetWs, 'profile.ServerProfileStatusPacket', {
        a: subjectUuid,
        b: 'ONLINE',
        lastOnlineTimestamp: Date.now(),
        punishment_status: null
    });
}

const HANDLERS: Record<string, BaseHandler> = {
    // Relationships
    'relationships.ClientRelationshipCreatePacket': new Social.RelationshipCreateHandler(),
    'relationships.RelationshipDeletePacket': new Social.RelationshipDeleteHandler(),
    'relationships.ClientLookupUuidByNamePacket': new Social.LookupUuidHandler(),
    'social.SocialInviteToServerPacket': new Social.SocialInviteHandler(),
    'profile.trustedhosts.ClientProfileTrustedHostsCreatePacket': new System.TrustedHostsCreateHandler(),
    'profile.trustedhosts.ClientProfileTrustedHostsDeletePacket': new System.TrustedHostsDeleteHandler(),

    // Wardrobe & Cosmetics
    'wardrobe.ClientWardrobeSettingsPacket': new Cosmetic.WardrobeSettingsHandler(),
    'checkout.ClientCheckoutCosmeticsPacket': new Cosmetic.CheckoutCosmeticsHandler(),
    'coins.ClientCoinsBalancePacket': new Cosmetic.CoinsBalanceHandler(),
    'coins.ClientCoinBundleOptionsPacket': new Cosmetic.CoinBundleOptionsHandler(),
    'wardrobe.ClientWardrobeStoreBundleRequestPacket': new Cosmetic.WardrobeStoreBundleRequestHandler(),
    'cosmetic.ClientCosmeticRequestPacket': new Cosmetic.CosmeticRequestHandler(),
    'cosmetic.categories.ClientCosmeticCategoriesRequestPacket': new Cosmetic.CosmeticCategoriesRequestHandler(),
    'cosmetic.ClientCosmeticBulkRequestUnlockStatePacket': new Cosmetic.CosmeticBulkRequestUnlockStateHandler(),

    // Outfits
    'cosmetic.outfit.ClientCosmeticOutfitCreatePacket': new Outfit.OutfitCreateHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitDeletePacket': new Outfit.OutfitDeleteHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitSelectPacket': new Outfit.OutfitSelectHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitSkinUpdatePacket': new Outfit.OutfitSkinUpdateHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitNameUpdatePacket': new Outfit.OutfitNameUpdateHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitCosmeticSettingsUpdatePacket': new Outfit.OutfitCosmeticSettingsUpdateHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitEquippedCosmeticsUpdatePacket': new Outfit.OutfitEquippedUpdateHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitSelectedRequestPacket': new Outfit.OutfitSelectedRequestHandler(),
    'cosmetic.outfit.ClientCosmeticOutfitUpdateFavoriteStatePacket': new Outfit.OutfitFavoriteHandler(),

    // Emote Wheels
    'cosmetic.emote.ClientCosmeticEmoteWheelUpdatePacket': new Emote.EmoteWheelUpdateHandler(),
    'cosmetic.emote.ClientCosmeticEmoteWheelSelectPacket': new Emote.EmoteWheelSelectHandler(),

    // Chat
    'chat.ClientChatChannelMessageCreatePacket': new Chat.ChatMessageHandler(),
    'chat.ClientChatChannelMessagesRetrievePacket': new Chat.ChatHistoryHandler(),
    'chat.ClientChatChannelCreatePacket': new Chat.ChatChannelCreateHandler(),
    'chat.ClientChatChannelMessageUpdatePacket': new Chat.ChatMessageEditHandler(),
    'chat.ChatChannelMessageDeletePacket': new Chat.ChatMessageDeleteHandler(),
    'chat.ClientChatChannelMessageReportPacket': new Chat.ChatMessageReportHandler(),
    'chat.ChatChannelMemberAddPacket': new Chat.ChatMemberAddHandler(),
    'chat.ChatChannelMemberRemovePacket': new Chat.ChatMemberRemoveHandler(),
    'chat.ClientChatChannelMutePacket': new Chat.ChatChannelMuteHandler(),
    'chat.ClientChatChannelReadStatePacket': new Chat.ChatChannelReadStateHandler(),
    'chat.ClientChatChannelMessageReadStatePacket': new Chat.ChatMessageReadStateHandler(),

    'notices.ClientNoticeRequestPacket': new Discovery.NoticesHandler(),
    'serverdiscovery.ClientServerDiscoveryRequestPopulatePacket': new Discovery.ServerDiscoveryHandler(),
    'serverdiscovery.ClientServerDiscoveryRequestPacket': new Discovery.ServerDiscoveryHandler(),
    'knownservers.ClientKnownServersRequestPacket': new Discovery.KnownServersHandler(),
    'media.ClientMediaRequestPacket': new Discovery.MediaHandler(),
    'media.ClientMediaCreatePacket': new Discovery.MediaCreateHandler(),
    'media.ClientMediaGetUploadUrlPacket': new Discovery.MediaGetUploadUrlHandler(),
    'media.ClientMediaUpdatePacket': new Discovery.MediaUpdateHandler(),
    'media.ClientMediaDeleteRequestPacket': new Discovery.MediaDeleteHandler(),
    'currency.ClientCurrencyOptionsPacket': new Cosmetic.CurrencyHandler(),

    // Multiplayer Signaling
    'ice.IceSessionPacket': new Multiplayer.IceRelayHandler(),
    'ice.IceCandidatePacket': new Multiplayer.IceRelayHandler(),
    'pingproxy.ClientPingProxyPacket': new Multiplayer.PingProxyHandler(),
    'cosmetic.ClientCosmeticAnimationTriggerPacket': new Multiplayer.CosmeticAnimationTriggerHandler(),

    // UPnP / SPS
    'upnp.ClientUPnPSessionCreatePacket': new UPnP.UPnPSessionCreateHandler(),
    'upnp.ClientUPnPSessionClosePacket': new UPnP.UPnPSessionCloseHandler(),
    'upnp.ClientUPnPSessionUpdatePacket': new UPnP.UPnPSessionUpdateHandler(),
    'upnp.ClientUPnPSessionInvitesAddPacket': new UPnP.UPnPSessionInvitesAddHandler(),
    'upnp.ClientUPnPSessionInvitesRemovePacket': new UPnP.UPnPSessionInvitesRemoveHandler(),
    'upnp.ClientUPnPSessionPingProxyUpdatePacket': new UPnP.UPnPSessionPingProxyUpdateHandler(),
    // Profile
    'profile.ClientProfileActivityPacket': new Profile.ProfileActivityHandler(),

    // Skin
    'skin.ClientSkinCreatePacket': new Skin.SkinCreateHandler(),
    'skin.ClientSkinDeletePacket': new Skin.SkinDeleteHandler(),
    'skin.ClientSkinUpdateDataPacket': new Skin.SkinUpdateDataHandler(),
    'skin.ClientSkinUpdateLastUsedStatePacket': new Skin.SkinUpdateLastUsedHandler(),
    'skin.ClientSkinUpdateFavoriteStatePacket': new Skin.SkinUpdateFavoriteHandler(),
    'skin.ClientSkinUpdateNamePacket': new Skin.SkinUpdateNameHandler(),
    'skin.ClientSelectedSkinsRequestPacket': new Skin.SelectedSkinsRequestHandler(),

    // System
    'features.ServerDisabledFeaturesPacket': new System.DisabledFeaturesHandler(),
    'features.ServerExternalServicePopulatePacket': new System.ExternalServiceHandler(),
    'social.ServerCommunityRulesStatePacket': new System.CommunityRulesHandler(),
    'social.ClientCommunityRulesAgreedPacket': new System.CommunityRulesAgreedHandler(),
    'social.ServerSocialSuspensionStatePacket': new System.SocialSuspensionHandler(),
    'social.ServerSocialAllowedDomainsPacket': new System.AllowedDomainsHandler(),
    'profile.trustedhosts.ServerProfileTrustedHostsPopulatePacket': new System.TrustedHostsHandler(),
    'telemetry.ClientTelemetryPacket': new System.TelemetryHandler(),
    'chat.ChatUnfilteredContentSettingPacket': new System.DisabledFeaturesHandler(), // Generic ack
};

export async function handlePacket(ws: ServerWebSocket<WebSocketData>, packet: Packet) {
    const { type, id } = packet;
    logger.debug({ user: ws.data.userName, type, id }, "Received packet");

    const validation = validatePacketPayload(packet);
    if (!validation.success) {
        logger.warn({
            type,
            issues: validation.error.issues,
            payload: packet.payload
        }, "Rejected invalid packet payload");
        if (packet.id) {
            sendPacket(ws, 'response.ResponseActionPacket', { a: false, b: 'Invalid payload' }, packet.id);
        }
        return;
    }

    const handler = HANDLERS[type];
    if (handler) {
        await handler.handle(ws, packet);
    } else {
        // Fallback for system-level packets or non-critical checkouts
        switch (type) {
            case 'connection.ConnectionKeepAlivePacket':
                // Client-side heartbeat, ignore
                break;
            case 'subscription.SubscriptionUpdatePacket':
            case 'mod.ClientModsAnnouncePacket':
            case 'cosmetic.capes.ClientCosmeticCapesUnlockedPacket':
                // Return list of unlocked capes
                const user = new User(ws.data.userUuid, ws.data.userName);
                const unlockedCapes = user.getUnlockedCosmeticsByType('cape');
                const capeMap: Record<string, string> = {};
                unlockedCapes.forEach((cape: any) => {
                    capeMap[cape.id] = cape.hash || 'deadbeef';
                });
                sendPacket(ws, 'cosmetic.capes.ServerCosmeticCapesUnlockedPacket', { a: capeMap }, id);
                break;
            case 'connection.ClientConnectionDisconnectPacket':
                logger.info({ user: ws.data.userName }, "User disconnected via packet");
                ws.close();
                break;
            default:
                logger.debug({ type, payload: packet.payload }, "Unhandled packet type");
        }
    }
}
