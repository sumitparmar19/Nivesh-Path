// Tests for src/lib/dbUrl.js: on AWS the RDS password arrives on its own and must be percent-encoded into the URL;
// everywhere else (DATABASE_URL already set) nothing may change.
const { composeDatabaseUrl, applyDatabaseUrl } = require("../src/lib/dbUrl");

describe("DATABASE_URL from DB_* (AWS demo)", () => {
  test("an existing DATABASE_URL is left alone", () => {
    const env = { DATABASE_URL: "postgresql://a:b@neon/db", DB_HOST: "rds", DB_USER: "u", DB_PASSWORD: "p" };
    expect(composeDatabaseUrl(env)).toBeNull();
    expect(applyDatabaseUrl(env)).toBe(false);
    expect(env.DATABASE_URL).toBe("postgresql://a:b@neon/db");
    expect(env.DIRECT_URL).toBeUndefined();
  });

  test("nothing is set when a part is missing", () => {
    expect(composeDatabaseUrl({ DB_HOST: "rds", DB_USER: "u" })).toBeNull();
    const env = {};
    expect(applyDatabaseUrl(env)).toBe(false);
    expect(env).toEqual({});
  });

  test("special characters in the password are percent-encoded and survive a round trip", () => {
    const password = "p:a/s?s#w%o@r&d=1 x";
    const env = { DB_HOST: "nivesh-demo.abc.us-east-1.rds.amazonaws.com", DB_USER: "nivesh", DB_PASSWORD: password };
    expect(applyDatabaseUrl(env)).toBe(true);
    const url = new URL(env.DATABASE_URL);
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("nivesh-demo.abc.us-east-1.rds.amazonaws.com");
    expect(url.port).toBe("5432");
    expect(url.pathname).toBe("/nivesh");
    expect(decodeURIComponent(url.username)).toBe("nivesh");
    expect(decodeURIComponent(url.password)).toBe(password);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(env.DIRECT_URL).toBe(env.DATABASE_URL);
  });

  test("DB_PORT and DB_NAME are honoured, and an existing DIRECT_URL is kept", () => {
    const env = { DB_HOST: "h", DB_USER: "u", DB_PASSWORD: "p", DB_PORT: "6543", DB_NAME: "ledger", DIRECT_URL: "postgresql://direct" };
    applyDatabaseUrl(env);
    expect(env.DATABASE_URL).toBe("postgresql://u:p@h:6543/ledger?sslmode=require");
    expect(env.DIRECT_URL).toBe("postgresql://direct");
  });
});
