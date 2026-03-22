type UpnpSession = {
    hostUuid: string;
    ip: string;
    port: number;
    privacy: "INVITE_ONLY" | "FRIENDS";
    invites: Set<string>;
    createdAt: number;
    protocolVersion: number | null;
    worldName: string | null;
    rawStatus: string | null;
};

const sessions = new Map<string, UpnpSession>();

export function createOrReplaceSession(session: Omit<UpnpSession, "invites"> & { invites?: Iterable<string> }) {
    const normalized: UpnpSession = {
        ...session,
        invites: new Set(session.invites ?? []),
    };
    sessions.set(normalized.hostUuid, normalized);
    return normalized;
}

export function getSession(hostUuid: string) {
    return sessions.get(hostUuid) ?? null;
}

export function getAllSessions() {
    return Array.from(sessions.values());
}

export function removeSession(hostUuid: string) {
    sessions.delete(hostUuid);
}

export function resetSessions() {
    sessions.clear();
}

export function addInvites(hostUuid: string, invites: Iterable<string>) {
    const session = sessions.get(hostUuid);
    if (!session) {
        return null;
    }

    for (const invite of invites) {
        session.invites.add(invite);
    }

    return session;
}

export function removeInvites(hostUuid: string, invites: Iterable<string>) {
    const session = sessions.get(hostUuid);
    if (!session) {
        return null;
    }

    for (const invite of invites) {
        session.invites.delete(invite);
    }

    return session;
}

export function updateSession(hostUuid: string, updates: Partial<Pick<UpnpSession, "ip" | "port" | "privacy" | "protocolVersion" | "worldName" | "rawStatus">>) {
    const session = sessions.get(hostUuid);
    if (!session) {
        return null;
    }

    Object.assign(session, updates);
    return session;
}

export function serializeSession(session: UpnpSession) {
    return {
        a: session.hostUuid,
        b: session.ip,
        c: session.port,
        d: session.privacy,
        e: Array.from(session.invites),
        f: session.createdAt,
        g: session.protocolVersion,
        h: session.worldName,
    };
}
