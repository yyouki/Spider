# GitHub project publishing

## Intended user flow

1. Space creates and tests source files in a project workspace.
2. The user selects an existing repository or asks Space to create one.
3. Before creation, Space shows the repository name, owner, public/private visibility, and exact GitHub permissions requested.
4. The user authorizes the GitHub App. Space uses a user-to-server token with the minimum requested permissions.
5. Space creates the repository only after a separate confirmation, then pushes a project commit.
6. Later edits are committed to the selected repository. For protected/default branches or high-impact changes, use a task branch and pull request.
7. Space records the repository URL, branch, commit SHA, and action result in the originating conversation.

## GitHub authorization

Use a GitHub App, not a broad personal access token or a shared owner token. Request only:
- Repository creation permission for the create-repository action.
- Repository contents read/write for files and commits.
- Metadata read as required by GitHub.
- Access only to repositories the user explicitly selects or creates.

GitHub's repository-creation API supports GitHub App user access tokens and a dedicated repository-creation permission. Do not request broad repository administration merely to create repositories. See the GitHub documentation for [user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user) and [repository creation](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user).

Tokens must be encrypted at rest, scoped to a user, never sent to the browser after the OAuth callback, redacted from logs, and revocable. The app must never reuse one user's token for another user's action. A repository created by Space belongs to the authenticated user and follows that user's GitHub settings and policies.

## Safety and approval rules

- Creating a repository: explicit confirmation after the user reviews name and visibility.
- Public visibility: explicit confirmation; default to private.
- Pushing generated code to a repository: show the target repository and branch before the first push.
- Pushing to a protected/default branch: require confirmation; prefer task branches and pull requests.
- Deleting repositories, changing visibility, changing collaborators, or modifying repository security settings: not part of ordinary project publishing.
- Never put a GitHub token in chat history, project files, Actions inputs, browser storage, or logs.

## Current status

This is the target design. The current Space MVP still uses owner-only GitHub OAuth for login and does not have a per-user GitHub App connection or repository-publishing API. Do not present project push or public multi-user login as implemented until the complete authorization and tenant-isolation flow is tested.
