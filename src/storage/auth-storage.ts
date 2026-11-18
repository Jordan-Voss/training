export const authStorage = {
  getItem(key: string) {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    localStorage.setItem(key, value);
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
  },
};
