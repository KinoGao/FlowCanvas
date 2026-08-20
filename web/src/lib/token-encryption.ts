/**
 * 前端 Token 加密工具
 * 
 * 使用 Web Crypto API (AES-GCM) 对存储在 localStorage 中的敏感数据进行加密。
 * 虽然 XSS 攻击仍可能通过执行 JS 获取解密后的 token，但加密层增加了攻击难度，
 * 防止了从 DevTools 或恶意脚本直接读取明文 token。
 * 
 * 注意：这是纵深防御措施，不能替代 HTTPS + HTTP-Only Cookie 的安全架构。
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/**
 * 从设备指纹生成派生密钥。
 * 使用 PBKDF2 从指纹派生 AES 密钥，确保同一设备不同会话使用相同密钥。
 */
async function deriveKeyFromFingerprint(fingerprint: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(fingerprint),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    
    // TypeScript lib.dom.d.ts 与实际 Web Crypto API 实现存在类型不匹配，
    // Uint8Array.buffer 在严格模式下被视为 ArrayBufferLike 而非 ArrayBuffer，
    // 使用类型断言绕过此兼容性问题。
    const saltBuffer = salt.buffer as unknown as ArrayBuffer;
    
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * 获取设备指纹：结合屏幕分辨率、时区、语言、平台等信息。
 * 这些信息在同设备同浏览器上保持稳定，但难以被恶意网站获取。
 */
function getDeviceFingerprint(): string {
    const components = [
        screen.width,
        screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.language,
        navigator.platform,
        navigator.hardwareConcurrency || "",
    ];
    return components.join("|");
}

/**
 * 加密敏感数据（token）
 */
export async function encryptToken(plaintext: string): Promise<string> {
    const fingerprint = getDeviceFingerprint();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    const key = await deriveKeyFromFingerprint(fingerprint, salt);
    const encoder = new TextEncoder();
    
    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv: iv },
        key,
        encoder.encode(plaintext)
    );
    
    // 合并 salt + iv + ciphertext 并转为 base64
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
}

/**
 * 解密敏感数据（token）
 */
export async function decryptToken(encrypted: string): Promise<string> {
    try {
        const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
        
        const salt = combined.slice(0, SALT_LENGTH);
        const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
        
        const fingerprint = getDeviceFingerprint();
        const key = await deriveKeyFromFingerprint(fingerprint, salt);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv: iv },
            key,
            ciphertext
        );
        
        return new TextDecoder().decode(decrypted);
    } catch {
        // 解密失败（可能是设备指纹变化或数据损坏），返回空字符串触发重新登录
        console.warn("[token-encryption] Decryption failed, token will be cleared");
        return "";
    }
}

/**
 * 清理 localStorage 中可能存在的旧明文 token。
 * 在应用启动时调用一次即可。
 */
export function clearLegacyPlaintextToken(): void {
    const keysToCheck = ["infinite-canvas:user_store", "infinite-canvas:token"];
    for (const key of keysToCheck) {
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                // 检查是否是未加密的 base64 token（32字节 hex 格式的 token 不应该以这种格式存储）
                try {
                    const decoded = atob(stored);
                    // 如果解码后是纯 hex 字符串（类似 token），清除它
                    if (/^[a-f0-9]{64}$/i.test(decoded)) {
                        localStorage.removeItem(key);
                        console.info("[token-encryption] Removed legacy plaintext token");
                    }
                } catch {
                    // 不是有效的 base64，不处理
                }
            }
        } catch {
            // 忽略 localStorage 访问错误
        }
    }
}
