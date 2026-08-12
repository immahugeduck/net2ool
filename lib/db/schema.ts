import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

/* ---------------------------------------------------------------------------
 * Better Auth tables — column names must stay camelCase to match Better Auth
 * defaults. Do not rename these.
 * ------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

/* ---------------------------------------------------------------------------
 * net2ool app tables. Plain `userId` column for scoping, no FK constraints.
 * ------------------------------------------------------------------------- */

export const speedTest = pgTable("speed_test", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  /** wifi | cellular | ethernet | unknown */
  connectionType: text("connectionType").default("unknown").notNull(),
  downloadMbps: doublePrecision("downloadMbps").default(0).notNull(),
  uploadMbps: doublePrecision("uploadMbps").default(0).notNull(),
  latencyMs: doublePrecision("latencyMs").default(0).notNull(),
  jitterMs: doublePrecision("jitterMs").default(0).notNull(),
  packetLoss: doublePrecision("packetLoss").default(0).notNull(),
  downloadBytes: bigint("downloadBytes", { mode: "number" }).default(0).notNull(),
  uploadBytes: bigint("uploadBytes", { mode: "number" }).default(0).notNull(),
  downloadSeconds: integer("downloadSeconds").default(0).notNull(),
  uploadSeconds: integer("uploadSeconds").default(0).notNull(),
  /** Per-second throughput samples for the sparkline replay */
  downloadSamples: jsonb("downloadSamples").$type<number[]>(),
  uploadSamples: jsonb("uploadSamples").$type<number[]>(),
  publicIp: text("publicIp"),
  ispName: text("ispName"),
  asn: text("asn"),
  serverRegion: text("serverRegion"),
  /** navigator.connection.effectiveType when available */
  effectiveType: text("effectiveType"),
  /** Groups a WiFi run and a Cellular run into one A/B comparison */
  comparisonGroup: text("comparisonGroup"),
  label: text("label"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const usageSample = pgTable("usage_sample", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  /** Truncated to the top of the hour */
  bucketStart: timestamp("bucketStart").notNull(),
  rxBytes: bigint("rxBytes", { mode: "number" }).default(0).notNull(),
  txBytes: bigint("txBytes", { mode: "number" }).default(0).notNull(),
  connectionType: text("connectionType").default("unknown").notNull(),
  /** agent | app | manual */
  source: text("source").default("app").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

export const networkDevice = pgTable("network_device", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  macAddress: text("macAddress").notNull(),
  ipAddress: text("ipAddress"),
  hostname: text("hostname"),
  /** User-assigned friendly name */
  customName: text("customName"),
  vendor: text("vendor"),
  deviceType: text("deviceType").default("unknown").notNull(),
  openPorts: jsonb("openPorts").$type<number[]>(),
  isOnline: boolean("isOnline").default(true).notNull(),
  trusted: boolean("trusted").default(false).notNull(),
  /** agent | manual */
  source: text("source").default("manual").notNull(),
  notes: text("notes"),
  firstSeen: timestamp("firstSeen").defaultNow().notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
})

export const threatFinding = pgTable("threat_finding", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  /** camera_device | ble_camera | rogue_ap | weak_encryption | open_port | traffic_anomaly */
  category: text("category").notNull(),
  /** critical | high | medium | low | info */
  severity: text("severity").default("info").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  /** wifi_scan | ble_scan | lan_scan | analytics */
  sourceType: text("sourceType").default("analytics").notNull(),
  /** Stable dedupe key so repeat scans update instead of duplicating */
  identifier: text("identifier").notNull(),
  /** open | acknowledged | resolved | ignored */
  status: text("status").default("open").notNull(),
  firstSeen: timestamp("firstSeen").defaultNow().notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
})

export const agentKey = pgTable("agent_key", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").default("Android Agent").notNull(),
  /** HMAC-SHA256 of the raw key. The raw key is shown to the user exactly once. */
  keyHash: text("keyHash").notNull(),
  keyPrefix: text("keyPrefix").notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revoked: boolean("revoked").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const userSetting = pgTable("user_setting", {
  userId: text("userId").primaryKey(),
  downloadSeconds: integer("downloadSeconds").default(45).notNull(),
  uploadSeconds: integer("uploadSeconds").default(45).notNull(),
  parallelStreams: integer("parallelStreams").default(6).notNull(),
  dataCapGb: doublePrecision("dataCapGb"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

/**
 * Coordinates a genuinely simultaneous WiFi-vs-cellular run across two devices
 * signed into the same account. One device hosts and shares a short code; the
 * second joins with it. The server hands both devices a common `startAt` so
 * they begin measuring at the same instant, and a shared `comparisonGroup`
 * links the two resulting speed_test rows.
 */
export const pairingSession = pgTable("pairing_session", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  /** Short human-typed join code (unambiguous charset). */
  code: text("code").notNull(),
  /** waiting | ready | counting | running | complete | expired */
  status: text("status").default("waiting").notNull(),
  /** Connection the host device is on: wifi | cellular */
  hostRole: text("hostRole").default("wifi").notNull(),
  /** Connection the guest device is on: wifi | cellular */
  guestRole: text("guestRole"),
  guestJoined: boolean("guestJoined").default(false).notNull(),
  /** Synchronized start instant handed to both devices. */
  startAt: timestamp("startAt"),
  hostResultId: integer("hostResultId"),
  guestResultId: integer("guestResultId"),
  hostDone: boolean("hostDone").default(false).notNull(),
  guestDone: boolean("guestDone").default(false).notNull(),
  /** Links the two speed_test rows into one A/B comparison. */
  comparisonGroup: text("comparisonGroup").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
})

export type SpeedTest = typeof speedTest.$inferSelect
export type UsageSample = typeof usageSample.$inferSelect
export type NetworkDevice = typeof networkDevice.$inferSelect
export type ThreatFinding = typeof threatFinding.$inferSelect
export type AgentKey = typeof agentKey.$inferSelect
export type UserSetting = typeof userSetting.$inferSelect
export type PairingSession = typeof pairingSession.$inferSelect
