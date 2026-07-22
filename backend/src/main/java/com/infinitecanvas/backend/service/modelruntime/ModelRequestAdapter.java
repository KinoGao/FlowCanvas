package com.infinitecanvas.backend.service.modelruntime;

import com.infinitecanvas.backend.service.PlatformConfigService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;

import java.io.IOException;

/**
 * Pluggable bridge between the canvas-facing model proxy and a vendor-specific
 * request protocol. Each implementation owns its own request shape, vendor
 * authentication, capability validation and response normalisation, all based
 * on the vendor's official documentation.
 *
 * <p>The runtime proxy iterates over every Spring bean implementing this
 * interface, sorts them by {@link #order()} and delegates to the first one
 * whose {@link #supports} returns true. A generic OpenAI/Gemini passthrough
 * adapter sits at the bottom of the chain (highest {@code order} value) for
 * any model that no vendor-specific adapter claims.
 *
 * <p>To add a new model family: write a new {@code @Component} implementing
 * this interface, mark it with the appropriate {@code @Order} or override
 * {@link #order()} to run before the generic adapter, and add the model in
 * the admin panel. No controller or proxy code needs to change.
 *
 * <p>Removing an adapter only affects models its {@link #supports} claims;
 * all other models continue to work because the chain is built dynamically.
 */
public interface ModelRequestAdapter {

    /**
     * Whether this adapter claims the given runtime model and HTTP suffix.
     * Implementations should match on {@code runtime.model().getCategory()},
     * {@code runtime.model().getRequestAdapter()} and the request path suffix.
     */
    boolean supports(PlatformConfigService.RuntimeModel runtime, String suffix);

    /**
     * Process the request and produce a response. May throw
     * {@link IllegalArgumentException} for invalid inputs (caller maps to
     * {@code 400}) or {@link IOException}/{@link InterruptedException} for
     * upstream failures.
     */
    ResponseEntity<?> handle(HttpServletRequest request, String suffix, PlatformConfigService.RuntimeModel runtime) throws IOException, InterruptedException;

    /**
     * Lower numbers run first. Vendor-specific adapters should return a small
     * value (e.g. {@code 0}); the generic fallback returns a large value so
     * it only handles models nothing else claimed.
     */
    default int order() { return 0; }

    /** Diagnostic identifier used in logs and admin UI. */
    default String name() { return getClass().getSimpleName(); }
}