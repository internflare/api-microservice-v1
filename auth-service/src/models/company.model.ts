import { database } from "../auth.js";
import type {
  Company,
  CompanyMember,
  CompanyMemberRole,
  CompanyVerification,
} from "../types/company.types.js";
import type {
  AdminVerificationDecisionInput,
  CreateCompanyInput,
  SubmitVerificationInput,
  UpdateCompanyInput,
} from "../validators/company.validator.js";

export class CompanyModel {
  /**
   * Creates a new company and assigns the creator as the initial ACTIVE ADMIN member
   * atomically within a single database transaction (PRD §4.2, Journey step 33).
   */
  static async createCompanyWithAdmin(
    input: CreateCompanyInput,
    userId: string,
    clientIp?: string,
  ): Promise<{ company: Company; member: CompanyMember }> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      // 1. Insert company record
      const insertCompanyQuery = `
        INSERT INTO companies (
          name, website, country, industry, registration_number, logo_url, verification_status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'UNVERIFIED', $7)
        RETURNING *;
      `;
      const { rows: companyRows } = await client.query<Company>(
        insertCompanyQuery,
        [
          input.name,
          input.website ?? null,
          input.country ?? null,
          input.industry ?? null,
          input.registration_number ?? null,
          input.logo_url ?? null,
          userId,
        ],
      );
      const company = companyRows[0];

      // 2. Insert creator as initial ACTIVE ADMIN member
      const insertMemberQuery = `
        INSERT INTO company_members (
          company_id, user_id, workspace_role, status, joined_at
        ) VALUES ($1, $2, 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP)
        RETURNING *;
      `;
      const { rows: memberRows } = await client.query<CompanyMember>(
        insertMemberQuery,
        [company.id, userId],
      );
      const member = memberRows[0];

      // 3. Record immutable audit log
      const insertAuditQuery = `
        INSERT INTO audit_logs (
          actor_id, action, entity_type, entity_id, metadata, ip_address
        ) VALUES ($1, 'COMPANY_CREATED', 'company', $2, $3, $4);
      `;
      await client.query(insertAuditQuery, [
        userId,
        company.id,
        JSON.stringify({
          company_name: company.name,
          creator_role: "ADMIN",
        }),
        clientIp ?? null,
      ]);

