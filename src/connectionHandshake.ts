import { z } from "zod";

const handshakeHeadersSchema = z.object({
    userUuid: z.string().uuid(),
    userName: z.string().trim().optional().transform((value) => value && value.length > 0 ? value : "Unknown"),
    requestedMaxProtocolHeader: z.string().trim().optional().transform((value) => value && value.length > 0 ? value : undefined),
    requestedExactProtocolHeader: z.string().trim().optional().transform((value) => value && value.length > 0 ? value : undefined),
    authenticationToken: z.string().trim().optional().nullable().transform((value) => value && value.length > 0 ? value : undefined),
});

type ParsedHandshake = {
    userUuid: string;
    userName: string;
    protocolVersion: number;
    authenticationToken?: string;
};

function negotiateProtocolVersion(...requestedProtocolHeaders: Array<string | undefined>) {
    for (const requestedProtocolHeader of requestedProtocolHeaders) {
        if (!requestedProtocolHeader) {
            continue;
        }

        const requestedProtocol = Number(requestedProtocolHeader);
        if (Number.isInteger(requestedProtocol)) {
            return Math.max(1, Math.min(9, requestedProtocol));
        }
    }

    return 9;
}

export function parseConnectionHandshake(headers: Headers) {
    const userUuid = headers.get("essential-user-uuid");
    if (!userUuid) {
        return {
            success: false as const,
            status: 401,
            body: "Missing Essential-User-UUID",
        };
    }

    const parsedHeaders = handshakeHeadersSchema.safeParse({
        userUuid,
        userName: headers.get("essential-user-name") ?? undefined,
        requestedMaxProtocolHeader: headers.get("essential-max-protocol-version") ?? undefined,
        requestedExactProtocolHeader: headers.get("essential-protocol-version") ?? undefined,
        authenticationToken: headers.get("essential-authentication-token"),
    });

    if (!parsedHeaders.success) {
        return {
            success: false as const,
            status: 400,
            body: "Invalid Essential handshake headers",
        };
    }

    const data = parsedHeaders.data;
    const handshake: ParsedHandshake = {
        userUuid: data.userUuid,
        userName: data.userName,
        protocolVersion: negotiateProtocolVersion(
            data.requestedMaxProtocolHeader,
            data.requestedExactProtocolHeader
        ),
        authenticationToken: data.authenticationToken,
    };

    return {
        success: true as const,
        handshake,
    };
}
