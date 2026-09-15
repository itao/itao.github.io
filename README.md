# itao.github.io
Personal website.

## Digital twin (`db1`)

`db1.html` is the public, read-only Digital Build viewer. Its local ES modules,
scene snapshot, and pinned Three.js files are in `db1/`, so it works at
`https://taoian.com/db1.html` when this repository root is published by GitHub
Pages. The source converter/viewer lives in `pascal-to-threejs`; the publishable
snapshot is regenerated under `digital-twin/export/`. When updating this page,
copy its `viewer.js`, `model.js`, and `lib/` into `db1/`, refresh `db1.html`
from the export's `index.html`, and keep the three relative references in
`db1.html` pointed at `./db1/` (import map, module import, and full-page link).

The public snapshot includes the floor plan and room names. Review each new
export before pushing it to this public site.
