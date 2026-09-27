# HKD Deprecation & Feature Lifecycle Policy

## 1. Lifecycle Stages
- **Stable**: Fully supported, normative part of the language specification and SemVer guarantees.
- **Experimental**: Gated behind explicit flags or unstable profiles (e.g. Vercel bridge). May evolve without breaking SemVer.
- **Deprecated**: Planned for removal in the next language edition. Emits compiler warnings when used.
- **Removed**: No longer accepted by the compiler or runtime.
