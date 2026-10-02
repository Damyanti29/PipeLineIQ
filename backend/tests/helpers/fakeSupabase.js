
export function createFakeSupabase({ tables = {}, rpc } = {}) {
  const calls = []

  function from(table) {
    const chain = []
    calls.push({ table, chain })
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            const handler = tables[table]
            const result = typeof handler === 'function' ? handler(chain) : handler ?? { data: null, error: null }
            return (resolve, reject) => Promise.resolve(result).then(resolve, reject)
          }
          return (...args) => {
            chain.push([prop, ...args])
            return builder
          }
        },
      },
    )
    return builder
  }

  return {
    from,
    rpc: rpc ?? (async () => ({ data: null, error: null })),
    calls,
    callsFor: (table) => calls.filter((call) => call.table === table),
  }
}
