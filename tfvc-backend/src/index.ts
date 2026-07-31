import type { Core } from '@strapi/strapi';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Auto-grant all CRUD permissions for the non-delegate collection
    // to both "authenticated" and "public" roles on every startup.
    // This ensures the API is accessible after the collection is created.
    const actions = [
      'api::non-delegate.non-delegate.find',
      'api::non-delegate.non-delegate.findOne',
      'api::non-delegate.non-delegate.create',
      'api::non-delegate.non-delegate.update',
      'api::non-delegate.non-delegate.delete',
    ]

    const roles = await (strapi as any).query('plugin::users-permissions.role').findMany({
      where: { type: { $in: ['public', 'authenticated'] } },
    })

    for (const role of roles) {
      for (const action of actions) {
        const existing = await (strapi as any).query('plugin::users-permissions.permission').findOne({
          where: { action, role: role.id },
        })
        if (!existing) {
          await (strapi as any).query('plugin::users-permissions.permission').create({
            data: { action, role: role.id, enabled: true },
          })
        } else if (!existing.enabled) {
          await (strapi as any).query('plugin::users-permissions.permission').update({
            where: { id: existing.id },
            data: { enabled: true },
          })
        }
      }
    }
  },
};
