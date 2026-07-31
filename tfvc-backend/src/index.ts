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
  async bootstrap({ strapi }: { strapi: any }) {
    // Migration 1: set isBackout=true for all delegates currently in Backout status
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

    // Migration 2: fix delegates incorrectly marked Paid via the old broken flow.
    // status=Paid + isBackout=true + ndPaid=false → revert to Backout.
    const brokenDelegates = await strapi.entityService.findMany('api::delegate.delegate', {
      filters: { status: 'Paid', isBackout: true },
      limit: 1000,
    }) as any[];

    let reverted = 0;
    for (const d of brokenDelegates) {
      if (!d.ndPaid) {
        await strapi.entityService.update('api::delegate.delegate', d.id, {
          data: { status: 'Backout', isPaid: false, paidAt: null },
        });
        reverted++;
      }
    }
    if (reverted > 0) {
      strapi.log.info(`✓ Reverted ${reverted} incorrectly-paid backout delegates back to Backout`);
    }
  },
};
