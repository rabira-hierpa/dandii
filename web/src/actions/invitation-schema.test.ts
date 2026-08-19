import { describe, expect, it } from "vitest";
import { invitationCreateSchema, invitationTokenSchema } from "./invitation-schema";

describe("invitationCreateSchema", () => {
  it("accepts a valid email and role", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "new-admin@example.com",
      role: "maintainer",
    });
    expect(parsed.success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const parsed = invitationCreateSchema.parse({
      email: "  Admin@Example.com  ",
      role: "admin",
    });
    expect(parsed.email).toBe("admin@example.com");
  });

  it("rejects an invalid email", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "not-an-email",
      role: "admin",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a role outside the known set", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "someone@example.com",
      role: "superuser",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("invitationTokenSchema", () => {
  it("rejects an empty token", () => {
    const parsed = invitationTokenSchema.safeParse({ token: "" });
    expect(parsed.success).toBe(false);
  });

  it("accepts a non-empty token", () => {
    const parsed = invitationTokenSchema.safeParse({ token: "abc123" });
    expect(parsed.success).toBe(true);
  });
});
