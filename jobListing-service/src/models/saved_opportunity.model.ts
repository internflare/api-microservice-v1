import { Schema, Types, model } from "mongoose";

export interface SavedOpportunityRecord {
  id: string;
  talent_id: string;
  opportunity_id: string;
  created_at: Date;
  // The joined listing; null if the opportunity was since deleted.
  opportunity: Record<string, unknown> | null;
}

interface SavedOpportunityDocument {
  talent_id: Types.ObjectId;
  opportunity_id: Types.ObjectId;
  created_at: Date;
}

const savedOpportunitySchema = new Schema<SavedOpportunityDocument>(
  {
    talent_id: { type: Schema.Types.ObjectId, required: true, index: true },
    opportunity_id: {
      type: Schema.Types.ObjectId,
      ref: "Opportunity",
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    collection: "saved_opportunities",
    versionKey: false,
  },
);

// A talent can save a given opportunity only once.
savedOpportunitySchema.index(
  { talent_id: 1, opportunity_id: 1 },
  { unique: true },
);

const SavedOpportunityModel = model(
  "SavedOpportunity",
  savedOpportunitySchema,
);

// Saves an opportunity for a talent; idempotent, reports whether a new row was created.
async function saveOpportunityForTalent(
  talentId: string,
  opportunityId: string,
): Promise<{ created: boolean }> {
  const result = await SavedOpportunityModel.updateOne(
    {
      talent_id: new Types.ObjectId(talentId),
      opportunity_id: new Types.ObjectId(opportunityId),
    },
    { $setOnInsert: { created_at: new Date() } },
    { upsert: true },
  ).exec();
  return { created: result.upsertedCount === 1 };
}

// Removes a saved opportunity; returns false when it was not saved.
async function removeSavedOpportunity(
  talentId: string,
  opportunityId: string,
): Promise<boolean> {
  const result = await SavedOpportunityModel.deleteOne({
    talent_id: new Types.ObjectId(talentId),
    opportunity_id: new Types.ObjectId(opportunityId),
  }).exec();
  return result.deletedCount === 1;
}

async function isOpportunitySavedByTalent(
  talentId: string,
  opportunityId: string,
): Promise<boolean> {
  const found = await SavedOpportunityModel.exists({
    talent_id: new Types.ObjectId(talentId),
    opportunity_id: new Types.ObjectId(opportunityId),
  }).exec();
  return found !== null;
}

// Just the saved listing ids, so the UI can mark bookmarks without loading every listing.
async function listSavedOpportunityIds(talentId: string): Promise<string[]> {
  const rows = await SavedOpportunityModel.find({
    talent_id: new Types.ObjectId(talentId),
  })
    .select({ opportunity_id: 1 })
    .lean()
    .exec();
  return rows.map((row) => String(row.opportunity_id));
}

// Lists a talent's saved opportunities, newest first, with each listing joined in.
async function listSavedOpportunitiesForTalent(
  talentId: string,
  page: number,
  pageSize: number,
): Promise<{ items: SavedOpportunityRecord[]; total: number }> {
  const talentObjectId = new Types.ObjectId(talentId);
  const [total, documents] = await Promise.all([
    SavedOpportunityModel.countDocuments({ talent_id: talentObjectId }).exec(),
    SavedOpportunityModel.aggregate<Record<string, any>>([
      { $match: { talent_id: talentObjectId } },
      { $sort: { created_at: -1, _id: 1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      {
        $lookup: {
          from: "opportunities",
          localField: "opportunity_id",
          foreignField: "_id",
          as: "opportunity",
        },
      },
      { $unwind: { path: "$opportunity", preserveNullAndEmptyArrays: true } },
    ]).exec(),
  ]);

  const items = documents.map((doc) => {
    const { _id: opportunityKey, ...opportunity } = doc.opportunity ?? {};
    return {
      id: String(doc._id),
      talent_id: String(doc.talent_id),
      opportunity_id: String(doc.opportunity_id),
      created_at: doc.created_at as Date,
      opportunity: doc.opportunity
        ? {
            id: String(opportunityKey),
            ...opportunity,
            company_id: opportunity.company_id ? String(opportunity.company_id) : null,
          }
        : null,
    };
  });
  return { items, total };
}

export {
  saveOpportunityForTalent,
  removeSavedOpportunity,
  isOpportunitySavedByTalent,
  listSavedOpportunityIds,
  listSavedOpportunitiesForTalent,
};
