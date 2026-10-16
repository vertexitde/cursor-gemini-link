# Security reports

Do not post `config.json`, installation manifests, patched bundles, backups or Antigravity logs in public issues. `config.json` contains the local bridge key.

For a sensitive vulnerability, use GitHub's private vulnerability reporting if available on this repository. If it is unavailable, open an issue requesting a private contact method without including exploit details or secrets.

For ordinary bugs, include software versions (Cursor, `agy --version`, Node.js) and a redacted error. The bridge listens on loopback and requires a random local key; do not expose its port to other machines. This project never handles Antigravity credentials; if you think your Google account was exposed, sign out of `agy` and review your Google account security.
