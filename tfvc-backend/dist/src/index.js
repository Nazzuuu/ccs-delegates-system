"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    register() { },
    async bootstrap({ strapi }) {
        // One-time migration: set isBackout=true for all delegates currently in Backout status
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
    },
};
