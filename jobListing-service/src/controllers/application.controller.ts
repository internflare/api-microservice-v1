import type { RequestHandler } from "express";
import {
  createApplication,
  findApplicationById,
  listAppliedOpportunityIds,
  listApplicationsForCompany,
  listApplicationsForTalent,
  updateApplication,
} from "../models/application.model.js";
import { getOpportunityById } from "../models/opportunity.model.js";
import {
  listInterviewsForApplication,
  listInterviewsForApplications,
} from "../models/interview.model.js";
import { checkEligibility } from "../services/eligibility.service.js";
import {
  computeMatch,
  isTalentEditable,
  loadApplicantProfiles,
  toEmployerApplication,
} from "../services/application.service.js";
import { publishJobApplication } from "../services/notification-publisher.service.js";
import { loadPublishedOpportunity } from "../services/opportunity-access.service.js";
import { AppError } from "../utils/appError.js";
import { forwardError } from "../utils/forward-error.js";
import {
  loadApplicationWithListing,
  parseApplicationId,
  requireListingAdmin,
} from "../services/application-access.service.js";
import { checkAdmin, findHiringContacts, findUserContact } from "../utils/helperFunc.js";
import { parseOrFail } from "../utils/parse-or-fail.js";
import { logger } from "../utils/logger.js";
import {
  CLOSED_STAGES,
  STAGE_TRANSITIONS,
  companyApplicationsQuerySchema,
  editApplicationSchema,
  submitApplicationSchema,
  updateApplicationSchema,
} from "../validators/application.validator.js";
import {
  formatValidationError,
  objectIdSchema,
  requireUserId,
} from "../validators/opportunity.validator.js";

// POST /:id/applications: an eligible talent applies. The applicant is the session user and
// the CV is taken from their profile, so neither can be spoofed through the body.
const submitApplicationHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const applicantEmail = request.user?.email;
    if (!applicantEmail) {
      throw new AppError("Your account has no email address", 400);
    }
    const body = parseOrFail(
      submitApplicationSchema.safeParse(request.body ?? {}),
      "Invalid application",
    );
    const opportunity = await loadPublishedOpportunity(request.params.id);
    if (opportunity.external_apply_url) {
      throw new AppError("This listing accepts applications on an external site", 400);
    }

    const eligibility = await checkEligibility(opportunity, userId);
    if (eligibility.state !== "eligible") {
      response.status(403).json({
        error: "You are not eligible to apply for this listing",
        eligibility,
      });
      return;
    }

    const profile = (await loadApplicantProfiles([userId])).get(userId) ?? null;
    const match = computeMatch(opportunity, eligibility, profile);
    const application = await createApplication({
      opportunityId: opportunity.id,
      talentId: userId,
      coverLetter: body.cover_letter || null,
      cvUrl: profile?.cv_url ?? null,
      matchScore: match.score,
      matchFactors: match.factors.length > 0 ? match.factors : null,
    });

    // Emailing the hiring contact is best effort; a failure must not undo the application.
    try {
      const contacts = await findHiringContacts(
        opportunity.company_id,
        opportunity.created_by,
      );
      if (contacts.length > 0) {
        await Promise.all(
          contacts.map((contact) =>
            publishJobApplication(
              opportunity,
              { name: request.user?.name ?? applicantEmail, email: applicantEmail },
              contact,
              { applicationId: application.id, coverLetter: body.cover_letter },
            ),
          ),
        );
      } else {
        logger("warn", `No contact found to notify for opportunity ${opportunity.id}`);
      }
    } catch (error) {
      logger("warn", `Application ${application.id} saved but notification failed: ${String(error)}`);
    }

    response.status(201).json({ application });
  } catch (error) {
    forwardError(error, next, "Failed to submit application:", "Could not submit application");
  }
};

// GET /applications/mine: the signed-in talent's applications with listing and company names.
const listMyApplicationsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const rows = await listApplicationsForTalent(userId);
    const interviews = await listInterviewsForApplications(rows.map((row) => row.id));
    const interviewed = new Set(interviews.map((i) => i.application_id));
    response.json({
      data: rows.map((row) => ({
        ...row,
        editable: isTalentEditable(row.current_stage, interviewed.has(row.id) ? 1 : 0),
      })),
    });
  } catch (error) {
    forwardError(error, next, "Failed to list applications:", "Could not list applications");
  }
};

// GET /applications/mine/ids: lightweight list of applied opportunity ids.
const listMyAppliedIdsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    response.json({ opportunity_ids: await listAppliedOpportunityIds(userId) });
  } catch (error) {
    forwardError(error, next, "Failed to list applied ids:", "Could not list applications");
  }
};

