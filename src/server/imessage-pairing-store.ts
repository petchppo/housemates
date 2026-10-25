import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const REMEMBER_MS = 365 * 24 * 60 * 60_000;
export type RememberedPairing = {
  credentialHash: string; contextHash: string; configFingerprint: string; chatGuid: string; createdAt: number; expiresAt: number;
};
export interface PairingStore { read(): RememberedPairing[]; write(bindings: RememberedPairing[]): void }
const hash = /^[a-f0-9]{64}$/;
export const pairingHash = (value: string): string => createHash("sha256").update(value).digest("hex");
export function householdContextHash(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 16_384 && !/[\u0000-\u001F\u007F]/.test(value) ? pairingHash(value) : null;
}
function validate(value: unknown): RememberedPairing[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error("Invalid pairing registry");
  const credentials = new Set<string>(), chats = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "chatGuid,configFingerprint,contextHash,createdAt,credentialHash,expiresAt" ||
        typeof item.credentialHash !== "string" || !hash.test(item.credentialHash) ||
        typeof item.contextHash !== "string" || !hash.test(item.contextHash) ||
        typeof item.configFingerprint !== "string" || !hash.test(item.configFingerprint) ||
        typeof item.chatGuid !== "string" || !/^iMessage;-;[^\s;]{1,254}$/.test(item.chatGuid) ||
        !Number.isSafeInteger(item.createdAt) || !Number.isSafeInteger(item.expiresAt) || item.createdAt < 0 || item.expiresAt <= item.createdAt ||
        credentials.has(item.credentialHash) || chats.has(item.chatGuid)) throw new Error("Invalid pairing registry");
    credentials.add(item.credentialHash); chats.add(item.chatGuid);
    return { credentialHash: item.credentialHash, contextHash: item.contextHash, configFingerprint: item.configFingerprint,
      chatGuid: item.chatGuid, createdAt: item.createdAt, expiresAt: item.expiresAt };
  });
}
export class MemoryPairingStore implements PairingStore {
  private bindings: RememberedPairing[] = [];
  read() { return validate(this.bindings); }
  write(bindings: RememberedPairing[]) { this.bindings = validate(bindings); }
}

/** Local single-process registry. Only binding metadata and one-way hashes belong here.
 * A corrupt/inaccessible registry fails closed; it is never silently replaced with an empty one. */
export class FilePairingStore implements PairingStore {
  constructor(private file = resolve(process.cwd(), ".housemates", "imessage-pairings.json")) {}
  read(): RememberedPairing[] {
    let stat: ReturnType<typeof lstatSync>;
    try { stat = lstatSync(this.file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new Error("Pairing storage unavailable"); }
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > 65_536) throw new Error("Invalid pairing storage");
    const value: unknown = JSON.parse(readFileSync(this.file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "bindings,version" ||
        !("version" in value) || value.version !== 1 || !("bindings" in value)) throw new Error("Invalid pairing registry");
    return validate(value.bindings);
  }
  write(bindings: RememberedPairing[]): void {
    const content = JSON.stringify({ version: 1, bindings: validate(bindings) });
    const directory = dirname(this.file);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const directoryStat = lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o077) !== 0) throw new Error("Invalid pairing directory");
    // Validate an existing file before replacing it; never overwrite corrupt or unsafe storage.
    this.read();
    const temporary = `${this.file}.${randomBytes(12).toString("hex")}.tmp`;
    let fd: number | undefined;
    try {
      fd = openSync(temporary, "wx", 0o600);
      writeFileSync(fd, content, "utf8"); fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temporary, this.file);
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
}
