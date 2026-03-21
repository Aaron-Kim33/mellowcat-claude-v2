export class SecretsStore {
  async get(_key: string): Promise<string | undefined> {
    return undefined;
  }

  async set(_key: string, _value: string): Promise<void> {
    return;
  }

  async delete(_key: string): Promise<void> {
    return;
  }
}
