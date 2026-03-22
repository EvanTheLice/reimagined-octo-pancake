import { describe, expect, test } from "bun:test";

const INFRA_ROOT = "D:/code/Essential-Mod/subprojects/infra/src/main/java/gg/essential/connectionmanager/common/packet";

async function readInfraPacket(relativePath: string) {
    return Bun.file(`${INFRA_ROOT}/${relativePath}`).text();
}

describe("infra source regressions", () => {
    test("connection packet classes keep the payload expectations used by the server", async () => {
        const disconnectPacket = await readInfraPacket("connection/ClientConnectionDisconnectPacket.java");
        const keepAlivePacket = await readInfraPacket("connection/ConnectionKeepAlivePacket.java");
        const reconnectPacket = await readInfraPacket("connection/ServerConnectionReconnectPacket.java");

        expect(disconnectPacket).toContain("private final String message;");
        expect(disconnectPacket).toContain("public ClientConnectionDisconnectPacket(@NotNull final String message)");
        expect(disconnectPacket).toContain("public String getMessage()");

        expect(keepAlivePacket).toContain("class ConnectionKeepAlivePacket extends Packet");
        expect(keepAlivePacket).not.toContain("private final");

        expect(reconnectPacket).toContain("class ServerConnectionReconnectPacket extends Packet");
        expect(reconnectPacket).not.toContain("private final");
    });

    test("profile, social, chat, skin, and outfit packet fields still match server payload keys", async () => {
        const profileStatusPacket = await readInfraPacket("profile/ServerProfileStatusPacket.java");
        const socialAllowedDomainsPacket = await readInfraPacket("social/ServerSocialAllowedDomainsPacket.java");
        const chatChannelAddPacket = await readInfraPacket("chat/ServerChatChannelAddPacket.java");
        const selectedSkinsPacket = await readInfraPacket("skin/ServerSelectedSkinsResponsePacket.java");
        const outfitSelectedPacket = await readInfraPacket("cosmetic/outfit/ServerCosmeticOutfitSelectedResponsePacket.java");

        expect(profileStatusPacket).toContain('@SerializedName("a")');
        expect(profileStatusPacket).toContain('@SerializedName("b")');
        expect(profileStatusPacket).toContain('@SerializedName("punishment_status")');
        expect(profileStatusPacket).toContain("private final UUID uuid;");
        expect(profileStatusPacket).toContain("private final ProfileStatus status;");

        expect(socialAllowedDomainsPacket).toContain("private final List<String> domains;");
        expect(socialAllowedDomainsPacket).toContain("getDomains()");

        expect(chatChannelAddPacket).toContain('@SerializedName("a")');
        expect(chatChannelAddPacket).toContain("private final List<Channel> channels;");

        expect(selectedSkinsPacket).toContain("private final Map<UUID, String> skins;");
        expect(selectedSkinsPacket).toContain("getSkins()");

        expect(outfitSelectedPacket).toContain("private final UUID uuid;");
        expect(outfitSelectedPacket).toContain("private final String skinTexture;");
        expect(outfitSelectedPacket).toContain("private final Map<CosmeticSlot, String> equippedCosmetics;");
        expect(outfitSelectedPacket).toContain("private final Map<String, List<CosmeticSetting>> cosmeticSettings;");
    });
});
