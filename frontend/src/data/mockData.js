// Mock data for Phase 1 — all UI components use this data
// Will be replaced by real API calls in Phase 2

export const mockStats = {
  totalRepos: 4,
  totalErrors: 128,
  criticalErrors: 7,
  openIncidents: 12,
  resolvedToday: 5,
  errorDelta: +23,     // % vs last week
  criticalDelta: -12,
  incidentDelta: +8,
}

export const mockErrorTrend = [
  { date: 'Aug 20', errors: 14, critical: 1 },
  { date: 'Aug 21', errors: 22, critical: 3 },
  { date: 'Aug 22', errors: 18, critical: 2 },
  { date: 'Aug 23', errors: 31, critical: 4 },
  { date: 'Aug 24', errors: 9,  critical: 0 },
  { date: 'Aug 25', errors: 17, critical: 2 },
  { date: 'Aug 26', errors: 24, critical: 3 },
  { date: 'Aug 27', errors: 11, critical: 1 },
  { date: 'Aug 28', errors: 28, critical: 5 },
  { date: 'Aug 29', errors: 19, critical: 2 },
  { date: 'Aug 30', errors: 35, critical: 6 },
  { date: 'Aug 31', errors: 21, critical: 3 },
  { date: 'Sep 01', errors: 42, critical: 7 },
  { date: 'Sep 02', errors: 27, critical: 4 },
]

export const mockRepositories = [
  {
    id: 'repo_001',
    name: 'splitwise-app',
    fullName: 'alexchen/splitwise-app',
    owner: 'alexchen',
    language: 'TypeScript',
    stars: 234,
    monitoringEnabled: true,
    errorCount: 87,
    criticalCount: 5,
    lastError: '2 min ago',
    health: 'critical',
    branch: 'main',
    description: 'Expense splitting and tracking application',
    updatedAt: '2026-09-02T14:30:00Z',
  },
  {
    id: 'repo_002',
    name: 'api-gateway',
    fullName: 'alexchen/api-gateway',
    owner: 'alexchen',
    language: 'Python',
    stars: 89,
    monitoringEnabled: true,
    errorCount: 31,
    criticalCount: 2,
    lastError: '18 min ago',
    health: 'warning',
    branch: 'main',
    description: 'Internal API gateway service',
    updatedAt: '2026-09-02T13:15:00Z',
  },
  {
    id: 'repo_003',
    name: 'dashboard-ui',
    fullName: 'alexchen/dashboard-ui',
    owner: 'alexchen',
    language: 'JavaScript',
    stars: 156,
    monitoringEnabled: true,
    errorCount: 10,
    criticalCount: 0,
    lastError: '3 hrs ago',
    health: 'healthy',
    branch: 'main',
    description: 'Internal analytics dashboard',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'repo_004',
    name: 'worker-service',
    fullName: 'alexchen/worker-service',
    owner: 'alexchen',
    language: 'Go',
    stars: 45,
    monitoringEnabled: false,
    errorCount: 0,
    criticalCount: 0,
    lastError: null,
    health: 'unknown',
    branch: 'main',
    description: 'Background job processing service',
    updatedAt: '2026-09-01T08:00:00Z',
  },
]

