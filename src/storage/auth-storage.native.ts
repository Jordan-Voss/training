import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
function safe(key: string) {
  return `training.${key.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}
async function clear(key: string) {
  const old = await SecureStore.getItemAsync(safe(key));
  if (old) {
    const { generation, count } = JSON.parse(old);
    for (let i = 0; i < count; i++)
      await SecureStore.deleteItemAsync(`${safe(key)}.${generation}.${i}`);
  }
}
export const authStorage = {
  async getItem(key: string) {
    const meta = await SecureStore.getItemAsync(safe(key));
    if (!meta) return null;
    const { generation, count } = JSON.parse(meta);
    let value = '';
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${safe(key)}.${generation}.${i}`);
      if (chunk === null) return null;
      value += chunk;
    }
    return value;
  },
  async setItem(key: string, value: string) {
    const generation = randomUUID();
    const count = Math.ceil(value.length / 1500);
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        `${safe(key)}.${generation}.${i}`,
        value.slice(i * 1500, (i + 1) * 1500),
      );
    const old = await SecureStore.getItemAsync(safe(key));
    await SecureStore.setItemAsync(safe(key), JSON.stringify({ generation, count }));
    if (old) {
      const m = JSON.parse(old);
      for (let i = 0; i < m.count; i++)
        await SecureStore.deleteItemAsync(`${safe(key)}.${m.generation}.${i}`);
    }
  },
  async removeItem(key: string) {
    await clear(key);
    await SecureStore.deleteItemAsync(safe(key));
  },
};
