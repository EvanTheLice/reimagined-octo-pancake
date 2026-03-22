import { z } from "zod";
import type { Packet } from "./protocol";

const uuidSchema = z.string().uuid();
const emptySchema = z.object({}).passthrough();
const stringSetSchema = z.array(z.string());
const uuidSetSchema = z.array(uuidSchema);
const nullableStringSchema = z.string().nullable();
const nullableNumberSchema = z.number().int().nullable();

const PACKET_SCHEMAS: Record<string, z.ZodTypeAny> = {
    "relationships.ClientRelationshipCreatePacket": z.object({
        a: uuidSchema,
        b: z.enum(["FRIENDS", "BLOCKED", "NEUTRAL"]),
    }).passthrough(),
    "relationships.RelationshipDeletePacket": z.object({
        a: uuidSchema,
        b: z.enum(["FRIENDS", "BLOCKED", "NEUTRAL"]),
    }).passthrough(),
    "relationships.ClientLookupUuidByNamePacket": z.object({
        username: z.string().trim().min(1).max(64),
    }).passthrough(),
    "social.SocialInviteToServerPacket": z.object({
        a: uuidSchema,
        b: z.string().trim().min(1).max(512),
    }).passthrough(),
    "profile.trustedhosts.ClientProfileTrustedHostsCreatePacket": z.object({
        a: z.string().trim().min(1).max(128),
        b: z.array(z.string().trim().min(1).max(255)).min(1).max(64),
    }).passthrough(),
    "profile.trustedhosts.ClientProfileTrustedHostsDeletePacket": z.object({
        a: z.string().trim().min(1).max(128),
    }).passthrough(),
    "wardrobe.ClientWardrobeSettingsPacket": emptySchema,
    "wardrobe.ClientWardrobeStoreBundleRequestPacket": z.object({
        store_bundle_ids: stringSetSchema,
    }).passthrough(),
    "checkout.ClientCheckoutCosmeticsPacket": z.object({
        cosmetic_ids: stringSetSchema,
        gift_to: uuidSchema.nullish(),
    }).passthrough(),
    "coins.ClientCoinsBalancePacket": emptySchema,
    "coins.ClientCoinBundleOptionsPacket": z.object({
        currency: z.string().trim().length(3),
    }).passthrough(),
    "currency.ClientCurrencyOptionsPacket": emptySchema,
    "cosmetic.ClientCosmeticRequestPacket": z.object({
        a: stringSetSchema.nullish(),
        b: z.array(z.number().int()).nullish(),
    }).passthrough(),
    "cosmetic.categories.ClientCosmeticCategoriesRequestPacket": z.object({
        a: stringSetSchema.nullish(),
        b: stringSetSchema.nullish(),
        c: stringSetSchema.nullish(),
    }).passthrough(),
    "cosmetic.ClientCosmeticBulkRequestUnlockStatePacket": z.object({
        target_user_ids: uuidSetSchema,
        cosmetic_id: z.string().trim().min(1),
    }).passthrough(),
    "cosmetic.ClientCosmeticAnimationTriggerPacket": z.object({
        a: z.string().trim().min(1),
        b: z.string().trim().min(1),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitCreatePacket": z.object({
        name: z.string().trim().min(1).max(64),
        skin_id: z.string().trim().min(1),
        equipped_cosmetics: z.record(z.string(), z.string()).nullish(),
        cosmetic_settings: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).nullish(),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitDeletePacket": z.object({
        id: z.string().trim().min(1),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitSelectPacket": z.object({
        a: z.string().trim().min(1),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitSkinUpdatePacket": z.object({
        a: z.string().trim().min(1),
        b: nullableStringSchema.optional(),
        c: nullableStringSchema.optional(),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitNameUpdatePacket": z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1).max(64),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitCosmeticSettingsUpdatePacket": z.object({
        a: z.string().trim().min(1),
        b: z.string().trim().min(1),
        c: z.array(z.record(z.string(), z.unknown())),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitEquippedCosmeticsUpdatePacket": z.object({
        a: z.string().trim().min(1),
        b: z.string().trim().min(1),
        c: nullableStringSchema.optional(),
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitSelectedRequestPacket": z.object({
        a: uuidSchema,
    }).passthrough(),
    "cosmetic.outfit.ClientCosmeticOutfitUpdateFavoriteStatePacket": z.object({
        id: z.string().trim().min(1),
        state: z.boolean(),
    }).passthrough(),
    "cosmetic.emote.ClientCosmeticEmoteWheelUpdatePacket": z.object({
        a: z.string().trim().min(1),
        b: z.number().int().min(0).max(7),
        c: nullableStringSchema.optional(),
    }).passthrough(),
    "cosmetic.emote.ClientCosmeticEmoteWheelSelectPacket": z.object({
        a: z.string().trim().min(1),
    }).passthrough(),
    "chat.ClientChatChannelCreatePacket": z.object({
        a: z.enum(["DIRECT_MESSAGE", "GROUP_DIRECT_MESSAGE", "ANNOUNCEMENT"]),
        b: z.string().trim().max(64).nullish(),
        c: uuidSetSchema,
    }).passthrough(),
    "chat.ClientChatChannelMessageCreatePacket": z.object({
        a: z.number().int(),
        b: z.string().trim().min(1).max(4000),
        c: nullableNumberSchema.optional(),
    }).passthrough(),
    "chat.ClientChatChannelMessagesRetrievePacket": z.object({
        a: z.number().int(),
        b: nullableNumberSchema.optional(),
        c: nullableNumberSchema.optional(),
        d: z.number().int().min(1).max(200),
    }).passthrough(),
    "chat.ClientChatChannelMessageUpdatePacket": z.object({
        a: z.number().int(),
        b: z.number().int(),
        c: z.string().trim().min(1).max(4000),
    }).passthrough(),
    "chat.ChatChannelMessageDeletePacket": z.object({
        a: z.number().int(),
        b: z.number().int(),
    }).passthrough(),
    "chat.ClientChatChannelMessageReportPacket": z.object({
        a: z.number().int(),
        b: z.number().int(),
        c: z.string().trim().min(1),
    }).passthrough(),
    "chat.ChatChannelMemberAddPacket": z.object({
        a: z.number().int(),
        b: uuidSetSchema,
    }).passthrough(),
    "chat.ChatChannelMemberRemovePacket": z.object({
        a: z.number().int(),
        b: uuidSetSchema,
    }).passthrough(),
    "chat.ClientChatChannelMutePacket": z.object({
        a: z.number().int(),
        b: z.boolean(),
    }).passthrough(),
    "chat.ClientChatChannelReadStatePacket": z.object({
        channel_id: z.number().int(),
        last_read_message_id: nullableNumberSchema.optional(),
    }).passthrough(),
    "chat.ClientChatChannelMessageReadStatePacket": z.object({
        a: z.number().int(),
        b: z.number().int(),
        c: z.boolean(),
    }).passthrough(),
    "notices.ClientNoticeRequestPacket": emptySchema,
    "serverdiscovery.ClientServerDiscoveryRequestPopulatePacket": emptySchema,
    "serverdiscovery.ClientServerDiscoveryRequestPacket": emptySchema,
    "knownservers.ClientKnownServersRequestPacket": emptySchema,
    "media.ClientMediaRequestPacket": emptySchema,
    "media.ClientMediaGetUploadUrlPacket": emptySchema,
    "media.ClientMediaCreatePacket": z.object({
        a: z.string().trim().min(1),
        b: z.string().trim().max(128).nullish(),
        c: z.string().trim().max(512).nullish(),
        d: z.record(z.string(), z.unknown()).nullish(),
    }).passthrough(),
    "media.ClientMediaUpdatePacket": z.object({
        a: z.string().trim().min(1),
        b: z.string().trim().max(128).nullable(),
        c: z.string().trim().max(512).nullable(),
        d: z.boolean().nullable(),
    }).passthrough(),
    "media.ClientMediaDeleteRequestPacket": z.object({
        a: z.string().trim().min(1),
    }).passthrough(),
    "profile.ClientProfileActivityPacket": z.object({
        a: z.string().trim().min(1),
        c: z.record(z.string(), z.unknown()).nullish(),
    }).passthrough(),
    "skin.ClientSkinCreatePacket": z.object({
        name: z.string().trim().min(1).max(64),
        model: z.enum(["CLASSIC", "SLIM"]),
        hash: z.string().trim().min(1),
        favorite: z.boolean(),
    }).passthrough(),
    "skin.ClientSkinDeletePacket": z.object({
        id: z.string().trim().min(1),
    }).passthrough(),
    "skin.ClientSkinUpdateDataPacket": z.object({
        id: z.string().trim().min(1),
        model: z.enum(["CLASSIC", "SLIM"]),
        hash: z.string().trim().min(1),
    }).passthrough(),
    "skin.ClientSkinUpdateLastUsedStatePacket": z.object({
        id: z.string().trim().min(1),
    }).passthrough(),
    "skin.ClientSkinUpdateFavoriteStatePacket": z.object({
        id: z.string().trim().min(1),
        favorited: z.boolean(),
    }).passthrough(),
    "skin.ClientSkinUpdateNamePacket": z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1).max(64),
    }).passthrough(),
    "skin.ClientSelectedSkinsRequestPacket": z.object({
        uuids: uuidSetSchema,
    }).passthrough(),
    "upnp.ClientUPnPSessionCreatePacket": z.object({
        a: z.string().trim().min(1),
        b: z.number().int().min(0).max(65535),
        c: z.enum(["INVITE_ONLY", "FRIENDS"]),
        d: z.number().int().nullish(),
        e: z.string().trim().max(128).nullish(),
    }).passthrough(),
    "upnp.ClientUPnPSessionClosePacket": emptySchema,
    "upnp.ClientUPnPSessionUpdatePacket": z.object({
        a: z.string().trim().min(1).nullish(),
        b: z.number().int().min(0).max(65535).nullish(),
        c: z.enum(["INVITE_ONLY", "FRIENDS"]).nullish(),
    }).passthrough(),
    "upnp.ClientUPnPSessionInvitesAddPacket": z.object({
        a: uuidSetSchema,
    }).passthrough(),
    "upnp.ClientUPnPSessionInvitesRemovePacket": z.object({
        a: uuidSetSchema,
    }).passthrough(),
    "upnp.ClientUPnPSessionPingProxyUpdatePacket": z.object({
        a: z.string().trim().min(1),
    }).passthrough(),
    "social.ClientCommunityRulesAgreedPacket": emptySchema,
    "telemetry.ClientTelemetryPacket": z.record(z.string(), z.unknown()),
    "connection.ClientConnectionDisconnectPacket": z.object({
        message: z.string(),
    }).passthrough(),
    "pingproxy.ClientPingProxyPacket": z.object({
        a: z.string().trim().min(1).max(255),
        b: z.number().int().min(1).max(65535),
        c: z.number().int().min(0).max(1_000_000),
    }).passthrough(),
};

export function validatePacketPayload(packet: Packet) {
    const schema = PACKET_SCHEMAS[packet.type];
    if (!schema) {
        return { success: true as const, data: packet.payload };
    }

    const result = schema.safeParse(packet.payload ?? {});
    if (!result.success) {
        return result;
    }

    packet.payload = result.data;
    return result;
}
