# Third-Party Notices

Bebe Moment is licensed under AGPL-3.0 (see [LICENSE](LICENSE)). It includes or
depends on third-party components with their own licenses:

## Bundled assets

- **Pretendard** (font) — © 2021 Kil Hyung-jin, SIL Open Font License 1.1.
  Bundled at `apps/web/public/fonts/PretendardVariable.woff2`; full license at
  [`apps/web/public/fonts/OFL.txt`](apps/web/public/fonts/OFL.txt).

## Optional, downloaded at runtime

- **InsightFace `buffalo_l` model pack** — used only when the optional face
  recognition feature (`features.faces`) is enabled, and only by the separate
  `ml` sidecar container. The model is downloaded on first use from the
  InsightFace model zoo and cached in the `ml-models` volume. InsightFace
  pretrained models are provided **for non-commercial research purposes**; review
  the [InsightFace license](https://github.com/deepinsight/insightface) before
  enabling faces on a commercial deployment. Faces is off by default, so a
  default install never downloads or uses it.

## npm / pip dependencies

Runtime dependencies are mostly MIT / Apache-2.0 / BSD / ISC and are checked for
AGPL-3.0 compatibility by `pnpm licenses:check` (`scripts/check-licenses.sh`).
Run `pnpm licenses list --prod` for the full list.
