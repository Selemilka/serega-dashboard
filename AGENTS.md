# Repository workflow

- After each completed user-requested code or configuration change, run the proportionate validation, commit only the files belonging to that change, and push the result to `origin/main`.
- Do not batch unrelated changes into the same commit. Use a short, descriptive commit message.
- Never commit or push secrets, credentials, private runtime files, `.env` files, tokens, or files from `private/`.
- If validation fails, the scope is unclear, or the change would be unsafe to publish, stop before committing or pushing and report the reason.
