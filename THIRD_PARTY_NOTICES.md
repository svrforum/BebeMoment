# Third-Party Notices

Bebe Moment is licensed under AGPL-3.0 (see [LICENSE](LICENSE)). It includes or
depends on third-party components with their own licenses:

## Bundled assets

- **Pretendard** v1.3.9 (font) — © 2021 Kil Hyung-jin, SIL Open Font License 1.1.
  Bundled as the official dynamic subsets at `apps/web/public/fonts/pretendard/`; full
  license at [`apps/web/public/fonts/OFL.txt`](apps/web/public/fonts/OFL.txt).

## Bundled programs (app container image)

- **FFmpeg** 8.1.2 (`ffmpeg` and `ffprobe` at `/usr/local/bin/`) — **GPL-3.0-or-later**.
  The app image ships the prebuilt static binaries from
  [`mwader/static-ffmpeg`](https://github.com/wader/static-ffmpeg), pinned by version
  tag **and** digest in [`docker/app.Dockerfile`](docker/app.Dockerfile)
  (`mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585`,
  a multi-arch index covering linux/amd64 and linux/arm64). That build is configured
  with `--enable-gpl --enable-version3` and **without** `--enable-nonfree`, so it is
  redistributable; run `ffmpeg -version` in the container for the full configure line
  and the list of bundled codec libraries.
  Bebe Moment does not link against FFmpeg — the media service executes `ffmpeg` and
  `ffprobe` as separate programs (`apps/media/src/lib/ffmpeg.ts`). FFmpeg's source is
  available from [ffmpeg.org](https://ffmpeg.org/download.html) and the build recipe
  from the `static-ffmpeg` repository above.

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
