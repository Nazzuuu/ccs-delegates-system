"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    register() { },
    async bootstrap({ strapi }) {
        // Migration 1: set isBackout=true for all delegates currently in Backout status
        const backoutDelegates = await strapi.entityService.findMany('api::delegate.delegate', {
            filters: { status: 'Backout' },
            limit: 1000,
        });
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
            strapi.log.info(`\u2713 Backfilled isBackout=true for ${updated} Backout delegates`);
        }
        // Migration 2: fix delegates incorrectly marked Paid via old broken flow.
        // status=Paid + isBackout=true + ndPaid=false -> revert to Backout.
        const brokenDelegates = await strapi.entityService.findMany('api::delegate.delegate', {
            filters: { status: 'Paid', isBackout: true },
            limit: 1000,
        });
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
            strapi.log.info(`\u2713 Reverted ${reverted} incorrectly-paid backout delegates back to Backout`);
        }
    },
};
