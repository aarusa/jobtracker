import { z } from "zod";

import { APPLICATION_STATUSES, WORK_TYPES } from "../../lib/constants";

export const applicationFormSchema = z.object({
  job_url: z.string().url("Enter a valid job URL"),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  work_type: z.enum(WORK_TYPES as [string, ...string[]]),
  employment_type: z.string().optional(),
  salary_text: z.string().optional(),
  description: z.string().optional(),
  date_posted: z.string().optional(),
  applied_at: z.string().min(1, "Applied date is required"),
  resume_id: z.string().optional(),
  cover_letter_id: z.string().optional(),
  scrape_status: z.string().optional(),
  notes: z.string().optional(),
  /** Comma-separated tags in the form; parsed to a string[] on submit. */
  tags: z.string().optional(),
  status: z.enum(APPLICATION_STATUSES as [string, ...string[]]).optional(),
  status_note: z.string().optional(),
});

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;
