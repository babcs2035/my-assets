/**
 * 1Password runtime secrets から credentials と OTP をを取得するためのヘルパーモジュール．
 *
 * デプロイホストで事前抽出された JSON ファイル (`/app/op-secrets.json`)
 * から credentials 情報を読み込む．
 *
 * ファイルの構造:
 * ```json
 * {
 *   "items": {
 *     "MF_Main": {
 *       "username": "user@example.com",
 *       "password": "password123",
 *       "otp_uri": "otpauth://totp/..."
 *     }
 *   }
 * }
 * ```
 */

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { URL } from "node:url";
import logger from "./logger";

const DEFAULT_SECRETS_PATH = "/app/op-secrets.json";

const filteredOpEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => key !== "OP_SERVICE_ACCOUNT_TOKEN",
  ),
) as NodeJS.ProcessEnv;

/**
 * 1Password CLI が利用可能か（インストール済みかつサインイン済み）をチェックする．
 */
function isOpCliAvailable(): boolean {
  try {
    const output = execFileSync("op", ["account", "list"], {
      encoding: "utf-8",
      env: filteredOpEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Runtime secrets ファイルを読み込む．
 */
function loadRuntimeSecrets(): Record<string, unknown> | null {
  const secretsPath = process.env.OP_SECRETS_FILE || DEFAULT_SECRETS_PATH;

  if (!fs.existsSync(secretsPath)) {
    logger.debug({ secretsPath }, "Runtime secrets file not found.");
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
    if (!data || typeof data !== "object" || !("items" in data)) {
      throw new Error("Invalid runtime secrets format: missing 'items' key");
    }
    if (Array.isArray(data.items) || typeof data.items !== "object") {
      throw new Error(
        "Invalid runtime secrets format: 'items' must be an object",
      );
    }
    logger.debug(
      { secretsPath, itemKeys: Object.keys(data.items) },
      "Runtime secrets loaded.",
    );
    return data.items as Record<string, unknown>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read runtime secrets file: ${secretsPath}: ${msg}`,
    );
  }
}

/**
 * Base32 でエンコードされた文字列をデコードする．(RFC 4648 Base32Alphabet を使用)
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = new Array(256);
  // RFC 4648 Base32 alphabet (uppercase only; input is uppercased on line 79)
  for (let i = 0; i < 26; i++) {
    alphabet["ABCDEFGHIJKLMNOPQRSTUVWXYZ".charCodeAt(i)] = i;
  }
  for (let i = 0; i < 10; i++) {
    alphabet["23456789".charCodeAt(i)] = 26 + i;
  }

  const paddedEncoded = encoded.toUpperCase().replace(/=/g, "");
  let bits = "";
  for (let i = 0; i < paddedEncoded.length; i++) {
    const code = alphabet[paddedEncoded.charCodeAt(i)];
    if (code === undefined) {
      throw new Error(`Invalid Base32 character: ${paddedEncoded[i]}`);
    }
    bits += code.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * otpauth:// URI から secret を抽出し，TOTP コードを生成する．
 */
function generateTotpFromUri(otpUri: string): string {
  if (!otpUri.startsWith("otpauth://")) {
    throw new Error(`Invalid otpauth URI: ${otpUri}`);
  }
  const url = new URL(otpUri);
  const queries = Object.fromEntries(url.searchParams.entries());
  const secret = queries.secret;
  if (!secret) {
    throw new Error("otpauth URI does not contain 'secret' parameter");
  }
  const digits = parseInt(queries.digits || "6", 10);
  const period = parseInt(queries.period || "30", 10);
  const algorithm = (queries.algorithm || "SHA1").toUpperCase();
  const hashAlg: Record<string, string> = {
    SHA1: "sha1",
    SHA256: "sha256",
    SHA512: "sha512",
  };
  const hashAlgorithm = hashAlg[algorithm];
  if (!hashAlgorithm) {
    throw new Error(`Unsupported OTP algorithm: ${algorithm}`);
  }
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / period);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigInt64BE(BigInt(counter));
  const digest = createHmac(hashAlgorithm, key).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const codeInt =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    10 ** digits;
  const code = String(codeInt).padStart(digits, "0");
  logger.debug(
    { secret, digits, period, algorithm, counter, code },
    "TOTP code generated.",
  );
  return code;
}

/**
 * `op item get` コマンドの基本部分を構築する．
 * OP_VAULT 環境変数が設定されている場合は --vault フラグを付与する．
 * concealed フィールド（パスワード等）の値を取得するため --reveal を常に付与する．
 */
function buildOpItemGetCommand(itemId: string): string[] {
  const vault = process.env.OP_VAULT;
  const args = ["item", "get", itemId, "--reveal"];
  if (vault) {
    args.push("--vault", vault);
  }
  return args;
}

/**
 * 指定した item から特定の field を取得する．
 */
export function getItemField(itemId: string, field: string): string {
  const items = loadRuntimeSecrets();

  if (!items) {
    if (!isOpCliAvailable()) {
      throw new Error(
        `1Password CLI is not available (not signed in). ` +
          "Run `op signin` or set OP_SECRETS_FILE for runtime secrets.",
      );
    }
    try {
      const output = execFileSync(
        "op",
        [...buildOpItemGetCommand(itemId), "--fields", `label=${field}`],
        {
          encoding: "utf-8",
          env: filteredOpEnv,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      return output.trim();
    } catch (error: unknown) {
      const stderr =
        error !== null && typeof error === "object" && "stderr" in error
          ? String(error.stderr).trim()
          : "";
      // Provide a clearer message for the common "not signed in" case
      if (stderr.includes("not currently signed in")) {
        throw new Error(
          "1Password CLI session expired. Run `op signin` to re-authenticate, " +
            "or set OP_SECRETS_FILE for runtime secrets.",
        );
      }
      logger.error(
        { err: error, field, itemId },
        `Failed to get field '${field}' from 1Password CLI for item: ${itemId}.`,
      );
      throw new Error(
        `Failed to get field '${field}' from 1Password CLI for item: ${itemId}. ${stderr}`,
      );
    }
  }

  const item = items[itemId];
  if (!item || typeof item !== "object") {
    throw new Error(`Runtime secrets do not contain item: ${itemId}`);
  }
  const value = (item as Record<string, unknown>)[field];
  logger.debug(
    { field, hasValue: !!value, availableKeys: Object.keys(item) },
    `getItemField: looking up '${field}'`,
  );
  if (!value) {
    throw new Error(
      `Runtime secrets do not contain '${field}' for item: ${itemId}`,
    );
  }
  return String(value);
}

/**
 * 指定した item の OTP コードを生成する．
 */
export function getItemOtp(itemId: string): string {
  const items = loadRuntimeSecrets();
  logger.info({ itemId, hasSecrets: !!items }, "🔑 Generating OTP...");

  if (!items) {
    if (!isOpCliAvailable()) {
      throw new Error(
        `1Password CLI is not available (not signed in). ` +
          "Run `op signin` or set OP_SECRETS_FILE for runtime secrets.",
      );
    }
    try {
      const output = execFileSync(
        "op",
        [...buildOpItemGetCommand(itemId), "--otp"],
        {
          encoding: "utf-8",
          env: filteredOpEnv,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      return output.trim();
    } catch (error: unknown) {
      const stderr =
        error !== null && typeof error === "object" && "stderr" in error
          ? String(error.stderr).trim()
          : "";
      if (stderr.includes("not currently signed in")) {
        throw new Error(
          "1Password CLI session expired. Run `op signin` to re-authenticate, " +
            "or set OP_SECRETS_FILE for runtime secrets.",
        );
      }
      logger.error(
        { err: error, itemId },
        `Failed to get OTP from 1Password CLI for item: ${itemId}.`,
      );
      throw new Error(
        `Failed to get OTP from 1Password CLI for item: ${itemId}. ${stderr}`,
      );
    }
  }

  let otpUri: string;
  try {
    otpUri = getItemField(itemId, "otp_uri");
    logger.info({ itemId, source: "otp_uri" }, "OTP URI resolved.");
  } catch {
    try {
      otpUri = getItemField(itemId, "otp");
      logger.info({ itemId, source: "otp" }, "OTP URI resolved.");
    } catch {
      try {
        otpUri = getItemField(itemId, "one-time password");
        logger.info(
          { itemId, source: "one-time password" },
          "OTP URI resolved.",
        );
      } catch {
        throw new Error(
          `Runtime secrets do not contain 'otp_uri', 'otp', or 'one-time password' for item: ${itemId}. ` +
            "Ensure the 1Password item has OTP configured with an otpauth:// URI.",
        );
      }
    }
  }
  if (!otpUri.startsWith("otpauth://")) {
    throw new Error(
      `Runtime OTP for item ${itemId} is not an otpauth URI. ` +
        "Refresh runtime secrets with OTP secret URI (starting with 'otpauth://') " +
        "instead of one-time numeric code.",
    );
  }
  try {
    const code = generateTotpFromUri(otpUri);
    logger.info({ itemId, code }, "OTP code generated successfully.");
    return code;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate OTP from URI for item ${itemId}: ${msg}. ` +
        "Ensure the OTP URI is valid and in otpauth:// format.",
    );
  }
}
