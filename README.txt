KANDIL PACKAGING FORM - INSTALLABLE APP (PWA)

Upload this whole folder to any HTTPS static host (GitHub Pages, Netlify,
Cloudflare Pages, SharePoint/IIS with HTTPS ...), keeping this structure:

  index.html
  manifest.webmanifest
  sw.js
  icons/  (4 png files)

Open the link in Chrome or Edge -> an "Install app" button appears in the
program (PC + Android). iPhone/iPad: Share -> Add to Home Screen.

TO RELEASE A NEW VERSION: replace index.html only. Installed apps update by
themselves (on open, on return to the app, and every 15 min while open).
Do not rename index.html and do not edit sw.js.
