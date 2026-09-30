// Health is derived from real stats: paused > critical open errors > any open errors > none.
export function repositoryHealth(repo) {
  if (!repo.monitoring_enabled) return 'paused'
  if (repo.stats?.open_critical > 0) return 'critical'
  if (repo.stats?.open_errors > 0) return 'warning'
  return 'healthy'
}
