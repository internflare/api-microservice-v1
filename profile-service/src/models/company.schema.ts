import mongoose, { Schema } from "mongoose";

// Foreign-key fields stored as ObjectId but exposed as strings in API responses.
export const OBJECT_ID_FIELDS = ["company_id", "user_id", "created_by", "reviewer_id", "actor_id", "entity_id"] as const;

export function stringifyObjectIds(value: Record<string, unknown>): void {
  for (const key of OBJECT_ID_FIELDS) {
    if (value[key] != null) value[key] = String(value[key]);
  }
}

const transformId = (_doc: unknown, value: Record<string, unknown>) => {
  value.id = String(value._id);
  delete value._id;
  delete value.__v;
  stringifyObjectIds(value);
  return value;
};

const jsonOptions = { toJSON: { transform: transformId }, toObject: { transform: transformId } };

const companySchema = new Schema(
  {
    name: { type: String, required: true },
    website: { type: String, default: null },
    country: { type: String, default: null },
    industry: { type: String, default: null },
    registration_number: { type: String, default: null },
    contact_email: { type: String, default: null },
    phone: { type: String, default: null },
    representative_name: { type: String, default: null },
    representative_title: { type: String, default: null },
    logo_url: { type: String, default: null },
    description: { type: String, default: null },
    culture: { type: String, default: null },
    verification_status: {
      type: String,
      enum: ["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"],
      default: "UNVERIFIED",
      required: true,
    },
    created_by: { type: Schema.Types.ObjectId, ref: "user", required: true },
    deleted_at: { type: Date, default: null },
  },
  { ...jsonOptions, timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

const companyMemberSchema = new Schema(
  {
    company_id: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    user_id: { type: Schema.Types.ObjectId, ref: "user", required: true },
    workspace_role: { type: String, enum: ["ADMIN", "MEMBER"], required: true },
    status: { type: String, enum: ["INVITED", "ACTIVE", "REMOVED"], required: true },
    joined_at: { type: Date, default: null },
    removed_at: { type: Date, default: null },
  },
  { ...jsonOptions, timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
companyMemberSchema.index({ company_id: 1, user_id: 1 }, { unique: true });

const verificationDocumentSchema = new Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    document_type: { type: String },
    uploaded_at: { type: String, required: true },
  },
  { _id: false },
);

const companyVerificationSchema = new Schema(
  {
    company_id: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    status: {
      type: String,
      enum: ["PENDING_REVIEW", "APPROVED", "REJECTED"],
      required: true,
    },
    reviewer_id: { type: Schema.Types.ObjectId, ref: "user", default: null },
    review_notes: { type: String, default: null },
    documents: { type: [verificationDocumentSchema], default: [] },
    decided_at: { type: Date, default: null },
  },
  { ...jsonOptions, timestamps: { createdAt: "created_at", updatedAt: false } },
);

const auditLogSchema = new Schema(
  {
    actor_id: { type: Schema.Types.ObjectId, ref: "user", required: true },
    action: {
      type: String,
      enum: [
        "COMPANY_CREATED", "COMPANY_UPDATED", "MEMBER_INVITED", "MEMBER_ACCEPTED",
        "MEMBER_ROLE_UPDATED", "MEMBER_REMOVED", "VERIFICATION_SUBMITTED",
        "COMPANY_VERIFIED", "COMPANY_REJECTED",
      ],
      required: true,
    },
    entity_type: { type: String, enum: ["company", "company_member", "company_verification"], required: true },
    entity_id: { type: Schema.Types.ObjectId, required: true },
    metadata: { type: Schema.Types.Mixed, default: null },
    ip_address: { type: String, default: null },
  },
  { ...jsonOptions, timestamps: { createdAt: "created_at", updatedAt: false } },
);

// Opportunity documents are owned by the jobs domain; this schema reads their shared fields.
const opportunitySchema = new Schema(
  { company_id: { type: Schema.Types.Mixed }, title: String, status: String, views_count: Number },
  { collection: "opportunities", strict: false, timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

export const CompanyDocument = mongoose.models.Company ?? mongoose.model("Company", companySchema);
export const CompanyMemberDocument = mongoose.models.CompanyMember ?? mongoose.model("CompanyMember", companyMemberSchema);
export const CompanyVerificationDocument = mongoose.models.CompanyVerification ?? mongoose.model("CompanyVerification", companyVerificationSchema);
export const AuditLogDocument = mongoose.models.AuditLog ?? mongoose.model("AuditLog", auditLogSchema);
export const OpportunityDocument = mongoose.models.Opportunity ?? mongoose.model("Opportunity", opportunitySchema);