// GET /applications?company_id=...: company admins see every applicant to their listings.
const listCompanyApplicationsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const query = parseOrFail(
      companyApplicationsQuerySchema.safeParse(request.query),
      "Invalid applications query",
    );
    if (!(await checkAdmin(query.company_id, userId))) {
      throw new AppError("User is not an active admin of the company", 403);
    }
    const { applications, titles } = await listApplicationsForCompany(
      query.company_id,
      { opportunityId: query.opportunity_id, stage: query.stage },
    );
    const profiles = await loadApplicantProfiles(
      applications.map((application) => application.talent_id),
    );
    response.json({
      data: applications.map((application) =>
        toEmployerApplication(
          application,
          profiles.get(application.talent_id),
          titles.get(application.opportunity_id),
        ),
      ),
    });
  } catch (error) {
    forwardError(error, next, "Failed to list company applications:", "Could not list applications");
  }
};

// GET /applications/:id: visible to the applicant and to admins of the owning company.
const getApplicationHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const { application, opportunity } = await loadApplicationWithListing(request.params.id);
    if (application.talent_id !== userId) {
      await requireListingAdmin(opportunity.company_id, userId);
    }
    const profiles = await loadApplicantProfiles([application.talent_id]);
    const contact = await findUserContact(application.talent_id);
    response.json({
      application: toEmployerApplication(
        application,
        profiles.get(application.talent_id),
        opportunity.title,
        undefined,
        contact?.email,
      ),
    });
  } catch (error) {
    forwardError(error, next, "Failed to get application:", "Could not get application");
  }
};

// PATCH /applications/:id: company admins move the stage and keep private notes.
const updateApplicationHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const patch = parseOrFail(
      updateApplicationSchema.safeParse(request.body),
      "Invalid update",
    );
    const { application, opportunity } = await loadApplicationWithListing(request.params.id);
    await requireListingAdmin(opportunity.company_id, userId);

    if (patch.current_stage && patch.current_stage !== application.current_stage) {
      if (!STAGE_TRANSITIONS[application.current_stage].includes(patch.current_stage)) {
        throw new AppError(
          `Cannot move an application from ${application.current_stage} to ${patch.current_stage}`,
          409,
        );
      }
    }
    const updated = await updateApplication(application.id, patch);
    if (!updated) throw new AppError("Application not found", 404);

    const profiles = await loadApplicantProfiles([updated.talent_id]);
    const contact = await findUserContact(updated.talent_id);
    response.json({
      application: toEmployerApplication(
        updated,
        profiles.get(updated.talent_id),
        opportunity.title,
        undefined,
        contact?.email,
      ),
    });
  } catch (error) {
    forwardError(error, next, "Failed to update application:", "Could not update application");
  }
};

// POST /applications/:id/withdraw: the applicant withdraws while the application is still open.
const withdrawApplicationHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const application = await findApplicationById(parseApplicationId(request.params.id));
    if (!application || application.talent_id !== userId) {
      throw new AppError("Application not found", 404);
    }
    if (CLOSED_STAGES.includes(application.current_stage)) {
      throw new AppError(`This application is already ${application.current_stage}`, 409);
    }
    const updated = await updateApplication(application.id, { current_stage: "Withdrawn" });
    response.json({ application: updated });
  } catch (error) {
    forwardError(error, next, "Failed to withdraw application:", "Could not withdraw application");
  }
};

// PATCH /applications/:id/mine: the applicant edits their cover letter until an interview is requested.
const editMyApplicationHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const body = parseOrFail(editApplicationSchema.safeParse(request.body ?? {}), "Invalid application");
    const application = await findApplicationById(parseApplicationId(request.params.id));
    if (!application || application.talent_id !== userId) {
      throw new AppError("Application not found", 404);
    }
    const interviews = await listInterviewsForApplication(application.id);
    if (!isTalentEditable(application.current_stage, interviews.length)) {
      throw new AppError(
        "This application can no longer be edited because the employer has moved it forward",
        409,
      );
    }
    const profile = (await loadApplicantProfiles([userId])).get(userId) ?? null;
    const updated = await updateApplication(application.id, {
      cover_letter: body.cover_letter || null,
      cv_url: profile?.cv_url ?? application.cv_url,
    });
    response.json({ application: updated && { ...updated, editable: true } });
  } catch (error) {
    forwardError(error, next, "Failed to edit application:", "Could not edit application");
  }
};

export {
  editMyApplicationHandler,
  getApplicationHandler,
  listCompanyApplicationsHandler,
  listMyAppliedIdsHandler,
  listMyApplicationsHandler,
  submitApplicationHandler,
  updateApplicationHandler,
  withdrawApplicationHandler,
};
