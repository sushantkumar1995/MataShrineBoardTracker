# Mata Shrine Board Tracker

Installable mobile-first PWA for facility inspections, corrective action, training and feedback. Hosted on GitHub Pages with Supabase providing authentication, the database, private photo storage and an email function. No .NET server or backend hosting account is needed.

Project: `sushantkumar1995/MataShrineBoardTracker`
Expected URL after deployment: https://sushantkumar1995.github.io/MataShrineBoardTracker/

## 1. Set up Supabase first

1. Open https://supabase.com/dashboard/project/qqtqtvkalceoiglpqtfc.
2. In **Authentication → Users**, create `sushantkumar1995@gmail.com` with your own password. Enable Auto Confirm if offered. Do not put the password in the code or GitHub. If that user already exists, keep it.
3. Open **SQL Editor → New query**. Paste the entire contents of `supabase/setup.sql` and click **Run**. The script creates the application tables, permission rules, functions, sample sectors and a private `ticket-photos` bucket. It makes the specified email the administrator, including if the user is created later.
4. Run this verification query:

```sql
select email, full_name, role from public.profiles;
```

Your account should have role `admin`. Other accounts default to `pending`.

Run setup.sql **once**, in a new project without tables with the same names. It is transactional: if it encounters an error, the installation rolls back. Do not delete existing application data to run it again. The API URL and publishable key you supplied are already in `src/config.js`. No secret or service role key belongs in the frontend.

## 2. Upload to GitHub and deploy

Create the repository named exactly **MataShrineBoardTracker** under **sushantkumar1995**. Use the **main** branch.

Upload the CONTENTS of this project folder to the repository root, rather than uploading its outer folder or the ZIP itself. Include:

- `src/`, `public/`, `supabase/`, `tests/`
- `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `README.md`
- `.github/workflows/pages.yml` (a hidden folder; GitHub needs this for deployment)
- `.gitignore`

If your file picker hides `.github`, use GitHub **Add file → Create new file**, name it `.github/workflows/pages.yml`, and paste the supplied workflow. Or upload with Git on a computer.

In **repository Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Open **Actions → Deploy PWA to GitHub Pages**. The workflow installs dependencies, builds and deploys the app automatically. If your first push occurred before enabling Pages, click **Run workflow** after enabling it.

The expected address is https://sushantkumar1995.github.io/MataShrineBoardTracker/ — this address is not live until you deploy.

Local development on a computer:

```bash
npm ci
npm run dev
```

Production checks:

```bash
npm test
npm run test:rls
npm run build
```

## 3. Configure login URLs

In Supabase **Authentication → URL Configuration**:

- Site URL: `https://sushantkumar1995.github.io/MataShrineBoardTracker/`
- Additional Redirect URL: `https://sushantkumar1995.github.io/MataShrineBoardTracker/`
- For local development only, add `http://localhost:5173/MataShrineBoardTracker/`.

Keep email confirmation enabled for public signup. New staff use **Request access** on the app, confirm their email and wait for approval. For a small pilot, you can also create confirmed users directly in Authentication → Users, with separate passwords. The app administrator approves their roles in **Administration → Team access**.

Supabase's built-in authentication email sender has limits. For real staff onboarding, configure your own SMTP service in Supabase Authentication settings. This is separate from ticket email configuration below.

## 4. Configure automatic ticket emails

Tickets and assignments work before email is configured. Notification events are recorded in the database, and the app shows pending or failed delivery rather than pretending email was sent.

The included **notify-ticket** Supabase Edge Function uses Resend. You do not host it yourself.

