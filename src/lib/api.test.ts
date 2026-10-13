import { http, HttpResponse } from "msw";
import { z } from "zod";
import { setScenario } from "@/lib/devScenario";
import { server } from "@/test/msw";
import { ApiError, api, configureApi } from "./api";
import { PublicConfigSchema } from "./schemas";

const okBody = (data: unknown) => ({ ok: true, data, meta: { requestId: "r1" } });

describe("api", () => {
  afterEach(() => configureApi({ tokenProvider: async () => null }));

  it("parses the ok envelope and validates against a schema", async () => {
    const { data, meta } = await api.get("/config/public", { schema: PublicConfigSchema, anonymous: true });
    expect(data.radiusOptionsKm).toEqual([5, 10, 15, 25]);
    expect(meta.requestId).toBe("mock-1");
  });

  it("throws a typed ApiError from the error envelope", async () => {
    server.use(
      http.get("*/api/thing", () =>
        HttpResponse.json(
          { ok: false, error: { code: "NOT_FOUND", message: "nope" }, meta: { requestId: "r2" } },
          { status: 404 },
        ),
      ),
    );
    const e = await api.get("/thing").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: "NOT_FOUND", status: 404, requestId: "r2" });
  });

  it("retries a failing GET twice, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/flaky", () => {
        calls++;
        return calls < 3
          ? HttpResponse.json({ ok: false, error: { code: "UPSTREAM_FAILED", message: "x" }, meta: { requestId: "r" } }, { status: 502 })
          : HttpResponse.json(okBody({ n: 1 }));
      }),
    );
    const { data } = await api.get<{ n: number }>("/flaky");
    expect(data.n).toBe(1);
    expect(calls).toBe(3);
  });

  it("gives up after three GET attempts", async () => {
    let calls = 0;
    server.use(http.get("*/api/down", () => { calls++; return HttpResponse.error(); }));
    await expect(api.get("/down")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(calls).toBe(3);
  });

  it("does not retry 4xx GETs", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/forbidden", () => {
        calls++;
        return HttpResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "no" }, meta: { requestId: "r" } }, { status: 403 });
      }),
    );
    await expect(api.get("/forbidden")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toBe(1);
  });

  it("never retries writes", async () => {
    let calls = 0;
    server.use(http.post("*/api/bookings", () => { calls++; return HttpResponse.error(); }));
    await expect(api.post("/bookings", {})).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(calls).toBe(1);
  });

  it("sends the Idempotency-Key and bearer token", async () => {
    configureApi({ tokenProvider: async () => "tok-123" });
    let seen: Headers | null = null;
    server.use(http.post("*/api/bookings", ({ request }) => { seen = request.headers; return HttpResponse.json(okBody({ id: "b1" })); }));
    await api.post("/bookings", { a: 1 }, { idempotencyKey: "key-1" });
    expect(seen!.get("Idempotency-Key")).toBe("key-1");
    expect(seen!.get("Authorization")).toBe("Bearer tok-123");
  });

  it("omits the token on anonymous calls", async () => {
    configureApi({ tokenProvider: async () => "tok-123" });
    let auth: string | null = "unset";
    server.use(http.get("*/api/public", ({ request }) => { auth = request.headers.get("Authorization"); return HttpResponse.json(okBody({})); }));
    await api.get("/public", { anonymous: true });
    expect(auth).toBeNull();
  });

  it("reads Retry-After on rate limiting", async () => {
    server.use(
      http.get("*/api/limited", () =>
        HttpResponse.json({ ok: false, error: { code: "RATE_LIMITED", message: "slow down" }, meta: { requestId: "r" } }, { status: 429, headers: { "Retry-After": "30" } }),
      ),
    );
    await expect(api.get("/limited")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfter: 30 });
  });

  it("flags responses that break the schema as CONTRACT_MISMATCH", async () => {
    server.use(http.get("*/api/shape", () => HttpResponse.json(okBody({ n: "not a number" }))));
    await expect(api.get("/shape", { schema: z.object({ n: z.number() }) })).rejects.toMatchObject({
      code: "CONTRACT_MISMATCH",
    });
  });

  it("fails fast in the dev offline scenario", async () => {
    setScenario("offline");
    await expect(api.get("/config/public")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
