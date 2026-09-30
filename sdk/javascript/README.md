# @reposentinel/sdk

Captures errors in browser and Node.js apps and sends them to a RepoSentinel backend (`POST /api/errors`).

> Not published to npm yet. Install it from this repository (see below).

## Install (local)

```powershell
# from your application folder
npm install ..\path\to\reposentinel\sdk\javascript
```

## Usage

```js
import RepoSentinel from '@reposentinel/sdk'

RepoSentinel.init({
  dsn: 'YOUR_PROJECT_DSN',        // copy it from Repository → SDK setup in the dashboard
  environment: 'production',      // optional, default "production"
  release: '1.4.2',               // optional
})

try {
  risky()
} catch (error) {
  RepoSentinel.captureException(error)
}

RepoSentinel.captureMessage('Checkout took longer than 10s', { level: 'warning' })
```

Uncaught errors and unhandled promise rejections are captured automatically. Pass `captureUnhandled: false` to turn that off.

In Node.js, after an uncaught exception the SDK sends the event, prints the error and exits with code 1, which is what Node does by default.

## DSN

```
<protocol>://<ingestKey>@<host>[:port]/<repositoryId>
e.g. http://3f9c...a1@localhost:5000/0b7a8f7e-6a57-4d52-9d8b-0f4f1c2c9a11
```

The backend URL comes from the DSN, so nothing is hardcoded. The ingest key is sent in the `X-RepoSentinel-Key` header. It can only submit errors for that one repository. It cannot read any data.

## Options

| Option | Default | Description |
|---|---|---|
| `dsn` | required | Project DSN |
| `environment` | `production` | Environment name attached to every event |
| `release` | none | Version or commit SHA, stored in metadata |
| `captureUnhandled` | `true` | Install global error and rejection handlers |
| `sampleRate` | `1` | Fraction of events to send (0–1) |
| `metadata` | `{}` | Extra data added to every event (max 10KB) |
| `beforeSend(event)` | none | Change an event, or return `null` to drop it |
| `debug` | `false` | Log delivery failures to the console |

## API

- `init(options)`
- `captureException(error, { metadata, environment, requestUrl })` → `Promise<{ ok, status }>`
- `captureMessage(message, { level, metadata })` → `Promise<{ ok, status }>`
- `flush(timeoutMs = 2000)`: waits for in-flight events
- `close()`: removes handlers and flushes

The SDK never throws because of delivery problems. Monitoring must not break your app.