export const mockErrors = [
  {
    id: 'err_001',
    repositoryId: 'repo_001',
    repositoryName: 'splitwise-app',
    fingerprint: 'fp_a1b2c3',
    errorType: 'TypeError',
    message: "Cannot read properties of undefined (reading 'name')",
    stackTrace: `TypeError: Cannot read properties of undefined (reading 'name')
    at ExpenseCard (Expense.jsx:47:23)
    at renderWithHooks (react-dom.development.js:14985:18)
    at mountIndeterminateComponent (react-dom.development.js:17811:13)
    at beginWork (react-dom.development.js:19049:16)
    at HTMLUnknownElement.callCallback (react-dom.development.js:3945:14)
    at Object.invokeGuardedCallbackDev (react-dom.development.js:3994:16)`,
    fileName: 'Expense.jsx',
    lineNumber: 47,
    severity: 'critical',
    occurrences: 127,
    status: 'open',
    environment: 'production',
    firstSeen: '2026-08-28T09:12:00Z',
    lastSeen: '2026-09-02T14:58:00Z',
    aiDiagnosis: {
      rootCause: 'The API response can return null or undefined when the user session expires, but the application accesses user.name without null-checking the user object.',
      explanation: 'In ExpenseCard component at line 47, the code directly accesses user.name without verifying that the user object exists. This happens when the authentication token expires mid-session and the API returns a 401, causing the user context to become undefined.',
      suggestedFix: `// Before (line 47)
const displayName = user.name;

// After — add null check
const displayName = user?.name ?? 'Unknown User';

// Or guard the entire component render:
if (!user) return <LoadingSpinner />;`,
      affectedFile: 'Expense.jsx',
      affectedLine: 47,
    },
  },
  {
    id: 'err_002',
    repositoryId: 'repo_002',
    repositoryName: 'api-gateway',
    fingerprint: 'fp_d4e5f6',
    errorType: 'HTTPError',
    message: 'HTTP 503 Service Unavailable — upstream database connection timed out',
    stackTrace: `httpx.ConnectTimeout: [Errno 110] Connection timed out
    File "/app/services/db_service.py", line 89, in connect
      conn = await engine.connect()
    File "/app/api/users.py", line 34, in get_users
      db = await db_service.connect()
    File "/app/middleware/request_handler.py", line 12, in __call__
      response = await self.app(scope, receive, send)`,
    fileName: 'db_service.py',
    lineNumber: 89,
    severity: 'high',
    occurrences: 23,
    status: 'open',
    environment: 'production',
    firstSeen: '2026-09-02T11:00:00Z',
    lastSeen: '2026-09-02T14:45:00Z',
    aiDiagnosis: {
      rootCause: 'Database connection pool is exhausted under load. The connection timeout suggests the pool limit has been reached and new requests cannot acquire a connection within the timeout window.',
      explanation: 'The PostgreSQL connection pool is configured with a maximum of 10 connections. Under peak load (>50 req/s), all connections are held by long-running queries, causing new requests to timeout while waiting.',
      suggestedFix: `# In db_service.py — increase pool size and add retry logic
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,          # increase from 10
    max_overflow=10,       # allow burst connections
    pool_timeout=30,
    pool_recycle=3600,
)

# Add exponential backoff retry decorator
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
async def connect():
    return await engine.connect()`,
      affectedFile: 'db_service.py',
      affectedLine: 89,
    },
  },
  {
    id: 'err_003',
    repositoryId: 'repo_001',
    repositoryName: 'splitwise-app',
    fingerprint: 'fp_g7h8i9',
    errorType: 'ReferenceError',
    message: "useGroupContext is not a function",
    stackTrace: `ReferenceError: useGroupContext is not a function
    at GroupDetail (GroupDetail.jsx:12:28)
    at renderWithHooks (react-dom.development.js:14985:18)`,
    fileName: 'GroupDetail.jsx',
    lineNumber: 12,
    severity: 'high',
    occurrences: 45,
    status: 'open',
    environment: 'production',
    firstSeen: '2026-09-01T16:30:00Z',
    lastSeen: '2026-09-02T14:10:00Z',
    aiDiagnosis: {
      rootCause: 'Named import mismatch. The hook was exported as a default export but imported as a named export.',
      explanation: 'GroupContext.js exports useGroupContext as a default, but GroupDetail.jsx imports it using destructuring, which returns undefined — leading to "is not a function" when called.',
      suggestedFix: `// GroupDetail.jsx line 12 — fix the import
// Before:
import { useGroupContext } from '../context/GroupContext'

// After:
import useGroupContext from '../context/GroupContext'`,
      affectedFile: 'GroupDetail.jsx',
      affectedLine: 12,
    },
  },
  {
    id: 'err_004',
    repositoryId: 'repo_001',
    repositoryName: 'splitwise-app',
    fingerprint: 'fp_j1k2l3',
    errorType: 'ChunkLoadError',
    message: "Loading chunk 12 failed (missing: /assets/GroupList.abc123.js)",
    stackTrace: `ChunkLoadError: Loading chunk 12 failed.
    (missing: https://splitwise.app/assets/GroupList.abc123.js)
    at Function.requireEnsure (bootstrap:93:25)`,
    fileName: 'main.jsx',
    lineNumber: 1,
    severity: 'medium',
    occurrences: 18,
    status: 'open',
    environment: 'production',
    firstSeen: '2026-09-02T06:00:00Z',
    lastSeen: '2026-09-02T13:22:00Z',
    aiDiagnosis: null,
  },
  {
    id: 'err_005',
    repositoryId: 'repo_003',
    repositoryName: 'dashboard-ui',
    fingerprint: 'fp_m4n5o6',
    errorType: 'Warning',
    message: "Each child in a list should have a unique 'key' prop",
    stackTrace: `Warning: Each child in a list should have a unique "key" prop.
    Check the render method of MetricList (MetricList.jsx:34).`,
    fileName: 'MetricList.jsx',
    lineNumber: 34,
    severity: 'low',
    occurrences: 3,
    status: 'resolved',
    environment: 'development',
    firstSeen: '2026-09-01T10:00:00Z',
    lastSeen: '2026-09-01T10:05:00Z',
    aiDiagnosis: null,
  },
]

