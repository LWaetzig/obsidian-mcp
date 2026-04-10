/**
 * Shared Zod field definitions reused across tool registration files.
 * Centralised here so any changes propagate consistently.
 */
import { z } from "zod";
import { ResponseFormat } from "../types.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

export const sharedPagination = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(
      `Maximum number of results to return (1–${MAX_PAGE_SIZE}, default ${DEFAULT_PAGE_SIZE})`,
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination (default 0)"),
};

export const sharedResponseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' for human-readable, 'json' for machine-readable",
  );
