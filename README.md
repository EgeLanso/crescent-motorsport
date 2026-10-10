# Crescent Motorsport — fully manually managed team site

Premium black / white / silver responsive sim-racing site. No fake drivers or race results are preloaded. You create, edit and delete all content through the admin panel.

## Admin can manage

- **Drivers:** add, edit, delete; name, race number, role/tag, main car and optional car photo URL.
- **Race results:** add, edit, delete; driver, date, game, class, car, track, finish status, position, best lap, optional result link, optional photo link and notes.
- **Driver lap times:** add, edit, delete; driver, date, game, class, car, track, lap time, optional photo and notes.
- **Race calendar:** add, edit, delete; event name, date, time, game, class, track, participating drivers, car, optional information link and notes.
- **Automatic totals:** wins, starts and DNFs are calculated from race result records.

All saved data lives in Supabase and is shared with site visitors. GitHub Pages alone is static hosting and cannot securely store shared editable content.

## One-time setup

1. Create a project at [Supabase](https://supabase.com/).
2. In Supabase, open **SQL Editor** and run the entire `schema.sql` file. It creates empty tables; no drivers or results are pre-filled. The script also adds driver-car columns if you're upgrading the previous version.
3. Open **Authentication → Users** and create the admin user with your email and a strong unique password. Disable public sign-ups if you don't need them.
4. Copy that user's UUID from the Users screen.
5. At the bottom of `schema.sql`, copy the commented `insert into public.admin_users...` example into SQL Editor, replace `PASTE_AUTH_USER_UUID_HERE` with the real UUID, remove the leading `--`, and run it. Only add accounts you trust.
6. In **Project Settings → API** (or API Keys), copy the Project URL and the publishable/anon client key. Never use a `service_role` or secret key in browser code.
7. Open `app.js`. Replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` and `PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE` with the Project URL and publishable/anon key.
8. Upload the contents of the `crescent-motorsport` folder to the root of a GitHub repository. Enable **Settings → Pages** for the main branch/root.
9. Visit the site. The public page will have no drivers until you add them. Press **GİRİŞ** and log in with the authorized admin email/password. Only admins listed in `admin_users` can change data.

## Notes

- The admin panel button is visible in the header; visitors who aren't signed in as an authorized admin cannot use it to change anything. Hiding a panel is not security; Supabase Row Level Security enforces write permissions.
- Keep secret keys out of `app.js` and the public repository. The browser should contain only the publishable/anon key.
- Driver photos, race photos and lap photos are currently added as image URLs. A later upgrade can add direct file uploads through Supabase Storage.
- Wins = finished race at P1. Starts = every race except DNS. DNFs = records marked DNF.
- If you already ran the old schema, run this updated schema again in SQL Editor. It adds new tables and car fields; it does not delete your existing race results. Existing drivers remain until you remove them from the admin panel.
- Preview with a local static server (for example, VS Code Live Server) rather than opening `index.html` directly, because `app.js` is an ES module.
