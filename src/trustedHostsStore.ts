import { v4 as uuidv4 } from "uuid";
import { db } from "./db";

db.run(`
  CREATE TABLE IF NOT EXISTS trusted_hosts (
    id TEXT PRIMARY KEY,
    user_uuid TEXT NOT NULL,
    name TEXT NOT NULL,
    domains_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

type TrustedHostRecord = {
    id: string;
    name: string;
    domains: string[];
    profileId: string | null;
};

function normalizeDomains(domains: Iterable<string>) {
    return [...new Set(
        [...domains]
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean)
    )];
}

function buildTrustedHostRecord(row: any): TrustedHostRecord {
    return {
        id: row.id,
        name: row.name,
        domains: JSON.parse(row.domains_json || "[]"),
        profileId: row.user_uuid,
    };
}

export function createTrustedHost(userUuid: string, name: string, domains: Iterable<string>) {
    const trustedHost = {
        id: uuidv4(),
        user_uuid: userUuid,
        name: name.trim(),
        domains_json: JSON.stringify(normalizeDomains(domains)),
        created_at: Date.now(),
    };

    db.run(
        "INSERT INTO trusted_hosts (id, user_uuid, name, domains_json, created_at) VALUES (?, ?, ?, ?, ?)",
        [trustedHost.id, trustedHost.user_uuid, trustedHost.name, trustedHost.domains_json, trustedHost.created_at]
    );

    return buildTrustedHostRecord(trustedHost);
}

export function getUserTrustedHosts(userUuid: string) {
    return (db.query(
        "SELECT * FROM trusted_hosts WHERE user_uuid = ? ORDER BY created_at ASC"
    ).all(userUuid) as any[]).map(buildTrustedHostRecord);
}

export function deleteTrustedHost(userUuid: string, trustedHostId: string) {
    const result = db.run(
        "DELETE FROM trusted_hosts WHERE user_uuid = ? AND id = ?",
        [userUuid, trustedHostId]
    );

    return result.changes > 0;
}
