# Classroom

A lightweight teaching-planning workspace for classes and one-on-one sessions.

**Designed by: Alyssa × ChatGPT**

## Main features

- Seven-day weekly planner, including Saturday and Sunday
- One-on-one session workspace
- Dynamic **Bump** rescheduling for a lesson sequence
- Centralized links to Google Drive, slide decks, worksheets, websites, and videos
- Browser-based data storage using `localStorage`
- JSON data export for backup
- Responsive design for desktop and mobile

## Files

```text
classroom-app/
├── index.html
├── styles.css
├── app.js
├── README.md
├── .gitignore
└── assets/
    └── favicon.svg
```

## Run it on your computer

No installation is required.

1. Download or clone the repository.
2. Double-click `index.html`.
3. The app opens in your browser.

For the most reliable local preview, open the project with VS Code and use the **Live Server** extension.

## Upload to GitHub

1. Open your private GitHub repository.
2. Click **Add file → Upload files**.
3. Drag all files and the `assets` folder into the upload area.
4. Add a commit message such as `Add Classroom MVP`.
5. Click **Commit changes**.

GitHub Desktop is not required.

## Publish as a website with GitHub Pages

Repository settings and plan permissions determine whether a private repository can use GitHub Pages.

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Save.

## Important data note

This version stores lesson and material data in the current browser only. Clearing browser storage or opening the site on another device will not automatically transfer the data. Use **Export data** regularly to create a JSON backup.

A future version can add user login and cloud synchronization through Supabase or Firebase.
