import { describe, expect, it } from "vitest";
import { readSessionOptions } from "@/app/api/session/route";

describe("session options", () => {
  it("keeps a header-only legacy request on the default profile", async () => {
    const request = new Request("https://close.example/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    await expect(readSessionOptions(request)).resolves.toEqual({});
  });

  it("accepts a versioned profile and clone name", async () => {
    const request = new Request("https://close.example/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: "morrow-food-v1", brandName: "MORROW EXPORT" }),
    });
    await expect(readSessionOptions(request)).resolves.toEqual({
      templateId: "morrow-food-v1",
      brandName: "MORROW EXPORT",
    });
  });

  it("rejects unknown profile options", async () => {
    const request = new Request("https://close.example/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin: true }),
    });
    await expect(readSessionOptions(request)).rejects.toBeDefined();
  });
});
