# DataVault

**A local-first data manager and embedded storage project** inspired by the Python `DataVault` implementation using SQLite and JSON.

DataVault includes a responsive browser dashboard (`index.html`) for managing records in the current browser and documentation for the separate Python/Java storage-engine versions.

> **Important:** The browser dashboard uses `localStorage`; it does not connect to the SQLite database used by the Python or Java program. GitHub Pages hosts static files and cannot run a Python/Java backend by itself.

## Features

- Responsive dark dashboard for mobile and desktop
- Create, edit, search, categorize, and delete records
- Values can be plain text or valid JSON (objects, arrays, numbers, booleans, and `null`)
- Creation and update timestamps
- JSON backup export and JSON import
- No external JavaScript libraries or build step
- Static hosting compatible with GitHub Pages

## Project structure

```text
DataVault/
├── index.html       # Responsive dashboard markup and styles
├── app.js           # Dashboard interactions and browser storage
└── README.md        # Project documentation
```

## Run locally

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Create a record, enter a key and category, and enter either plain text or valid JSON.
4. Use **Export JSON** to save a backup periodically.

The dashboard loads `app.js` for record management and stores data in the browser's `localStorage` for the site origin. Ensure `index.html` includes this script tag near the end of the body or in the head with `defer`:

```html
<script src="app.js" defer></script>
``` If browser/site data is cleared, local records may be lost. Export backups of important information.

## Publish on GitHub Pages from Android

1. Open your repository on GitHub in a mobile browser.
2. Add or upload `index.html` and `README.md` to the repository's root directory.
3. Commit the changes to your default branch (commonly `main`).
4. Open **Settings → Pages**.
5. Under build and deployment, choose **Deploy from a branch**.
6. Select your default branch and the `/ (root)` folder, then save.
7. Wait for deployment and open the Pages URL shown in the Settings page.

GitHub's interface can change; if you cannot see Pages, check that you have repository access and that Pages is available for that repository.

## Data format

The dashboard exports a JSON backup similar to:

```json
{
  "format": "DataVault JSON backup",
  "version": 1,
  "exportedAt": "2026-10-20T10:00:00.000Z",
  "records": [
    {
      "key": "project:example",
      "value": {
        "status": "active",
        "tags": ["demo", "notes"]
      },
      "category": "projects",
      "createdAt": "2026-10-20T10:00:00.000Z",
      "updatedAt": "2026-10-20T10:00:00.000Z"
    }
  ]
}
```

The import tool accepts either this backup object or a JSON array of records. Importing records with existing keys replaces those records. Only import JSON files you trust.

## Python SQLite version

The original Python design uses Python's standard-library `sqlite3` and `json` modules, so no third-party packages are required for the core engine.

```python
from data_vault import DataVault

vault = DataVault("vault.db")
vault.set("project:example", {"status": "active", "tags": ["demo", "notes"]}, "projects")

print(vault.get("project:example"))
print(vault.search("active"))
print(vault.list_all())
```

Run the Python CLI with:

```bash
python data_vault.py
```

The SQLite database file is created on the machine running Python. Store backups separately and protect the database file if it contains private information.

## Java SQLite version

The Java CLI uses JDBC. The JDK does not include an SQLite JDBC driver, so add the Xerial `sqlite-jdbc` dependency to your build or place the driver JAR on the classpath.

Example Maven dependency (version shown as an example; check Maven Central for the current stable release):

```xml
<dependency>
  <groupId>org.xerial</groupId>
  <artifactId>sqlite-jdbc</artifactId>
  <version>3.45.1.0</version>
</dependency>
```

Compile/run classpath separators differ by operating system:

```bash
# Linux/macOS
javac -cp ".:sqlite-jdbc-3.45.1.0.jar" DataVault.java
java -cp ".:sqlite-jdbc-3.45.1.0.jar" DataVault

# Windows
javac -cp ".;sqlite-jdbc-3.45.1.0.jar" DataVault.java
java -cp ".;sqlite-jdbc-3.45.1.0.jar" DataVault
```

Use a current supported driver version for new deployments.

## Security and reliability notes

- The browser dashboard is a convenience demo, not an encrypted password manager.
- Browser `localStorage` is not encrypted by this application. Do not store passwords, API keys, financial account details, or other highly sensitive secrets in it.
- The dashboard does not send data to a server, but anyone with access to the same browser profile may be able to inspect its records.
- JSON import is validated for basic structure but should only be used with files you trust.
- The SQLite implementation uses parameterized SQL statements in the provided design. Keep that practice when extending the code.
- A local database is not automatically a backup. Back up the database and test restoring backups.
- SQLite transactions help preserve database consistency, but no storage system can promise zero data loss under every hardware, filesystem, or operational failure.

## Roadmap ideas

- Connect a secured backend API to SQLite
- Add authentication and authorization for multi-user hosting
- Add encrypted backup support
- Add automated tests and CI checks
- Add pagination for very large record collections

## License

Choose a license before publishing if you want to specify reuse terms. For example, add an MIT `LICENSE` file and update this section to match your choice.
