import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    console.warn("Warning: ENCRYPTION_KEY not set. Using static fallback key. Set ENCRYPTION_KEY for production.");
    const fallbackKey = "payverse-encryption-key-2024";
    cachedKey = crypto.createHash("sha256").update(fallbackKey).digest();
  } else {
    cachedKey = crypto.createHash("sha256").update(key).digest();
  }
  return cachedKey;
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");
  
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted text format");
  }
  
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
