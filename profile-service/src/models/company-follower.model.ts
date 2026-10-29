import mongoose, { Schema } from "mongoose";

// One row per (company, follower); the unique index makes following idempotent.
const companyFollowerSchema = new Schema(
  {
    company_id: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    user_id: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);
companyFollowerSchema.index({ company_id: 1, user_id: 1 }, { unique: true });
companyFollowerSchema.index({ user_id: 1 });

const CompanyFollowerDocument =
  mongoose.models.CompanyFollower ?? mongoose.model("CompanyFollower", companyFollowerSchema);

export class CompanyFollowerModel {
  // Adds the follow; returns false when the user already followed.
  static async follow(companyId: string, userId: string): Promise<boolean> {
    const result = await CompanyFollowerDocument.updateOne(
      { company_id: companyId, user_id: userId },
      { $setOnInsert: { company_id: companyId, user_id: userId } },
      { upsert: true },
    );
    return result.upsertedCount > 0;
  }

  // Removes the follow; returns false when the user was not following.
  static async unfollow(companyId: string, userId: string): Promise<boolean> {
    const result = await CompanyFollowerDocument.deleteOne({ company_id: companyId, user_id: userId });
    return result.deletedCount > 0;
  }

  static countFollowers(companyId: string): Promise<number> {
    return CompanyFollowerDocument.countDocuments({ company_id: companyId }).exec();
  }

  static async isFollowing(companyId: string, userId: string): Promise<boolean> {
    return (await CompanyFollowerDocument.exists({ company_id: companyId, user_id: userId })) !== null;
  }
}
