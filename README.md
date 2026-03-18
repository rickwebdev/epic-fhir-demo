# Epic FHIR Patient Portal

Next.js demo app using **SMART on FHIR** with the Epic FHIR R4 sandbox: patient login, dashboard (appointments, labs, medications, care team), and provider finder.

## Getting Started

1. Copy `.env.example` to `.env.local` and fill in your Epic app credentials and session secret.
2. In [Epic App Orchard](https://open.epic.com), create a non-production app and add the redirect URI `http://localhost:3000/api/auth/callback`. Enable the R4 APIs you need (Patient, Appointment, Observation, MedicationRequest, CareTeam, Practitioner, Location, etc.).
3. Run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect to Epic**, and sign in with a sandbox patient (e.g. fhircamila / epicepic1).

## Deploy on Vercel

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. Set the **Root Directory** to this folder (the one containing `package.json`) if the repo root is higher.
3. Add **Environment Variables** in Vercel (Project → Settings → Environment Variables):

   | Name | Description |
   |------|-------------|
   | `EPIC_CLIENT_ID` | Your Epic non-production client ID |
   | `EPIC_AUTH_URL` | `https://fhir.epic.com/interactive-fhir-oauth/oauth2/authorize` |
   | `EPIC_TOKEN_URL` | `https://fhir.epic.com/interactive-fhir-oauth/oauth2/token` |
   | `EPIC_FHIR_BASE` | `https://fhir.epic.com/interactive-fhir/r4/` |
   | `EPIC_REDIRECT_URI` | Your Vercel app callback, e.g. `https://your-app.vercel.app/api/auth/callback` |
   | `SESSION_SECRET` | Long random string (e.g. `openssl rand -base64 32`) |

4. In Epic App Orchard, add your **production** redirect URI: `https://your-app.vercel.app/api/auth/callback` (use the exact URL Vercel gives you).
5. Deploy. After the first deploy, use the real deployment URL to set `EPIC_REDIRECT_URI` and the Epic redirect URI if you used a placeholder.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [SMART on FHIR](https://www.hl7.org/fhir/smart-app-launch/)
- [Epic FHIR Sandbox](https://fhir.epic.com/)
