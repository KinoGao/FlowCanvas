import { describe, expect, it } from "vitest";

import { isAgnesImageModel, requestedImageResponseFormat } from "./image";

describe("image response_format compatibility", () => {
    it("recognizes Agnes image and t2i model names", () => {
        expect(isAgnesImageModel("agnes-image-v1")).toBe(true);
        expect(isAgnesImageModel("openai/agnes-t2i-general-model")).toBe(true);
    });

    it("never sends response_format to Agnes models", () => {
        expect(requestedImageResponseFormat({ imageResponseFormat: "auto" }, "agnes-t2i-general-model")).toBeUndefined();
        expect(requestedImageResponseFormat({ imageResponseFormat: "url" }, "agnes-t2i-general-model")).toBeUndefined();
        expect(requestedImageResponseFormat({ imageResponseFormat: "b64_json" }, "agnes-t2i-general-model")).toBeUndefined();
    });

    it("treats url policy as omitting the optional parameter", () => {
        expect(requestedImageResponseFormat({ imageResponseFormat: "url" }, "custom-image-model")).toBeUndefined();
        expect(requestedImageResponseFormat({ imageResponseFormat: "auto" }, "gpt-image-1")).toBe("b64_json");
    });
});
