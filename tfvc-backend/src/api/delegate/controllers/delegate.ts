import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::delegate.delegate', ({ strapi }) => ({
  /**
   * Override CREATE to reject duplicate delegate names (case-insensitive).
   * This is the server-side guard against duplicates — even if two requests
   * fire at the same time from the frontend, only the first will succeed.
   */
  async create(ctx) {
    const incoming = ctx.request.body?.data ?? {}
    const incomingName: string = String(incoming.name ?? '').trim().toUpperCase()

    if (!incomingName) {
      return ctx.badRequest('Name is required.')
    }

    // Check for an existing delegate with the same name (case-insensitive)
    const existing = await strapi.documents('api::delegate.delegate').findMany({
      filters: { name: { $eqi: incomingName } },
      limit: 1,
    })

    if (existing.length > 0) {
      return ctx.conflict(
        `Delegate "${incomingName}" already exists.`,
        { code: 'DUPLICATE_DELEGATE' }
      )
    }

    // Normalise name to uppercase before saving
    ctx.request.body.data.name = incomingName
    return super.create(ctx)
  },
}))
