export function toInfraSkinTexture(hash: string, model: string | null | undefined) {
    return `${model?.toUpperCase() === "SLIM" ? "1" : "0"};${hash}`;
}
