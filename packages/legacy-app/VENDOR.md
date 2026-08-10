# Vendored Fanqie frontend

The files under `public/` and the initial `index.html` were imported from this repository's
`legacy` branch at commit `0af67ff3a38cce8ddafe303450273bd08e6721ae`.

The vendored frontend is retained to reproduce the original jQuery application. Local changes
replace the remote rendering endpoint with `@openfanqie/core`, load bundled example JSON files,
and make the site buildable with Vite. No upstream license notice was present in the vendored
static directory; this file records provenance but does not grant additional rights.
