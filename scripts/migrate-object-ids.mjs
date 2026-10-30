// One-off, idempotent migration: converts string foreign-key ids to MongoDB ObjectIds.
// Usage (from backend/):  node --env-file=.env scripts/migrate-object-ids.mjs [--dry-run]
// Needs MONGODB_URI (and optionally MONGODB_DB_NAME). Resolves `mongodb` from jobListing-service.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.resolve(process.cwd(), "jobListing-service", "package.json"));
const { MongoClient, ObjectId } = require("mongodb");

const DRY_RUN = process.argv.includes("--dry-run");
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

// collection -> string fields that reference another collection.
const TARGETS = {
  talentprofiles: ["user_id"],
  companies: ["created_by"],
  companymembers: ["user_id"],
  companyverifications: ["reviewer_id"],
  auditlogs: ["actor_id", "entity_id"],
  companyinvites: ["invited_by", "accepted_by"],
  companyfollowers: ["user_id"],
  opportunities: ["created_by"],
  opportunity_views: ["user_id"],
  assessment_attempts: ["user_id"],
  notifications: ["user_id"],
};

async function migrateField(collection, field) {
  const stats = { converted: 0, skippedInvalid: 0, duplicates: 0 };
  const cursor = collection.find({ [field]: { $type: "string" } }, { projection: { [field]: 1 } });
  for await (const doc of cursor) {
    const value = doc[field];
    if (!OBJECT_ID_PATTERN.test(value)) {
      stats.skippedInvalid += 1;
      continue;
    }
    if (DRY_RUN) {
      stats.converted += 1;
      continue;
    }
    try {
      await collection.updateOne({ _id: doc._id }, { $set: { [field]: new ObjectId(value) } });
      stats.converted += 1;
    } catch (error) {
      // A converted twin already exists under a unique index; leave the string row for manual review.
      if (error?.code === 11000) stats.duplicates += 1;
      else throw error;
    }
  }
  return stats;
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || undefined);
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  console.log(DRY_RUN ? "DRY RUN - no writes" : "Migrating string ids to ObjectId");

  for (const [name, fields] of Object.entries(TARGETS)) {
    if (!existing.has(name)) {
      console.log(`- ${name}: collection not found, skipped`);
      continue;
    }
    for (const field of fields) {
      const stats = await migrateField(db.collection(name), field);
      console.log(`- ${name}.${field}:`, stats);
    }
  }
} finally {
  await client.close();
}
