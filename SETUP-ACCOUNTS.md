# Turning on Starcast accounts

Starcast accounts let people sign in with Google and keep their saved spots, gear, observing log and settings on every device. They run on **Supabase** (free tier), which provides the sign-in and a Postgres database with PostGIS. GitHub Pages keeps hosting the app itself.

Until these steps are done, Starcast works exactly as before and the **Sign in** button stays hidden.

You'll create two free accounts: Supabase, and a Google Cloud project for the "Sign in with Google" button. Allow about 30 minutes.

---

## Part 1: Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (using your GitHub account is easiest).
2. Choose **New project**:
   - **Name:** `starcast`
   - **Database password:** generate one and save it in your password manager. Starcast doesn't need it, but you will if you ever connect GIS tools such as QGIS directly.
   - **Region:** an East US or Central US region (closest to Wisconsin)
3. Wait a minute or two for the project to start.
4. Open **SQL Editor** → **New query**. Paste in the whole of [`supabase/schema.sql`](supabase/schema.sql) from this repository and press **Run**. It should finish with "Success. No rows returned."
5. Open **Authentication** → **URL Configuration**:
   - **Site URL:** `https://krauskajames.github.io/Starcast/`
   - **Redirect URLs:** add `https://krauskajames.github.io/Starcast/**`. If Starcast later moves to your own domain (for example `starcast.krauskagis.com`), add that address here too.
6. Open **Authentication** → **Sign In / Providers** → **Google**. Leave this page open: you'll need its **Callback URL** in Part 2, and you'll paste Google's keys here at the end.

## Part 2: Google sign-in

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project named `Starcast`.
2. Search for and open **Google Auth Platform**, then press **Get started**:
   - **App name:** `Starcast`, plus your email as the support contact
   - **Audience:** **External**
   - Finish the remaining prompts.
3. Under **Data Access**, add the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are basic scopes, so Google doesn't need to review the app.
4. Under **Clients**, choose **Create client**:
   - **Application type:** Web application
   - **Authorized JavaScript origins:** `https://krauskajames.github.io`
   - **Authorized redirect URIs:** the **Callback URL** from the Supabase Google page (it looks like `https://abcdefgh.supabase.co/auth/v1/callback`)
   - Press **Create**, then copy the **Client ID** and **Client secret**.
5. Under **Audience**, press **Publish app**. While the app is in testing, only Google accounts you list as test users can sign in; publishing lets anyone sign in.
6. Back in Supabase on the **Google** provider page: turn it on, paste the **Client ID** and **Client secret**, and press **Save**.

## Part 3: Connect Starcast

In Supabase, open **Project Settings** → **API Keys** and copy two values:
- the **Project URL** (`https://….supabase.co`)
- the **Publishable key** (`sb_publishable_…`), or, if your project shows the older style, the **anon public** key

Send both to Claude, or paste them yourself at the top of `src/js/75-account.js` and run `npm run build`. Both are designed to be public; the security rules in the database keep each person's data private.

**Never share the `service_role` or secret key.** It bypasses all security and must not go into the app or the repository.

## Checking it works

1. Reload Starcast. A **Sign in** button appears at the top right.
2. Sign in with Google. You return to Starcast with your first name on the button.
3. In Supabase, open **Table Editor**: `user_state` has one row for you, and `saved_locations` lists your saved spots.
4. Open Starcast on your phone and sign in. Your spots, gear and log appear there too.

## How it behaves

- **First sign-in on a device:** that device's data is combined with your account's. Saved spots, gear profiles, log entries and forecast checks are merged, keeping everything from both sides. For simple settings such as theme or units, the account's value wins. The page reloads once to show the combined data.
- **After that:** every change is saved to your account within a couple of seconds. The account menu shows "Synced", or "Not synced yet; retrying" when offline.
- **Signing out** leaves a copy on that device.
- **"Delete my data from the cloud"** in the account menu removes your Starcast data from the database. To remove the Google sign-in record itself, delete the user under **Authentication** → **Users** in Supabase.
- **Not signed in:** Starcast works as before, keeping everything in the browser.

## Notes

- The free Supabase plan pauses projects after about a week with no activity. Opening Starcast while signed in counts as activity; if the project does pause, press **Restore** in the Supabase dashboard.
- Alerts still use the GitHub secret described in the README. Moving alerts into Supabase, so the app could manage them directly, is on the roadmap.
- `saved_locations` stores each spot as a PostGIS `geography(Point, 4326)` with a spatial index, so it can be queried by distance or used by GIS tools. There's an example query at the end of `supabase/schema.sql`.
