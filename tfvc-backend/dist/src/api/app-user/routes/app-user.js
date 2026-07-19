"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        {
            method: 'GET',
            path: '/app-users',
            handler: 'app-user.find',
            config: { auth: false },
        },
        {
            method: 'GET',
            path: '/app-users/:id',
            handler: 'app-user.findOne',
            config: { auth: false },
        },
        {
            method: 'POST',
            path: '/app-users',
            handler: 'app-user.create',
            config: { auth: false },
        },
        {
            method: 'DELETE',
            path: '/app-users/:id',
            handler: 'app-user.delete',
            config: { auth: false },
        },
    ],
};
