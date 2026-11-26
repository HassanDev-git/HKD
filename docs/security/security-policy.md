# Vulnerability Handling and Disclosure

Report suspected vulnerabilities using the private contact and process in [`SECURITY.md`](../../SECURITY.md). Do not include credentials or live exploit material in a public issue.

Issues are assessed for impact on the compiler, bytecode readers, package and archive handling, CLI, native runtime, language server, debugger, and deployment examples. Severity is determined from the demonstrated impact and affected versions; this project does not promise a response-time SLA.

HKD is not a sandbox. Users running untrusted programs or packages should apply operating-system isolation and least privilege. The current runtime interprets bytecode; JIT dispatch and native-code AOT are unavailable.
