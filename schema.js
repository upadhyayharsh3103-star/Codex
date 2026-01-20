const { pgTable, text, integer, timestamp, boolean, jsonb, index, real } = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  sizeBytes: integer('size_bytes').default(0),
  isActive: boolean('is_active').default(false),
  metadata: jsonb('metadata'),
  storageTier: text('storage_tier').default('hot'),
  lastAccessedAt: timestamp('last_accessed_at').defaultNow(),
  accessCount: integer('access_count').default(0),
}, (table) => ({
  nameIdx: index('profiles_name_idx').on(table.name),
  storageIdx: index('profiles_storage_tier_idx').on(table.storageTier),
  lastAccessIdx: index('profiles_last_access_idx').on(table.lastAccessedAt),
}));

const snapshots = pgTable('snapshots', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  filePath: text('file_path').notNull(),
  objectStorageKey: text('object_storage_key'),
  sizeBytes: integer('size_bytes').default(0),
  compressedSize: integer('compressed_size'),
  encrypted: boolean('encrypted').default(true),
  compressionAlgorithm: text('compression_algorithm').default('gzip'),
  deduplicationHash: text('deduplication_hash'),
  storageTier: text('storage_tier').default('warm'),
  metadata: jsonb('metadata'),
  lastAccessedAt: timestamp('last_accessed_at').defaultNow(),
  accessCount: integer('access_count').default(0),
}, (table) => ({
  profileIdx: index('snapshots_profile_idx').on(table.profileId),
  dedupIdx: index('snapshots_dedup_idx').on(table.deduplicationHash),
  storageIdx: index('snapshots_storage_tier_idx').on(table.storageTier),
}));

const oauthCredentials = pgTable('oauth_credentials', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  email: text('email'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  profileProviderIdx: index('oauth_profile_provider_idx').on(table.profileId, table.provider),
}));

const storageMetrics = pgTable('storage_metrics', {
  id: text('id').primaryKey(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  totalProfiles: integer('total_profiles').default(0),
  totalSnapshots: integer('total_snapshots').default(0),
  totalSizeBytes: integer('total_size_bytes').default(0),
  compressedSizeBytes: integer('compressed_size_bytes').default(0),
  hotStorageBytes: integer('hot_storage_bytes').default(0),
  warmStorageBytes: integer('warm_storage_bytes').default(0),
  coldStorageBytes: integer('cold_storage_bytes').default(0),
  cacheHitRate: real('cache_hit_rate').default(0),
  avgAccessTime: real('avg_access_time').default(0),
  deduplicationSavings: integer('deduplication_savings').default(0),
  metadata: jsonb('metadata'),
});

const storageBackups = pgTable('storage_backups', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  status: text('status').default('pending'),
  sizeBytes: integer('size_bytes').default(0),
  itemsBackedUp: integer('items_backed_up').default(0),
  filePath: text('file_path'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
}, (table) => ({
  statusIdx: index('backups_status_idx').on(table.status),
  typeIdx: index('backups_type_idx').on(table.type),
}));

const storageQuotas = pgTable('storage_quotas', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  quotaType: text('quota_type').notNull(),
  limitValue: integer('limit_value').notNull(),
  currentValue: integer('current_value').default(0),
  warningThreshold: real('warning_threshold').default(0.8),
  isExceeded: boolean('is_exceeded').default(false),
  lastCheckedAt: timestamp('last_checked_at').defaultNow(),
  metadata: jsonb('metadata'),
});

const cacheEntries = pgTable('cache_entries', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at'),
  hitCount: integer('hit_count').default(0),
  lastAccessedAt: timestamp('last_accessed_at').defaultNow(),
  sizeBytes: integer('size_bytes').default(0),
  metadata: jsonb('metadata'),
}, (table) => ({
  expiresIdx: index('cache_expires_idx').on(table.expiresAt),
}));

const profilesRelations = relations(profiles, ({ many }) => ({
  snapshots: many(snapshots),
  oauthCredentials: many(oauthCredentials),
}));

const snapshotsRelations = relations(snapshots, ({ one }) => ({
  profile: one(profiles, {
    fields: [snapshots.profileId],
    references: [profiles.id],
  }),
}));

const oauthCredentialsRelations = relations(oauthCredentials, ({ one }) => ({
  profile: one(profiles, {
    fields: [oauthCredentials.profileId],
    references: [profiles.id],
  }),
}));

module.exports = {
  profiles,
  snapshots,
  oauthCredentials,
  storageMetrics,
  storageBackups,
  storageQuotas,
  cacheEntries,
  profilesRelations,
  snapshotsRelations,
  oauthCredentialsRelations,
};
