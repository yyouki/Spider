# Owner autonomy and account/device access

## Owner-controlled autonomy

The owner configures how connected capabilities operate. Settings are persisted with the private SpaceAgent instance:

- `workspaceExecution`: manual approval for each run, or autonomous execution of bounded Python/JavaScript tasks inside the isolated offline Linux sandbox;
- `browserResearch`: manual or automatic read-only research;
- `projectFiles`: ask before each write or manage the selected workspace;
- `selfUpdate`: manual release or automatic promotion after every release gate passes.

These settings are preferences only. The sandbox runner is implemented in source but remains deployment-gated by Cloudflare Containers and a Workers Paid plan. It is not a general shell, does not mount the project repository, and has no outbound internet access.

## Account access

The owner may connect accounts they own or are authorized to administer. Each provider connection must use the provider's official OAuth consent flow. The user chooses the scopes shown by that provider, and can revoke the grant.

Once an account is connected, the agent may work autonomously within the exact granted scopes where the connected integration supports it. The agent must not:
- request or store the account password, MFA code, recovery code, session cookie, or private key;
- bypass MFA, device checks, age restrictions, rate limits, or provider consent;
- impersonate a different account owner;
- access accounts or data the user is not authorized to use;
- silently increase OAuth scopes;
- send/publish, spend money, delete important data, change account security, or grant access to other people without owner confirmation.

A broad OAuth scope does not mean the provider guarantees every action is allowed. Provider policy, API capability, and connection-specific permission remain authoritative.

## Device access

A future Android companion app may request camera, microphone, selected files, notifications, screen capture, or other platform features through Android's own permission model. It must:
- ask through the platform permission prompt;
- explain why the permission is needed;
- show when a capture/stream/session is active;
- expose an obvious stop/revoke control;
- avoid hidden background recording or access;
- keep raw biometric material inside the operating system.

The AI may receive the permitted result (for example, a captured screenshot or speech transcript) rather than raw fingerprint templates or credential material. Biometrics are handled by the OS for authentication.

## Owner can choose autonomy; critical safeguards stay on

The owner can prefer autonomous research and project work. The following protections are not ordinary toggles and cannot be disabled by agent self-modification:
- approval for irreversible or externally consequential actions;
- authentication and account recovery protections;
- access control and secret handling;
- audit logging;
- sandbox isolation and network restrictions;
- rollback for automated updates.

This protects the user's own data and accounts from prompt injection, tool mistakes, model errors, compromised dependencies, and accidental destructive actions.

## Current implementation

The MVP stores four autonomy preferences and displays them in the dashboard. It does not yet connect external accounts or Android device features. Do not treat a saved preference as a granted OAuth scope or native OS permission.