1. Create an account at https://resend.com. For a quick test, use `onboarding@resend.dev` and send only to the email associated with your Resend account. To email other staff, verify a sending domain in Resend and use an address on that domain.
2. Create a Resend API key. Keep it private.
3. In Supabase **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY`: your Resend API key.
   - `EMAIL_FROM`: for testing, `Shrine Tracker <onboarding@resend.dev>`; for normal use, your verified sender.
4. In **Edge Functions**, create/deploy a function named **notify-ticket**. Paste `supabase/functions/notify-ticket/index.ts` in its editor.
5. Disable gateway JWT verification for this function in its settings. This is intentional: the function validates the signed-in user's token itself with `auth.getUser()` before accessing any ticket. New Supabase publishable keys are not legacy JWT keys.
6. Deploy the function. The Supabase runtime supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not copy these secrets to GitHub. If using the CLI instead:

```bash
npx supabase login
npx supabase link --project-ref qqtqtvkalceoiglpqtfc
npx supabase functions deploy notify-ticket --no-verify-jwt
```

Set the two Resend secrets through the dashboard so they do not enter shell history.

In the app's **Administration → Email routing**, configure global or sector-specific recipients. The initial global recipient is `sushantkumar1995@gmail.com`. Notifications also include the reporter, assigned trainer and assigned groundstaff where present. For Resend sandbox testing, use your own email for all test accounts or test before adding other recipients.

The app invokes the function after ticket creation and each workflow action. Failed or interrupted deliveries can be retried with **Retry pending emails** on the ticket. Events persist independently of the app session. This version does not include an unattended retry scheduler. Idempotency keys and an atomic claim reduce duplicate delivery; provider idempotency windows still apply.

## 5. Configure actual sectors and facilities

The provided Demo Sector A / B and their facilities are sample configuration, not official Shrine Board location names. Rename the sectors, add real facilities and deactivate unused ones under Administration before field use. Configure issue dropdowns there as well.

## Roles and workflow

| Role | Access |
|---|---|
| Admin | All tickets, configuration, team approvals, training and reports |
| Reporter | Create tickets; see and comment on their own tickets |
| Trainer | Read tickets; claim open tickets; act on their own claimed tickets; record training |
| Groundstaff | See assigned tickets; upload completion evidence; submit completed work |
| Pending | Approval screen only |

Typical workflow: **Open → Under Review → Assigned → Awaiting Verification → Closed**.

- A trainer claims an open ticket, checks the facility and either assigns work or closes it with a reason.
- Groundstaff submit completion comments and photos.
- The trainer closes after verification or returns it to Assigned.
- Claims and actions use database row locks plus a ticket version to reject conflicting updates.
- Photos may be added before actions; closed tickets cannot receive new comments or photos.
- Roles are stored in a protected table, not trusted client metadata. Users cannot promote themselves.
- This version uses role-level access across the site; trainer access is not partitioned by assigned sectors.

## Training report

The training form includes the source PDF's date, site/location, safety/PPE, personal hygiene, cleaning science, chemical competency, chemical usage, tools and equipment, other topics, cleaning observations, team size, attendance, feedback score and feedback provider details. Male/female/common category is stored separately from cleanliness. Kitchen issues are supported in ticket reporting; the training observation checklist follows the PDF's washroom items.

## Offline operation

The app shell is cached after an online visit. Issue reports and compressed photos can be saved as drafts in IndexedDB on the device. Open **Overview → Saved drafts → Submit draft** after reconnecting. A draft gets the server creation date when it is submitted. A partially uploaded report remains a draft until photo upload completes; retry uses the same ticket ID to avoid duplicate tickets.

Offline drafts and cached records are local to the browser, account and device. They are not a server backup and can be lost if browser data is cleared or evicted. Use a dedicated staff device and submit promptly. Sign-out removes the account's cached records but keeps its drafts for later sign-in. Actions, training records and exports require connectivity. On iPhone use Safari → Share → Add to Home Screen; on Android use the browser's Install/Add to Home Screen action.

## Daily Excel reports with embedded photos

**Excel reports** exports a workbook for the chosen India date. It contains:

- Read Me / scope information.
- Tickets CREATED on that date, with their latest status.
- Full history for those tickets.
- Training reports whose report date matches.
- Photos embedded as actual Excel images, including completion evidence uploaded later.

The workbook downloads when a user requests it. A PWA cannot reliably generate daily background downloads while closed. Re-export an older date to include later ticket updates. Supabase remains the live source of truth; Excel editing/import is not supported. Access policies also apply to exports.

Photos are resized to at most 1280 pixels, converted to JPEG and capped at 1 MB each, with five photos per upload. The export stops if total photo bytes exceed 60 MB to avoid excessive mobile memory use. Photo count limits per upload do not cap a ticket's lifetime photo count. Daily reports should be downloaded on desktop when large.

## Operations and verification

Before field rollout, test with four separate accounts:

1. Reporter creates a photo ticket and receives a saved ticket number.
2. Trainer claims it; another trainer cannot take over the claimed ticket.
3. Trainer assigns groundstaff; that staff user sees the ticket after Refresh.
4. Groundstaff upload photos and mark Complete.
5. Trainer returns work or closes it; history records each action.
6. Export the creation date and open the workbook in Excel to inspect embedded images.
7. Confirm email delivery after configuring Resend.
8. Disconnect the phone, save a draft, reconnect and submit once.
9. Verify a pending user cannot read tickets or private photos.

The app refreshes on demand using the Refresh button. It does not subscribe to live updates in this first version. Monitor Supabase and Resend usage and their plan limits. Database backup does not include Storage image bytes; arrange separate database and Storage backups before sustained operational use.

The build and local tests can be validated without project administrator credentials. Live signup, installed RLS policies, Storage and mail need verification in your configured project. This package does not claim that your project was already configured or the GitHub repository already deployed.

Validation performed during preparation: production build, five workflow/date/escaping checks, PostgreSQL role and storage policy integration checks using an isolated PGlite database, browser flows and mobile layouts with a mocked Supabase API, and Excel image save/load. Live project configuration and email delivery still require the setup steps above.
