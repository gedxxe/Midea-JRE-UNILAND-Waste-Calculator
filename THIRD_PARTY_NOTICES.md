# Third-party notices

The repository's [rights-reserved notice](LICENSE) covers original work, not third-party software or branding. Resolved packages are pinned in package-lock.json. Their license files remain in installed packages and must be retained when redistributing those packages.

| Direct dependency | Purpose                   | License / source                                                        |
| ----------------- | ------------------------- | ----------------------------------------------------------------------- |
| pg                | PostgreSQL server driver  | [MIT](https://github.com/brianc/node-postgres/blob/master/LICENSE)      |
| @node-rs/argon2   | Server password hashing   | [MIT](https://github.com/napi-rs/node-rs/blob/main/LICENSE)             |
| @playwright/test  | Development browser tests | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| prettier          | Development formatting    | [MIT](https://github.com/prettier/prettier/blob/main/LICENSE)           |

This lists direct packages only. Transitive packages, optional native binaries and their components retain their own terms. Review installed package notices before distributing a packaged build. Node.js, PostgreSQL and hosting services have separate licenses or service terms. Their names here do not imply endorsement.

The existing Midea image identifies the intended reporting workflow. This repository does not claim ownership of the mark or grant rights to reuse it. Reference calibration data and workbooks are not relicensed by the repository notice. Operational records and private exports are not public repository assets.

README badges are remote Shields.io images with technology logos. They are documentation links only, excluded from the website build. The local workflow illustration contains no operating data.

## React Bits animation source

The welcome screen adapts Tech Text and Magnet from [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696), pinned to commit e12c22192ac7b4b452c5e2feb9b586d74765d696, copyright (c) 2026 David Haz. Source locations: src/content/TextAnimations/TechText/TechText.jsx and src/content/Animations/Magnet/Magnet.jsx. The adaptation replaces React hooks with DOM lifecycle controls, fixes application settings, bounds motion/rendering and preserves static HTML fallbacks. It is used only as part of this reporting website, not distributed as a standalone component library or port.

These files use **MIT + Commons Clause License Condition v1.0**, not the repository's rights-reserved terms and not unrestricted MIT. Retain the [full upstream license](asset/licenses/react-bits.txt) with copies of this application. The condition permits use in an application, website or product and restricts selling, sublicensing or redistributing the components themselves. React itself is not bundled or required. The supplied white Midea image retains separate brand rights.
