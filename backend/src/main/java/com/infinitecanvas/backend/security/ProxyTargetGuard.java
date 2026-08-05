package com.infinitecanvas.backend.security;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/**
 * 代理目标 SSRF 防护：拒绝解析到内网 / 环回 / 链路本地 / 组播 / 保留地址的
 * 目标。AI 供应商与图床均为公网地址；ComfyUI 代理不适用本校验（其合法
 * 目标就是本机回环与局域网，已通过登录鉴权保护）。
 */
public final class ProxyTargetGuard {

    private ProxyTargetGuard() {
    }

    /**
     * 校验目标 URI 是否可安全转发。host 无法解析（DNS 失败）视为非法；
     * 任一解析结果落入私网段即拒绝。
     */
    public static void assertPublicTarget(URI uri) {
        String host = uri.getHost();
        if (host == null || host.isBlank()) throw new IllegalArgumentException("代理目标缺少主机名");
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("代理目标无法解析：" + host);
        }
        for (InetAddress address : addresses) {
            if (isPrivateAddress(address)) throw new IllegalArgumentException("代理目标不允许访问内网或本机地址：" + host);
        }
    }

    private static boolean isPrivateAddress(InetAddress address) {
        if (address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress() || address.isAnyLocalAddress()) {
            return true;
        }
        if (address instanceof Inet4Address inet4) {
            byte[] bytes = inet4.getAddress();
            int first = bytes[0] & 0xFF;
            // 保留段：0.x、169.254.x（链路本地已覆盖）、172.16-31.x（站点本地已覆盖）、
            // 192.0.0.x、198.18/198.19（基准测试）、240+（保留）、100.64-127.x（CGNAT）。
            if (first == 0) return true;
            if (first == 100 && (bytes[1] & 0xFF) >= 64 && (bytes[1] & 0xFF) <= 127) return true;
            if (first == 192 && bytes[1] == 0 && (bytes[2] & 0xFF) == 0) return true;
            if (first == 198 && ((bytes[1] & 0xFF) == 18 || (bytes[1] & 0xFF) == 19)) return true;
            if (first >= 240) return true;
        } else if (address instanceof Inet6Address inet6) {
            // IPv4 映射地址（::ffff:a.b.c.d）按 IPv4 规则复查。
            byte[] bytes = inet6.getAddress();
            boolean ipv4Mapped = true;
            for (int i = 0; i < 10; i++) {
                if (bytes[i] != 0) {
                    ipv4Mapped = false;
                    break;
                }
            }
            if (ipv4Mapped && bytes[10] == (byte) 0xFF && bytes[11] == (byte) 0xFF) {
                try {
                    return isPrivateAddress(InetAddress.getByAddress(new byte[]{bytes[12], bytes[13], bytes[14], bytes[15]}));
                } catch (UnknownHostException ignored) {
                    return true;
                }
            }
            // 唯一本地地址（fc00::/7）视为内网。
            int first16 = ((bytes[0] & 0xFF) << 8) | (bytes[1] & 0xFF);
            if ((first16 & 0xFE00) == 0xFC00) return true;
        }
        return false;
    }
}
