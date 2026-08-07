# Clusterdeck privacy and network access

_Last updated: 2026-08-06_

Clusterdeck is a local, open-source desktop application. Usage telemetry is **off by default**. A fresh installation does not record or upload usage telemetry, send a diagnostic ping, or send a telemetry-state transition. You can explicitly opt in during onboarding or later by setting `telemetry:enabled` to `true`.

Clusterdeck Authors maintain this derivative application and repository. Command Line Inc. is the independent operator of the inherited Wave telemetry services described below. Clusterdeck Authors do not control those services or promise deletion of data held by Command Line Inc. See [Wave's privacy policy](https://www.waveterm.dev/privacy) for its statements about service-side handling.

## Optional usage events

While telemetry is enabled, Clusterdeck records events defined by [`pkg/telemetry/telemetrydata/telemetrydata.go`](pkg/telemetry/telemetrydata/telemetrydata.go). They include a random client UUID, event name and timestamps, app/build/platform properties, aggregate object and feature counts, action names, view types, connection categories, and `wsh` command names/counts. The event queue is uploaded to `https://api.waveterm.dev/central/tevents`, operated by Command Line Inc., after a short startup delay, approximately every four hours while the app runs, and at shutdown.

Clusterdeck does not record events while telemetry is disabled. At startup and before any disabled-to-enabled transition opens recording, Clusterdeck deletes every pre-existing unsent event and all rows from the obsolete legacy activity table. Disabling telemetry closes recording and deletes the current unsent queue. Event cleanup retains uploaded local event rows for approximately seven days while enabled and approximately one day while disabled; cleanup runs as part of the telemetry loop rather than at an exact wall-clock deadline. The legacy `db_activity` collector and `/telemetry` upload path are not used by Clusterdeck.

## Consent-state transition request

Changing `telemetry:enabled` in either direction sends the random client UUID and the new opt-out state to `https://api.waveterm.dev/central/no-telemetry`. The JSON fields are `clientid` and `value`; `value` is `false` when enabling telemetry and `true` when disabling it. Merely starting with the default disabled setting does not send this request.

## Diagnostic ping

While telemetry is enabled, a process that remains running sends at most one ping per local calendar day to `https://ping.waveterm.dev/central/ping`, operated by Command Line Inc. The payload contains the client UUID, CPU architecture, app version, local date, and telemetry-enabled state. The last-sent date is not persisted, so quitting and restarting an opted-in app can result in another ping after the five-minute startup delay on the same day. Setting the inherited compatibility environment variable `WAVETERM_NOPING` to any nonempty value suppresses the ping without changing usage-event consent.

HTTPS service operators necessarily receive the source IP address and request timing as part of a network connection. Clusterdeck Authors cannot verify or make claims about whether Command Line Inc. stores that metadata.

## Other network features

These features are separate from usage telemetry:

- **Updates** use Homebrew or a user-selected download from the `clusterdeck/releases` artifact repository. Clusterdeck hard-disables the inherited Electron/Wave updater and has no configured automatic update feed. Homebrew and GitHub receive ordinary request metadata when you use them.
- **SSH connections, web widgets, and terminal commands** contact destinations selected by the user. Their traffic is not routed through Clusterdeck Authors as telemetry.
- **Documentation and external links** contact the destination site when opened. The Clusterdeck documentation site has no analytics or hosted search integration configured.

Network recipients can observe normal connection metadata such as source IP and request timing. Content sent by a user-directed feature is available to that feature's destination.

## Questions and corrections

To report a Clusterdeck privacy issue or request a correction to this document, [open an issue in clusterdeck/app](https://github.com/clusterdeck/app/issues). Public visibility of that repository and the `clusterdeck/releases` artifact repository must be verified by the repository owner before release. For data handled by a Command Line Inc. endpoint, consult its linked policy and contact that operator directly.
