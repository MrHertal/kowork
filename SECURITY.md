# Security

## Threat model

Kowork runs AI agents locally with access to powerful tools: shell execution, file operations, and external services through connectors.

- **No sandbox.** Permission prompts keep you aware of what an agent is doing; they are a UX feature, not a security boundary. For isolation, run agents in a container or VM.
- **Local server.** The OpenCode sidecar listens on `127.0.0.1` only and is not exposed to the network.
- **Out of scope.** Data sent to your LLM provider, the behavior of connectors (MCP servers) you configure, and modification of your own config files.

## Reporting

Report vulnerabilities through the GitHub Security Advisory ["Report a Vulnerability"](https://github.com/MrHertal/kowork/security/advisories/new) tab — please do not open public issues for security reports.
