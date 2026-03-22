function buildLocalizedName(value: string) {
    return { en_US: value };
}

export function getAllowedDomains(mediaBaseUrl: string) {
    const domains = new Set(["127.0.0.1", "localhost"]);

    try {
        domains.add(new URL(mediaBaseUrl).hostname);
    } catch {
        // Ignore invalid override and keep local fallbacks.
    }

    return [...domains];
}

type TrustedHostEntry = {
    id: string;
    name: string;
    domains: string[];
    profileId: string | null;
};

export function getTrustedHostsPayload(mediaBaseUrl: string, userTrustedHosts: TrustedHostEntry[] = []) {
    return {
        a: [
            {
                a: "local-development",
                b: "Local Development",
                c: getAllowedDomains(mediaBaseUrl),
                d: null,
            },
            ...userTrustedHosts.map((trustedHost) => ({
                a: trustedHost.id,
                b: trustedHost.name,
                c: trustedHost.domains,
                d: trustedHost.profileId,
            })),
        ],
    };
}

export function getCommunityRulesPayload(accepted: boolean) {
    return {
        accepted,
        rules: [
            buildLocalizedName("Keep It Clean"),
            buildLocalizedName("Be Nice & Respectful"),
            buildLocalizedName("No Bullying"),
            buildLocalizedName("No Spamming"),
            buildLocalizedName("No Scams"),
        ],
    };
}

export function getChatReportReasonsPayload() {
    return {
        a: {
            SPAM: buildLocalizedName("Spam or disruptive activity"),
            ABUSE_OR_HARASSMENT: buildLocalizedName("Abuse or harassment"),
            MALICIOUS_CONTENT: buildLocalizedName("Malicious content"),
            INAPPROPRIATE_CONTENT: buildLocalizedName("Inappropriate content"),
            HARMFUL_MISINFORMATION: buildLocalizedName("Harmful misinformation"),
            ILLEGAL_GOODS_OR_SERVICES: buildLocalizedName("Illegal goods or services"),
        },
    };
}

export function getCosmeticTypesPayload() {
    return {
        a: [
            { a: "WINGS", b: "WINGS", c: buildLocalizedName("Wings") },
            { a: "TOP", b: "TOP", c: buildLocalizedName("Top") },
            { a: "Skirt", b: "SKIRT", c: buildLocalizedName("Skirt") },
            { a: "SHOULDERS", b: "SHOULDERS", c: buildLocalizedName("Shoulders") },
            { a: "SHOES", b: "SHOES", c: buildLocalizedName("Shoes") },
            { a: "PETS", b: "PET", c: buildLocalizedName("Pets") },
            { a: "PARTICLES", b: "EFFECT", c: buildLocalizedName("Particles") },
            { a: "PANTS", b: "PANTS", c: buildLocalizedName("Pants") },
            { a: "OUTERWEAR", b: "FULL_BODY", c: buildLocalizedName("Outerwear") },
            { a: "MOVEMENT", b: "EMOTE", c: buildLocalizedName("Movement") },
            { a: "ICON", b: "ICON", c: buildLocalizedName("Icon") },
            { a: "HEAD", b: "HEAD", c: buildLocalizedName("Head") },
            { a: "HAT", b: "HAT", c: buildLocalizedName("Hat") },
            { a: "HAIR", b: "HEAD", c: buildLocalizedName("Hair") },
            { a: "FACE", b: "FACE", c: buildLocalizedName("Face") },
            { a: "EARS", b: "EARS", c: buildLocalizedName("Ears") },
            { a: "DANCE", b: "EMOTE", c: buildLocalizedName("Dances") },
            { a: "CAPE", b: "CAPE", c: buildLocalizedName("Cape") },
            { a: "BASIC", b: "EMOTE", c: buildLocalizedName("Basic") },
            { a: "BACK", b: "BACK", c: buildLocalizedName("Back") },
            { a: "ARMS", b: "ARMS", c: buildLocalizedName("Arms") },
            { a: "ADVANCED", b: "EMOTE", c: buildLocalizedName("Advanced") },
            { a: "ACCESSORY", b: "ACCESSORY", c: buildLocalizedName("Accessory") },
        ],
    };
}

export function getCosmeticCategoriesPayload(mediaBaseUrl: string) {
    return {
        a: [
            { a: "capes", b: buildLocalizedName("Capes"), c: { a: `${mediaBaseUrl}/static/texture.png`, b: "hash" }, d: ["CAPE"], f: 0 },
            { a: "wings", b: buildLocalizedName("Wings"), c: { a: `${mediaBaseUrl}/static/texture.png`, b: "hash" }, d: ["WINGS"], f: 1 },
            { a: "popular", b: buildLocalizedName("Popular"), c: { a: `${mediaBaseUrl}/static/texture.png`, b: "hash" }, d: [], f: 2 },
        ],
    };
}
