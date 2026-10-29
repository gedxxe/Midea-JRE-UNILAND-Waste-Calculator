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

The welcome and sign-in screens adapt Tech Text, Split Text, Magnet, Gradient ASCII, Glass Icons, GlassSurface, Lattice Loader, FuseButton and SpecularButton from [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696), pinned to commit e12c22192ac7b4b452c5e2feb9b586d74765d696, copyright (c) 2026 David Haz.

Source locations under src/content/:

- TextAnimations/TechText/TechText.jsx and TextAnimations/SplitText/SplitText.jsx: the supplied TechText metrics introduction, dashed glyph selection, labels, specks, click-kick and drag springs, adapted with cached canvas sprites and native animation frames, without React or GSAP. Split Text informed the earlier character entrance.
- Animations/Magnet/Magnet.jsx: bounded CTA movement.
- Backgrounds/GradientASCII/GradientASCII.jsx: WebGL2 shader engine with fixed settings, resolution/frame limits and DOM lifecycle cleanup.
- Components/GlassIcons/GlassIcons.jsx and GlassIcons.css: layered CSS glass fallback/style; the WebGL refraction renderer is not included.
- Components/GlassSurface/GlassSurface.jsx and GlassSurface.css: user-supplied SVG displacement, RGB-channel composition, sheen and frosted fallback. Adapted with owned Blob maps under the existing CSP; no backdrop screenshots or separate refraction render loop.
- Micro/FuseButton/FuseButton.jsx and FuseButton.css: supplied countdown outline/face interaction, adapted to defer manual checkpoint submission for four seconds and retain native Undo/Escape. Functional timing is independent of WAAPI and server confirmation controls saved feedback. No Hugeicons dependency is bundled.
- Components/SpecularButton/SpecularButton.jsx and SpecularButton.css: supplied rounded-rim WebGL2 shaders and pointer/press springs on the native login submit, lazy-loaded with capped DPR, idle cleanup and CSS fallback. No form values or backdrop screenshots enter the renderer.
- Micro/LatticeLoader/LatticeLoader.jsx and LatticeLoader.css: CSS orbit pattern driven by actual sign-in request state.

The adaptations replace React hooks with DOM lifecycle controls, fix application settings, bound motion/rendering and preserve static HTML fallbacks. They are used only as part of this reporting website, not distributed as a standalone component library or port.

These files use **MIT + Commons Clause License Condition v1.0**, not the repository's rights-reserved terms and not unrestricted MIT. Retain the [full upstream license](asset/licenses/react-bits.txt) with copies of this application. The condition permits use in an application, website or product and restricts selling, sublicensing or redistributing the components themselves. React itself is not bundled or required. The supplied white Midea image retains separate brand rights.

## Lucide SVG icons

The small inline icon set in ui/panel-icons.js is adapted from [Lucide](https://github.com/lucide-icons/lucide), pinned to be09619c1c1124ad09c19fc3e87ee3b939409bbd. Full upstream ISC and Feather-derived MIT notices are retained in [asset/licenses/lucide.txt](asset/licenses/lucide.txt) and distributed with public builds. No Lucide runtime package or remote icon/font service is used. Midea marks are separate and are not supplied by Lucide.

The N₂, O₂ and R32 formula marks are original SVG drawings in this repository, separate from the Lucide geometry.
