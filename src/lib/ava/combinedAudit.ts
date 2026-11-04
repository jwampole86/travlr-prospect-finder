/** Also writes every audit event to the server log as one JSON line, so the trail survives if the database write fails. */
export function createCombinedAudit(db: { record: (e: never) => Promise<void> }) {
  return {
    async record(e: unknown) {
      console.log(JSON.stringify({ ava_audit: e }));
      await db.record(e as never);
    }
  };
}
