export default {
  routes: [
    {
      method: 'GET',
      path: '/non-delegates',
      handler: 'non-delegate.find',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/non-delegates/:id',
      handler: 'non-delegate.findOne',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/non-delegates',
      handler: 'non-delegate.create',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/non-delegates/:id',
      handler: 'non-delegate.update',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/non-delegates/:id',
      handler: 'non-delegate.delete',
      config: { auth: false },
    },
  ],
}
