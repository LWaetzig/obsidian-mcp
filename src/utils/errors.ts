/** Extract a human-readable message from any thrown value. */
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Produce a standard MCP error response object. */
export function errorResponse(error: unknown) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${formatError(error)}` }],
  };
}
