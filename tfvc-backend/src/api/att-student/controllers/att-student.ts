import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::att-student.att-student', ({ strapi }) => ({
  /**
   * Override CREATE to reject duplicates:
   *   - same studentId (when non-empty), OR
   *   - same normalized name (case-insensitive)
   *
   * This ensures that even concurrent requests (e.g. from bulk import) can
   * never create two att-student records for the same person.
   */
  async create(ctx) {
    const incoming = ctx.request.body?.data ?? {}
    const incomingName: string  = String(incoming.name      ?? '').trim().toUpperCase()
    const incomingId:   string  = String(incoming.studentId ?? '').trim()

    if (!incomingName) {
      return ctx.badRequest('Name is required.')
    }

    // Build OR-style duplicate check: match by studentId OR by name
    const orFilters: object[] = [{ name: { $eqi: incomingName } }]
    if (incomingId) {
      orFilters.push({ studentId: { $eq: incomingId } })
    }

    const existing = await strapi.documents('api::att-student.att-student').findMany({
      filters: { $or: orFilters } as any,
      limit: 1,
    })

    if (existing.length > 0) {
      return ctx.conflict(
        `Att-student "${incomingName}" (ID: ${incomingId || 'none'}) already exists.`,
        { code: 'DUPLICATE_ATT_STUDENT' }
      )
    }

    // Normalise name to uppercase before saving
    ctx.request.body.data.name = incomingName
    return super.create(ctx)
  },
}))
