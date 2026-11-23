# admin-extract-listing: Import a listing from a web page (AI)

Staff tool on the Approvals page (`/staff/admin-approvals.html`). An admin pastes the address of an
event, sale or dining-special page; this Supabase Edge Function reads the page, asks Claude to pull out
the listing details, and returns editable drafts. The admin checks each draft and saves it as an
admin-submitted listing (Approved or Pending). **Nothing is saved until the admin presses "Save listing".**

- Code: `supabase/functions/admin-extract-listing/index.ts`
- Supabase project: `dtyyptbqbwvwxvtexenr`
- AI model: Claude Opus 5.5 (`claude-opus-5-5`)
- Cost: roughly $0.05 to $0.10 per import, billed to the Anthropic account that owns the key

---

## Part A. One-time setup

### A1. Anthropic API key

1. Sign in at **console.anthropic.com**.
2. Make sure the account has a payment method or credit (Settings, Billing).
3. Go to **API Keys**, click **Create Key**, name it `welcome-georgina-import`, and copy the key
   (it starts with `sk-ant-`). It is shown only once.
4. Never paste the key into a chat, email, file or web page. It only goes into Supabase (A2).

### A2. Store the key in Supabase

1. Open **supabase.com/dashboard**, then the Welcome Georgina project
   (the browser address contains `dtyyptbqbwvwxvtexenr`).
2. Left sidebar: **Edge Functions**, then **Secrets**.
3. Add a secret:
   - Name: `ANTHROPIC_API_KEY` (exactly, capital letters, underscores)
   - Value: the key from A1
4. Save.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided by Supabase automatically; do not add them.

### A3. Deploy the function (dashboard, no command line)

1. In the same project: left sidebar **Edge Functions**, then **Functions**.
   You should see the existing `send-email` function in the list.
2. Click **Deploy a new function**, then **Via Editor**.
3. Function name: `admin-extract-listing`
   (exactly: lowercase, hyphens, no spaces, nothing added. The Approvals page calls this exact name.)
4. Delete all of the sample code in the editor.
5. Open `supabase/functions/admin-extract-listing/index.ts` on your computer, copy **all** of it, and paste
   it into the editor.
   To copy it in one step, run this in PowerShell:
   ```
   Get-Content -Raw "C:\Users\robel\WebProjects\welcomegeorgina-redesign\supabase\functions\admin-extract-listing\index.ts" | Set-Clipboard
   ```
6. Click **Deploy function**. Wait until it shows as deployed (usually under a minute).
7. Open the function's **Settings** (or Details): **Verify JWT / Enforce JWT verification** stays **ON**.
8. The function now appears in the Functions list as `admin-extract-listing`.

### A3 (alternative). Deploy with the command line

From PowerShell:
```
cd C:\Users\robel\WebProjects\welcomegeorgina-redesign
npx supabase login
npx supabase functions deploy admin-extract-listing --project-ref dtyyptbqbwvwxvtexenr
```
`npx supabase login` opens a browser to sign in once. Use this route or the dashboard route, not both.

### A4. Check it is live

Ask Claude to "check the import function", or check it yourself in a browser console / with curl:
a request **without** an admin sign-in must be refused with
`"Only signed-in admins can import listings."` (HTTP 403).
If the answer is `Requested function was not found` (HTTP 404), the name or project is wrong (see Troubleshooting).

The staff page itself must be the version that has the import panel (site package **v62.9 or later**).

---

## Part B. Using it

1. Sign in to the staff portal as an **admin** and open **Approvals Queue**.
2. Near the top, open **✨ Import a listing from a web page (AI)**.
3. Paste the page address. Best results come from **one listing's own page**, for example
   `https://www.georgina.ca/things-do/town-events/link-winter-market`, a restaurant's specials page,
   a store's sale page, or an Eventbrite event page.
4. Optional: set **Expecting** to Event, Sale or Dining special if you know which it is.
5. Click **Read page**. It takes about 10 to 40 seconds.
6. Each listing found appears as a **draft** (up to 12 per page). For each one:
   - Read the yellow **Check:** notes first (for example "Year not stated; assumed 2026").
   - Compare the date, time, price and address against the real page.
   - **Category** decides where it appears: events categories → Events; *Sale (Sales page)* → Sales;
     *Dining special (Dining page)* → Dining.
   - **Last day / ends** hides the listing after that date.
   - **Submitter email** defaults to your admin email.
   - **Save as**: *Approved (live now)* or *Pending (review later)*.
   - Click **Save listing**, or **Discard draft** to drop it.
7. Saved listings appear in the queue below straight away.

### What it does not do

- It does not save anything by itself, publish automatically, or send any emails.
- It cannot read pages that only show their content after JavaScript runs, or pages behind a login
  (Facebook, Instagram, some booking sites). Use the listing's own public web page instead.
- Calendar or landing pages that only link to events usually return "No listing found".
  Open the individual event and import that page.
- It only uses images that appear on the page; it never invents an image.

---

## Troubleshooting (messages shown in the import panel)

| Message | Meaning and fix |
|---|---|
| The import service is not installed yet | Function not deployed, or deployed under another name or project. Redo A3 with the exact name `admin-extract-listing` in project `dtyyptbqbwvwxvtexenr`. |
| Only signed-in admins can import listings | You are signed out or your account is not an admin. Sign in again with an admin account. |
| The AI key is not set up yet | Secret missing or misnamed. Redo A2 with the exact name `ANTHROPIC_API_KEY`, then deploy the function again. |
| The AI key was rejected | Key revoked, mistyped or the Anthropic account has no credit. Create a new key (A1), replace the secret (A2). |
| The AI service is busy | Rate limit. Wait a minute and try again. |
| That address is not a public website | Local, internal or private addresses are blocked on purpose. Use a normal public https:// page. |
| The website took too long to answer / answered with error 403, 404... | The site is slow, down or blocks automated reading. Try again later or use another page for the same listing. |
| The page had no readable text | The page needs JavaScript. Use a more specific or simpler page. |
| No listing found on that page | The page has no current event, sale or dining special, or only links to them. Open the specific listing page. |

## Updating the function later

Paste the new `index.ts` into the same function in the dashboard and click **Deploy** again
(or run the deploy command in A3 alternative). The secret does not need to be re-entered.

## Security notes

- Only admins can use it: the function checks the caller's own sign-in with the database's `is_admin()`.
- The page is fetched from Supabase's servers with a 15 second time limit and 2 MB size limit; redirects
  are followed at most 4 times and every hop is re-checked against the private-address block.
- Page content is treated as untrusted data; the AI is told never to follow instructions found in a page.
- The function never writes to the database. Saving happens in the browser with the admin's own
  session, under the normal database rules.
- To switch the feature off: delete the `ANTHROPIC_API_KEY` secret or the function in Supabase.
  The rest of the Approvals page keeps working.
