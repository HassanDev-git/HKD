# HKD official site source

The site is a dependency-free, multi-page static website built with Node.js. Source files live in `src/`; `npm run website:build` writes deployable static output to the ignored `website/dist/` directory. The site can be hosted on any static host.

The release page requests `https://api.github.com/repos/HassanDev-git/HKD/releases/latest` and renders only exact, version-matched GitHub release assets from the six supported platform names. Platform recommendations require a known OS and architecture; unsupported or unknown targets are left for manual selection.

## Local validation

```sh
npm run website:test
npm run website:build
node scripts/website-serve.cjs
```

Open `http://127.0.0.1:4173/` for a local preview. Stop the preview with Ctrl+C.

## Deployment configuration

No production hosting or GitHub Pages deployment is configured by this implementation. Build with `HKD_SITE_URL` set to the verified public site base URL, for example `https://hkd-lang.dev`, before deployment. Verify DNS, domain ownership, HTTPS and hosting configuration before publishing. The default URL follows the host already referenced in the HKD CLI and documentation; its production availability was not verified during implementation.

The project includes canonical links, an XML sitemap, robots.txt, Open Graph and Twitter metadata, structured software metadata, reduced-motion behavior, keyboard navigation, responsive layouts, and a static deployment output. It contains no analytics, credentials or fabricated metrics.
