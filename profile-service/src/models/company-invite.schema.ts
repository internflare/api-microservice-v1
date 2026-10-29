import mongoose, { Schema } from "mongoose";

// Email-based team invitation. Only the SHA-256 hash of the emailed token is stored.
const companyInviteSchema = new Schema(
  {
    company_id: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    workspace_role: { type: String, enum: ["ADMIN", "MEMBER"], required: true },
    token_hash: { type: String, required: true, unique: true },
    status: { type: String, enum: ["PENDING", "ACCEPTED", "REVOKED"], default: "PENDING" },
    invited_by: { type: String, required: true },
    expires_at: { type: Date, required: true },
    accepted_by: { type: String, default: null },
    accepted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
companyInviteSchema.index({ company_id: 1, email: 1, status: 1 });

export const CompanyInviteDocument =
  mongoose.models.CompanyInvite ?? mongoose.model("CompanyInvite", companyInviteSchema);
