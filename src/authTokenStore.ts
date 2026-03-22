import { v4 as uuidv4 } from "uuid";

const USER_AUTH_TOKENS = new Map<string, string>();

export function getOrCreateAuthToken(userUuid: string, providedToken?: string | null) {
    const existingToken = USER_AUTH_TOKENS.get(userUuid);
    const normalizedToken = providedToken?.trim();
    if (existingToken) {
        return existingToken;
    }

    if (normalizedToken) {
        USER_AUTH_TOKENS.set(userUuid, normalizedToken);
        return normalizedToken;
    }

    const createdToken = `mock-token-${uuidv4()}`;
    USER_AUTH_TOKENS.set(userUuid, createdToken);
    return createdToken;
}

export function resetAuthTokens() {
    USER_AUTH_TOKENS.clear();
}
