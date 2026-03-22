import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import { PathService } from "../system/path-service";

type SecretRecord = Record<string, string>;

export class SecretsStore {
  constructor(private readonly pathService: PathService) {}

  get(key: string): string | undefined {
    const secrets = this.readAll();
    const encrypted = secrets[key];

    if (!encrypted) {
      return undefined;
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      }

      return Buffer.from(encrypted, "base64").toString("utf-8");
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string): void {
    const secrets = this.readAll();
    const normalized = value.trim();

    if (!normalized) {
      delete secrets[key];
      this.writeAll(secrets);
      return;
    }

    const encoded = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(normalized).toString("base64")
      : Buffer.from(normalized, "utf-8").toString("base64");

    secrets[key] = encoded;
    this.writeAll(secrets);
  }

  delete(key: string): void {
    const secrets = this.readAll();
    if (!(key in secrets)) {
      return;
    }

    delete secrets[key];
    this.writeAll(secrets);
  }

  private readAll(): SecretRecord {
    const filePath = this.pathService.getSecretsPath();
    const directory = path.dirname(filePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SecretRecord;
    } catch {
      return {};
    }
  }

  private writeAll(secrets: SecretRecord): void {
    fs.writeFileSync(
      this.pathService.getSecretsPath(),
      JSON.stringify(secrets, null, 2),
      "utf-8"
    );
  }
}
