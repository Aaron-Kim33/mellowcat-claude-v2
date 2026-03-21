import fs from "node:fs";

export class FileService {
  ensureDir(targetPath: string): void {
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
  }

  copyDirectory(sourcePath: string, targetPath: string): void {
    this.ensureDir(targetPath);
    fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
  }

  remove(targetPath: string): void {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }

  readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  }
}