export const mockIncidents = [
  {
    id: 'inc_001',
    errorId: 'err_001',
    title: "TypeError in Expense.jsx",
    description: "Cannot read properties of undefined (reading 'name')",
    severity: 'critical',
    status: 'open',
    repositoryName: 'splitwise-app',
    occurrences: 127,
    environment: 'production',
    createdAt: '2026-08-28T09:12:00Z',
    updatedAt: '2026-09-02T14:58:00Z',
    assignee: null,
  },
  {
    id: 'inc_002',
    errorId: 'err_002',
    title: "Database connection timeout",
    description: "HTTP 503 — upstream database connection timed out",
    severity: 'high',
    status: 'open',
    repositoryName: 'api-gateway',
    occurrences: 23,
    environment: 'production',
    createdAt: '2026-09-02T11:00:00Z',
    updatedAt: '2026-09-02T14:45:00Z',
    assignee: null,
  },
  {
    id: 'inc_003',
    errorId: 'err_003',
    title: "ReferenceError in GroupDetail.jsx",
    description: "useGroupContext is not a function",
    severity: 'high',
    status: 'open',
    repositoryName: 'splitwise-app',
    occurrences: 45,
    environment: 'production',
    createdAt: '2026-09-01T16:30:00Z',
    updatedAt: '2026-09-02T14:10:00Z',
    assignee: null,
  },
  {
    id: 'inc_004',
    errorId: 'err_004',
    title: "ChunkLoadError — asset not found",
    description: "Loading chunk 12 failed (missing JS bundle)",
    severity: 'medium',
    status: 'open',
    repositoryName: 'splitwise-app',
    occurrences: 18,
    environment: 'production',
    createdAt: '2026-09-02T06:00:00Z',
    updatedAt: '2026-09-02T13:22:00Z',
    assignee: null,
  },
  {
    id: 'inc_005',
    errorId: 'err_005',
    title: "Missing key prop in MetricList",
    description: "React list key prop warning",
    severity: 'low',
    status: 'resolved',
    repositoryName: 'dashboard-ui',
    occurrences: 3,
    environment: 'development',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:30:00Z',
    assignee: null,
  },
]

export const mockDeployments = [
  {
    id: 'dep_001',
    repositoryId: 'repo_001',
    repositoryName: 'splitwise-app',
    commitSha: 'a1b2c3d',
    commitMessage: 'feat: add expense category filters',
    branch: 'main',
    author: 'alexchen',
    status: 'success',
    duration: '2m 34s',
    createdAt: '2026-09-02T12:00:00Z',
  },
  {
    id: 'dep_002',
    repositoryId: 'repo_001',
    repositoryName: 'splitwise-app',
    commitSha: 'e4f5a6b',
    commitMessage: 'fix: resolve null check in ExpenseCard',
    branch: 'main',
    author: 'alexchen',
    status: 'failed',
    duration: '1m 12s',
    createdAt: '2026-09-02T10:30:00Z',
  },
  {
    id: 'dep_003',
    repositoryId: 'repo_002',
    repositoryName: 'api-gateway',
    commitSha: 'c7d8e9f',
    commitMessage: 'chore: update dependencies',
    branch: 'main',
    author: 'alexchen',
    status: 'success',
    duration: '3m 45s',
    createdAt: '2026-09-01T16:00:00Z',
  },
]

export const mockIntegrations = {
  github: {
    connected: true,
    username: 'alexchen',
    avatarUrl: null,
    repoCount: 4,
    installedAt: '2026-08-01T09:00:00Z',
    appName: 'PipelineIQ',
  },
  slack: {
    connected: true,
    workspaceName: 'Acme Engineering',
    channelName: '#alerts-production',
    webhookConfigured: true,
    connectedAt: '2026-08-15T11:00:00Z',
  },
}

export const mockRepoErrorTrend = [
  { date: 'Aug 27', errors: 8, critical: 1 },
  { date: 'Aug 28', errors: 24, critical: 4 },
  { date: 'Aug 29', errors: 15, critical: 2 },
  { date: 'Aug 30', errors: 31, critical: 5 },
  { date: 'Aug 31', errors: 19, critical: 3 },
  { date: 'Sep 01', errors: 42, critical: 7 },
  { date: 'Sep 02', errors: 27, critical: 5 },
]
