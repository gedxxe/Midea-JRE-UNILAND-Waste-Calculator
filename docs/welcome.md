# Welcome screen

v0.11.17-alpha changes only the signed-out presentation: white space, large type, a short localized slogan, the original Midea logo and a clear sign-in form. The reference informs spacing and restrained movement; no Google, Nike or Adidas artwork, fonts or scripts are used.

The slogan describes manual reporting, not remote physical inspection. Operators still read the meters. The requested welcome credit is “Made with ❤️ by gedxxe for Midea JRE Engineering Department”; the established workspace/footer attribution remains intact.

## Motion and fallback

logo.css owns the welcome layout, a brief entrance and the existing 10-second reconstruction loop: assemble, hold the logo for five seconds, exit and repeat. ui/logo.js retains pause/replay and visibility controls. ui/welcome-field.js is dynamically loaded with an error catch; unsupported/blocked canvas or a failed decoration module never prevents the login form from working.

The decorative canvas uses no network, storage, account or readings. It draws at most 520 points (240 in narrow scenes), caps animation painting at 30 fps and caps pixel density at 1.5. Pointer response is confined to the decoration on fine pointers and never prevents touch scrolling. Hidden tabs, offscreen scenes, manual pause and established sessions stop its animation loop. Reduced motion and data-motion="off" show static decoration and an intact logo. No animation is an authentication gate.

All art is decorative except the original logo's accessible name. Forms keep labels, keyboard focus, autocomplete and existing status/error handling. English, Simplified Chinese and Indonesian copy use the existing language switch. The heart is a Unicode emoji with an accessible label and system emoji-font fallbacks. Layout uses normal page scrolling on short screens.

## Verification and limits

Browser regressions exercise login/logout and password gates, looping/hold/replay, pause, hidden tabs, reduced motion, motion-off, narrow screens, missing canvas and a failed decoration-module request. Visual checks use synthetic accounts and no operational data. Frame-rate and resolution bounds reduce work; they are not a guarantee for every device/browser or a claim of industrial certification.

See [release and rollback](releases.md). No database migration or new dependency is required.
