# Energy Record welcome

v0.11.19-alpha adds a fullscreen dark welcome titled **Energy Record**. It uses the supplied white Midea PNG, a brief localized slogan, the requested rendered-heart credit and one sign-in action. The white form opens only when requested. A circular mask grows from the action into the white login surface; Back returns to the welcome. Existing sessions go straight to their protected destination; a required password change opens its form directly. Logout returns to the welcome after clearing the account workspace.

The slogan concerns manual reporting. The application does not remotely inspect physical meters. The credit remains “Made with ❤️ by gedxxe for Midea JRE Engineering Department”; the established reporting attribution is unchanged. Language selection and the public blank-reading template remain available before sign-in.

## Source and boundaries

Tech Text and Magnet are adapted from the official [React Bits source](https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696), pinned to that commit. This is a DOM/canvas adaptation for this website, not a React framework migration or a standalone port library. No React runtime, external font, WebGL engine or package is downloaded. The full **MIT + Commons Clause License Condition v1.0** is retained in [asset/licenses/react-bits.txt](../asset/licenses/react-bits.txt), with provenance in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The supplied logo retains separate brand rights.

welcome.css owns the hero and reveal styling. ui/welcome.js coordinates presentation with the existing account gates and loads ui/welcome-tech.js/ui/welcome-magnet.js separately. The effects have no account, meter, storage or API access. The original blue-logo reconstruction remains on the white login view, with its five-second hold and pause/replay controls.

## Motion and fallback

Text painting is capped at 30 fps and DPR 1.5. The CTA moves at most 10 pixels while its native button hit area stays fixed. Touch scrolling is not intercepted. Hidden tabs, offscreen text, manual pause and leaving the hero stop drawing; listeners and canvas resources are released when the hero closes. The white-login decoration pauses behind the hero and after authentication.

The welcome pause control freezes the optional effects. Reduced motion and data-motion="off" on #welcome-hero show the real HTML title and open the form immediately. A failed optional module or unsupported canvas keeps the static title and native button. Resize, preference changes or interruption during the reveal complete the transition safely. No animation completion is required for authentication. Forms retain their labels, autocomplete, focus order and service errors. Small/short screens use normal page scrolling.

The source footprint includes the supplied 260 kB PNG and about 50 kB of welcome scripts/styles. Neither changes database workload. These are bounded visual effects, not a guarantee of a particular frame rate on every device.

## Verification and rollback

Browser regressions cover click/keyboard entry, hidden and inert forms, circle transition interruption, reduced motion, pause, module/canvas failure, language selection, public templates, session/password gates, logout, protected deep links and desktop/mobile overflow. Visual review uses synthetic accounts. Existing calculation, draft, historian and monitoring suites remain required.

No database, session or saved-data migration is required. Revert through a normal PR to restore the previous welcome. Do not replace existing release tags or branches. See [release and rollback](releases.md).
