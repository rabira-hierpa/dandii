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

describe("invitationCreateSchema — operator scope", () => {
  it("requires an operator for route-operator", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "dispatcher@example.com",
      role: "route-operator",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["operatorCode"]);
  });

  it("accepts route-operator with an operator", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "dispatcher@example.com",
      role: "route-operator",
      operatorCode: "ANBESSA",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an operator on a network-wide role", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "boss@example.com",
      role: "admin",
      operatorCode: "LRT",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown operator code", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "dispatcher@example.com",
      role: "route-operator",
      operatorCode: "ANBESA",
    });
    expect(parsed.success).toBe(false);
  });

  it("treats an explicit null operator as absent for network-wide roles", () => {
    const parsed = invitationCreateSchema.safeParse({
      email: "boss@example.com",
      role: "admin",
      operatorCode: null,
    });
    expect(parsed.success).toBe(true);
  });
});
