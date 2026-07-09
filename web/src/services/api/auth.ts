import { apiUrl } from "@/constant/env";
import type { LocalUser } from "@/stores/use-user-store";

export type AuthResponse = {
    token: string;
    user: LocalUser;
};

function authHeaders(token?: string): HeadersInit {
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function readApi<T>(response: Response): Promise<T> {
    const body = await response.json();
    if (!response.ok || body.code !== 0) throw new Error(body.msg || `请求失败：${response.status}`);
    return body.data as T;
}

export async function registerUser(input: { username: string; password: string; displayName?: string; authCode: string }): Promise<AuthResponse> {
    return readApi<AuthResponse>(
        await fetch(apiUrl("/api/auth/register"), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(input),
        }),
    );
}

export async function loginUser(input: { username: string; password: string }): Promise<AuthResponse> {
    return readApi<AuthResponse>(
        await fetch(apiUrl("/api/auth/login"), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(input),
        }),
    );
}

export async function fetchCurrentUser(token: string): Promise<LocalUser> {
    return readApi<LocalUser>(await fetch(apiUrl("/api/auth/me"), { headers: authHeaders(token) }));
}

export async function logoutUser(token: string): Promise<void> {
    await readApi<void>(await fetch(apiUrl("/api/auth/logout"), { method: "POST", headers: authHeaders(token) }));
}

export function bearerHeaders(token: string): HeadersInit {
    return authHeaders(token);
}
