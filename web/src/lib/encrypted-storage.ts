/**
 * 加密存储适配器
 * 
 * 将 Zustand persist 的 localStorage 存储改为加密存储。
 * 在保存时加密，读取时解密。
 */

import { encryptToken, decryptToken } from "./token-encryption";

export function createEncryptedStorage() {
    const storageKey = "infinite-canvas:user_store";
    const encryptedKey = "infinite-canvas:user_store:encrypted";
    
    return {
        getItem: async (_name: string): Promise<string | null> => {
            try {
                // 优先读取加密版本
                const encrypted = localStorage.getItem(encryptedKey);
                if (encrypted) {
                    const decrypted = await decryptToken(encrypted);
                    if (decrypted) {
                        return decrypted;
                    }
                }
                // 降级：尝试旧格式
                return localStorage.getItem(storageKey);
            } catch {
                return localStorage.getItem(storageKey);
            }
        },
        
        setItem: async (_name: string, value: string): Promise<void> => {
            try {
                // 尝试加密存储
                const encrypted = await encryptToken(value);
                localStorage.setItem(encryptedKey, encrypted);
                // 清除旧明文存储
                localStorage.removeItem(storageKey);
            } catch {
                // 如果加密失败（可能是隐私模式或 Web Crypto 不可用），降级为明文存储
                localStorage.setItem(storageKey, value);
                localStorage.removeItem(encryptedKey);
            }
        },
        
        removeItem: async (_name: string): Promise<void> => {
            localStorage.removeItem(storageKey);
            localStorage.removeItem(encryptedKey);
        },
    };
}

/**
 * 同步检查是否有明文 token 需要迁移
 * 在应用启动早期（async storage 初始化之前）调用
 */
export function migratePlaintextToken(): boolean {
    const storageKey = "infinite-canvas:user_store";
    const encryptedKey = "infinite-canvas:user_store:encrypted";
    
    try {
        const existing = localStorage.getItem(encryptedKey);
        // 如果已有加密版本，不需要迁移
        if (existing) return false;
        
        const plaintext = localStorage.getItem(storageKey);
        if (plaintext && plaintext.includes('"token"')) {
            // 这是旧的 JSON 格式，需要解密后重新加密存储
            return true;
        }
    } catch {
        // 忽略 localStorage 错误
    }
    return false;
}
