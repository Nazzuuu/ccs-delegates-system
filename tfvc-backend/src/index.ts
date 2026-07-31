// import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    // One-time migration: set isBackout=true for all delegates currently in Backout status
    // that haven't been initialized yet (isBackout is null).
    const backoutDelegates = await strapi.entityService.findMany('api::delegate.delegate', {
      filters: { status: 'Backout' },
      limit: 1000,
    }) as any[];

    let updated = 0;
    for (const d of backoutDelegates) {
      if (d.isBackout !== true) {
        await strapi.entityService.update('api::delegate.delegate', d.id, {
          data: { isBackout: true },
        });
        updated++;
      }
    }
    if (updated > 0) {
      strapi.log.info(`✓ Backfilled isBackout=true for ${updated} Backout delegates`);
    }
  },
};
