# Security

## Threat Model

Kowork is a desktop app that runs AI agents locally on your machine. Agents can
use powerful tools including shell execution, file operations, and — through
connectors — external services.

### No Sandbox

Kowork does **not** sandbox agents. The permission system is a UX feature that
keeps you aware of what an agent is doing — it prompts for confirmation before
executing commands or writing files. It is not a security boundary.

If you need true isolation, run agents inside a container or VM.

### Local Server

Kowork spawns a local OpenCode sidecar server that listens on the loopback
interface (`127.0.0.1`) only. It is not exposed to the network. Any
functionality reachable on loopback from your own machine is expected behavior,
not a vulnerability.

### Out of Scope

| Category                       | Rationale                                                               |
| ------------------------------ | ----------------------------------------------------------------------- |
| **Sandbox escapes**            | The permission system is not a sandbox (see above)                      |
| **LLM provider data handling** | Data sent to your configured LLM provider is governed by their policies |
| **Connector behavior**         | External MCP servers you configure are outside our trust boundary       |
| **Malicious config files**     | Users control their own config; modifying it is not an attack vector    |

## Reporting Security Issues

We appreciate your efforts to responsibly disclose your findings.

To report a security issue, please use the GitHub Security Advisory
["Report a Vulnerability"](https://github.com/MrHertal/kowork/security/advisories/new)
tab instead of opening a public issue.

The team will respond with the next steps, keep you informed of progress toward
a fix and announcement, and may ask for additional information.
