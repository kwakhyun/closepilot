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

  it("accepts only the explicit completed showcase mode", async () => {
    const request = new Request("https://close.example/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showcase: "completed" }),
    });
    await expect(readSessionOptions(request)).resolves.toEqual({ showcase: "completed" });
  });

  it("rejects unknown profile options", async () => {
    const request = new Request("https://close.example/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin: true }),
    });
    await expect(readSessionOptions(request)).rejects.toBeDefined();
  });
  it.each([
    { cloneCurrent: true },
    { cloneCurrent: true, brandName: "COPY" },
    { cloneCurrent: true, brandName: "COPY", expectedVersion: 1, templateId: "morrow-food-v1" },
    { cloneCurrent: true, brandName: "COPY", expectedVersion: 1, showcase: "completed" },
    { expectedVersion: 1 },
    { profile: { mappings: {} } },
  ])("rejects incomplete or caller-supplied clone configuration: %j", async (body) => {
    await expect(
      readSessionOptions(
        new Request("https://close.example/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    ).rejects.toBeDefined();
  });
  it("accepts a clone of the authenticated current workspace at a specific version", async () => {
    const body = { cloneCurrent: true, brandName: "COPY", expectedVersion: 2 };
    await expect(
      readSessionOptions(
        new Request("https://close.example/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    ).resolves.toEqual(body);
  });
});