      await client.query("COMMIT");
      return { company, member };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves an active company by its UUID.
   */
  static async findCompanyById(companyId: string): Promise<Company | null> {
    const query = `
      SELECT * FROM companies 
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    const { rows } = await database.query<Company>(query, [companyId]);
    return rows[0] ?? null;
  }

  /**
   * Updates company profile fields dynamically with strict parameterization.
   */
  static async updateCompany(
    companyId: string,
    input: UpdateCompanyInput,
    userId: string,
    clientIp?: string,
  ): Promise<Company | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.website !== undefined) {
      fields.push(`website = $${paramIndex++}`);
      values.push(input.website);
    }
    if (input.country !== undefined) {
      fields.push(`country = $${paramIndex++}`);
      values.push(input.country);
    }
    if (input.industry !== undefined) {
      fields.push(`industry = $${paramIndex++}`);
      values.push(input.industry);
    }
    if (input.registration_number !== undefined) {
      fields.push(`registration_number = $${paramIndex++}`);
      values.push(input.registration_number);
    }
    if (input.logo_url !== undefined) {
      fields.push(`logo_url = $${paramIndex++}`);
      values.push(input.logo_url);
    }

    if (fields.length === 0) {
      return this.findCompanyById(companyId);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(companyId);

    const client = await database.connect();
    try {
      await client.query("BEGIN");

      const updateQuery = `
        UPDATE companies
        SET ${fields.join(", ")}
        WHERE id = $${paramIndex} AND deleted_at IS NULL
        RETURNING *;
      `;
      const { rows } = await client.query<Company>(updateQuery, values);
      const updated = rows[0] ?? null;

      if (updated) {
        // Record audit event
        await client.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, 'COMPANY_UPDATED', 'company', $2, $3, $4);`,
          [
            userId,
            companyId,
            JSON.stringify({ updated_fields: Object.keys(input) }),
            clientIp ?? null,
          ],
        );
      }

      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a member record by company ID and user ID.
   */
  static async findMember(
    companyId: string,
    userId: string,
  ): Promise<CompanyMember | null> {
    const query = `
      SELECT * FROM company_members
      WHERE company_id = $1 AND user_id = $2;
    `;
    const { rows } = await database.query<CompanyMember>(query, [
      companyId,
      userId,
    ]);
    return rows[0] ?? null;
  }

  /**
   * Retrieves a member record by company ID and member record ID.
   */
  static async findMemberById(
    companyId: string,
    memberId: string,
  ): Promise<CompanyMember | null> {
    const query = `
      SELECT * FROM company_members
      WHERE company_id = $1 AND id = $2;
    `;
    const { rows } = await database.query<CompanyMember>(query, [
      companyId,
      memberId,
    ]);
    return rows[0] ?? null;
  }

  /**
   * Lists all members for a company.
   */
  static async listMembers(companyId: string): Promise<CompanyMember[]> {
    const query = `
      SELECT id, company_id, user_id, workspace_role, status, joined_at, removed_at, created_at, updated_at
      FROM company_members
      WHERE company_id = $1
      ORDER BY created_at ASC;
    `;
    const { rows } = await database.query<CompanyMember>(query, [companyId]);
    return rows;
  }

  /**
   * Invites a user to a company with a designated workspace role.
   * If a previous membership existed in REMOVED state, restores to INVITED.
   */
  static async inviteMember(
    companyId: string,
    invitedUserId: string,
    role: CompanyMemberRole,
    actorId: string,
    clientIp?: string,
  ): Promise<CompanyMember> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      // Check for existing membership
      const { rows: existingRows } = await client.query<CompanyMember>(
        "SELECT * FROM company_members WHERE company_id = $1 AND user_id = $2;",
        [companyId, invitedUserId],
      );
      const existing = existingRows[0];

      let member: CompanyMember;

      if (existing) {
        if (existing.status === "ACTIVE") {
          throw new Error("User is already an active member of this company");
        }
        if (existing.status === "INVITED") {
          throw new Error("User already has a pending invitation to this company");
        }

        // Previous status was REMOVED; re-invite user
        const updateQuery = `
          UPDATE company_members
          SET status = 'INVITED', workspace_role = $1, removed_at = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *;
        `;
        const { rows } = await client.query<CompanyMember>(updateQuery, [
          role,
          existing.id,
        ]);
        member = rows[0];
      } else {
        // Fresh invitation
        const insertQuery = `
          INSERT INTO company_members (
            company_id, user_id, workspace_role, status
          ) VALUES ($1, $2, $3, 'INVITED')
          RETURNING *;
        `;
        const { rows } = await client.query<CompanyMember>(insertQuery, [
          companyId,
          invitedUserId,
          role,
        ]);
        member = rows[0];
      }

      // Record audit event
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
         VALUES ($1, 'MEMBER_INVITED', 'company_member', $2, $3, $4);`,
        [
          actorId,
          member.id,
          JSON.stringify({
            company_id: companyId,
            invited_user_id: invitedUserId,
            assigned_role: role,
          }),
          clientIp ?? null,
        ],
      );

      await client.query("COMMIT");
      return member;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Accepts a pending invitation for the authenticated user, transitioning status to ACTIVE.
   */
  static async acceptInvite(
    companyId: string,
    userId: string,
    clientIp?: string,
  ): Promise<CompanyMember | null> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      const updateQuery = `
        UPDATE company_members
        SET status = 'ACTIVE', joined_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE company_id = $1 AND user_id = $2 AND status = 'INVITED'
        RETURNING *;
      `;
      const { rows } = await client.query<CompanyMember>(updateQuery, [
        companyId,
        userId,
      ]);
      const member = rows[0] ?? null;

      if (member) {
        await client.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
           VALUES ($1, 'MEMBER_ACCEPTED', 'company_member', $2, $3, $4);`,
          [
            userId,
            member.id,
            JSON.stringify({ company_id: companyId, role: member.workspace_role }),
            clientIp ?? null,
          ],
        );
      }

      await client.query("COMMIT");
      return member;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Soft-removes a member from a company by updating status to REMOVED and setting removed_at.
   * Zero hard deletes (PRD §14).
   */
  static async softRemoveMember(
    companyId: string,
    memberId: string,
    actorId: string,
    clientIp?: string,
  ): Promise<CompanyMember | null> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      // Verify member exists and is not already removed
      const { rows: memberRows } = await client.query<CompanyMember>(
        "SELECT * FROM company_members WHERE company_id = $1 AND id = $2;",
        [companyId, memberId],
      );
      const targetMember = memberRows[0];

      if (!targetMember) {
        await client.query("ROLLBACK");
        return null;
      }

      if (targetMember.status === "REMOVED") {
        await client.query("ROLLBACK");
        return targetMember;
      }

      // Guard: Ensure we do not remove the sole remaining ACTIVE ADMIN
      if (
        targetMember.workspace_role === "ADMIN" &&
        targetMember.status === "ACTIVE"
      ) {
        const { rows: adminCountRows } = await client.query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM company_members WHERE company_id = $1 AND workspace_role = 'ADMIN' AND status = 'ACTIVE';",
          [companyId],
        );
        const adminCount = Number.parseInt(adminCountRows[0].count, 10);
        if (adminCount <= 1) {
          throw new Error("Cannot remove the sole active administrator of a company");
        }
      }

      // Soft removal
      const updateQuery = `
        UPDATE company_members
        SET status = 'REMOVED', removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
      `;
      const { rows } = await client.query<CompanyMember>(updateQuery, [
        memberId,
      ]);
      const updatedMember = rows[0];

      // Record audit event
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
         VALUES ($1, 'MEMBER_REMOVED', 'company_member', $2, $3, $4);`,
        [
          actorId,
          memberId,
          JSON.stringify({
            company_id: companyId,
            removed_user_id: targetMember.user_id,
            previous_role: targetMember.workspace_role,
          }),
          clientIp ?? null,
        ],
      );

      await client.query("COMMIT");
      return updatedMember;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submits company verification documents and transitions company status to PENDING_REVIEW (PRD §4.2).
   */
  static async submitVerification(
    companyId: string,
    input: SubmitVerificationInput,
    userId: string,
    clientIp?: string,
  ): Promise<CompanyVerification> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      // Verify company exists
      const { rows: companyRows } = await client.query<Company>(
        "SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL;",
        [companyId],
      );
      const company = companyRows[0];
      if (!company) {
        throw new Error("Company not found");
      }

      // 1. Insert verification submission
      const insertVerificationQuery = `
        INSERT INTO company_verifications (
          company_id, status, documents
        ) VALUES ($1, 'PENDING_REVIEW', $2)
        RETURNING *;
      `;
      const { rows: verificationRows } = await client.query<CompanyVerification>(
        insertVerificationQuery,
        [companyId, JSON.stringify(input.documents)],
      );
      const verification = verificationRows[0];

      // 2. Update company verification_status and registration_number if supplied
      if (input.registration_number) {
        await client.query(
          `UPDATE companies 
           SET verification_status = 'PENDING_REVIEW', registration_number = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2;`,
          [input.registration_number, companyId],
        );
      } else {
        await client.query(
          `UPDATE companies 
           SET verification_status = 'PENDING_REVIEW', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1;`,
          [companyId],
        );
      }

      // 3. Emit immutable audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
         VALUES ($1, 'VERIFICATION_SUBMITTED', 'company_verification', $2, $3, $4);`,
        [
          userId,
          verification.id,
          JSON.stringify({
            company_id: companyId,
            documents_count: input.documents.length,
            registration_number: input.registration_number ?? company.registration_number,
          }),
          clientIp ?? null,
        ],
      );

      await client.query("COMMIT");
      return verification;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all verification submissions for a specific company, sorted newest first.
   */
  static async listCompanyVerifications(
    companyId: string,
  ): Promise<CompanyVerification[]> {
    const query = `
      SELECT * FROM company_verifications
      WHERE company_id = $1
      ORDER BY created_at DESC;
    `;
    const { rows } = await database.query<CompanyVerification>(query, [companyId]);
    return rows;
  }

  /**
   * Retrieves a single verification record by its ID.
   */
  static async findVerificationById(
    verificationId: string,
  ): Promise<CompanyVerification | null> {
    const query = `
      SELECT * FROM company_verifications
      WHERE id = $1;
    `;
    const { rows } = await database.query<CompanyVerification>(query, [verificationId]);
    return rows[0] ?? null;
  }

  /**
   * Lists all pending verification requests across all companies for platform administrators.
   */
  static async listPendingVerifications(): Promise<
    (CompanyVerification & { company_name: string; company_country?: string | null })[]
  > {
    const query = `
      SELECT 
        v.*,
        c.name AS company_name,
        c.country AS company_country
      FROM company_verifications v
      JOIN companies c ON c.id = v.company_id
      WHERE v.status = 'PENDING_REVIEW'
      ORDER BY v.created_at ASC;
    `;
    const { rows } = await database.query<
      CompanyVerification & { company_name: string; company_country?: string | null }
    >(query);
    return rows;
  }

  /**
   * Decides a verification submission (APPROVED or REJECTED) with audit trail and company status update (PRD §4.2).
   */
  static async decideVerification(
    verificationId: string,
    input: AdminVerificationDecisionInput,
    adminUserId: string,
    clientIp?: string,
  ): Promise<{ verification: CompanyVerification; company: Company }> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      // Lock and fetch target verification record
      const { rows: vRows } = await client.query<CompanyVerification>(
        "SELECT * FROM company_verifications WHERE id = $1 FOR UPDATE;",
        [verificationId],
      );
      const targetVerification = vRows[0];

      if (!targetVerification) {
        throw new Error("Verification record not found");
      }

      if (targetVerification.status !== "PENDING_REVIEW") {
        throw new Error(
          `Verification has already been decided: current status is ${targetVerification.status}`,
        );
      }

      // 1. Update verification record
      const updateVerificationQuery = `
        UPDATE company_verifications
        SET status = $1, reviewer_id = $2, review_notes = $3, decided_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *;
      `;
      const { rows: updatedVRows } = await client.query<CompanyVerification>(
        updateVerificationQuery,
        [input.status, adminUserId, input.review_notes ?? null, verificationId],
      );
      const updatedVerification = updatedVRows[0];

      // 2. Update company verification_status (APPROVED -> VERIFIED, REJECTED -> REJECTED)
      const targetCompanyStatus = input.status === "APPROVED" ? "VERIFIED" : "REJECTED";
      const updateCompanyQuery = `
        UPDATE companies
        SET verification_status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
      const { rows: updatedCRows } = await client.query<Company>(
        updateCompanyQuery,
        [targetCompanyStatus, targetVerification.company_id],
      );
      const updatedCompany = updatedCRows[0];

      // 3. Emit immutable audit log
      const auditAction = input.status === "APPROVED" ? "COMPANY_VERIFIED" : "COMPANY_REJECTED";
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
         VALUES ($1, $2, 'company_verification', $3, $4, $5);`,
        [
          adminUserId,
          auditAction,
          verificationId,
          JSON.stringify({
            company_id: targetVerification.company_id,
            decision: input.status,
            review_notes: input.review_notes ?? null,
          }),
          clientIp ?? null,
        ],
      );

      await client.query("COMMIT");
      return { verification: updatedVerification, company: updatedCompany };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
