# Deploying Nugget

The Vercel project "nugget" is connected to this GitHub repo (Settings → Git).
Every push or merge to `main` deploys to production at nugget-six.vercel.app.
Pull requests get preview deployments.

Manual fallback, from the repo folder: `vercel --prod --yes`
(In Windows Command Prompt, chain commands with `&&`, not `;`.)
