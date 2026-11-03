<div align="center">
  <img width="100" height="100" alt="obsidian-job-application-tracker-plugin" src="https://github.com/user-attachments/assets/262f8924-47ba-4e8a-aa38-161a360fd80a" />

# Job Application Tracker | Obsidian Plugin

  An all-in-one job application pipeline and career search command center for [Obsidian](https://obsidian.md). Track applications across customizable stages, manage contacts and interviews, link existing files and folders as application artefacts, and use Kanban, Table, List, Metrics, Gallery, and Company views.
  
  ~✦~
  
  ![License](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)
  ![Obsidian](https://img.shields.io/badge/Obsidian-%23483699.svg?style=for-the-badge&logo=obsidian&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=fff)
  
</div>

---

## ✨ Features

### 📊 Visual Dashboard with 6 View Modes

- **Kanban Board**: Drag-and-drop cards across pipeline stage columns (*Wishlist* ➔ *Applied* ➔ *Screening* ➔ *Interviewing* ➔ *Offer* ➔ *Accepted* / *Rejected* / *Withdrawn* / *Ghosted*). Moving cards instantly updates note frontmatter and logs timestamped status activity.
- **Table View**: Company, Role, Status, Closing Date, Folder, Job Description, CV versions, Cover Letter versions, Notes, and artefact counts. Sort by closing date, filter by deadline, and open linked files directly without exposing raw paths.
- **List View**: Compact card layout highlighting workplace type, compensation, follow-up deadlines, and next scheduled interviews.
- **Gallery View**: Status-accented cards for company, role, location, and closing date.
- **Company View**: Group applications by company, with counts and status breakdowns; search and filters apply here too.
- **Details pane**: Select an application to see its complete metadata and open linked artefacts.
- **Saved Views**: Save the current view mode, filters, and sort direction for quick reuse.
- **Metrics & Conversion Analytics**:
  - **Sankey Pipeline Diagram**: Pure native SVG vector Sankey diagram charting the flow from application sources through screening and interview stages to final outcomes (zero external dependencies, zero permission prompts).
  - **Key KPI Cards**: Total Applications, Active Pipeline, Response Rate (%), Interview Rate (%), Offer Rate (%), Total Contacts, and Interview Rounds.
  - **Pipeline Stage Breakdown**: Real-time distribution and progress bars of applications currently sitting in each stage.
  - **Source Performance**: Breakdown analyzing which platforms yield the highest interview and offer conversion rates.
  - **Recent Activity Timeline**: Timestamped audit trail of recent status transitions across all applications.

### 📝 Native Markdown Notes & Data Storage
- Each new application is saved as `Application.md` in its own role-first folder below your designated applications folder (`Applications/{Role - Company}/` by default).
- Creating an application requires exactly one Job Description source: a linked file or pasted text. Pasted content is saved as `Job Description.md`; a selected vault file is moved into the application folder when automatic artefact moving is enabled.
- New applications record `datePosted` (default: today); older notes without this field remain valid and are not backfilled.
- Zero vendor lock-in; fully compatible with Obsidian Search, Dataview, and graph view.
- New application notes show only Company, Role, Location, Closing Date, and Tags. Contacts, interviews, status history, and other metadata remain in frontmatter and dedicated views/modals.
- Initial notes and pasted job descriptions are created as standard Markdown files in the application folder. Existing long-form note bodies are preserved as `Application Notes.md` before the application note is simplified on first open.

### 📎 Filesystem-aware Artefacts

- Link vault-relative or absolute filesystem files and an optional application folder. Files outside the vault are opened with the operating system.
- Vault folder contents are discovered and refreshed on Obsidian file events. External folders are rescanned when the dashboard refreshes; external filesystem changes do not emit Obsidian Vault events.
- Job descriptions, CVs, cover letters, assessments, offers, contracts, and note files are represented as generic artefacts. CV and cover-letter versions remain independently accessible.
- File and folder selection opens the platform's native file chooser. If Obsidian does not expose the selected absolute path (for example on mobile/web), the picker falls back to Obsidian's searchable vault selector.
- **Automatically move artefacts** is enabled by default for vault files. It moves selected vault artefacts into the new application folder and updates references. External files are left untouched because moving them safely requires platform-specific permission; originals are never deleted.
- Legacy `jobDescriptionFile` links and note embeds continue to work; editing an application also writes the compatible artefact reference.

### 👥 Contacts & Recruiter Management

- Track recruiters, recruiting coordinators, hiring managers, teammates, executives, or custom roles.
- Record email addresses (clickable `mailto:`), phone numbers, LinkedIn profiles, and conversation notes.
- Seamlessly updates note frontmatter and the markdown body in real time.

### 🎯 Multi-Round Interview Tracker & Intelligence Hub

- Schedule multiple rounds per application (*Recruiter Screen*, *Technical Screen*, *Hiring Manager*, *System Design*, *Coding Challenge*, *Behavioral*, *Onsite / Panel*, *Executive / Final*, *Other*).
- **Auto-Status Advancement**: Scheduling a new interview automatically advances the application status to **`Interviewing`** (for active early-stage applications in *Wishlist*, *Applied*, or *Screening*, while preserving finalized outcomes like *Accepted*, *Rejected*, *Withdrawn*, or *Ghosted*).
- **Automated Prep Note Generator**: Instantly generates a dedicated prep note based on an editable template containing:
  - 🏢 Company Intelligence & Team Context
  - 🎯 Key Strengths & Role Alignment
  - 💡 STAR Stories (Situation, Task, Action, Result & Metric)
  - 🛠️ Technical & Architecture Focus Areas
  - 💰 Target Compensation & Range
  - ❓ Tailored Questions for Hiring Managers, Peers, and Recruiters
  - 📝 Post-Interview Debrief & Action Items
- Automatically links prep notes inside the main application note and opens them for immediate prep.
- **Interview Debrief Modal**: Log interview outcomes (`Completed` or `Cancelled`), record debrief notes, and advance the application stage.

### 🔍 Live Search, Filtering & Follow-ups

- Search across company names, roles, locations, workplace types, sources, compensation, and contact names with instant, debounced results.
- Filter by application stage and closing-date state. Closing dates are highlighted as overdue, due within 7 days, due within 14 days, later, or unspecified.
- Sort the table by closing date; deadline coloring refreshes periodically while the dashboard is open.

### ♿ Accessibility & Mobile Support

- **Full Keyboard Navigation**: Navigate view switcher tabs, Kanban cards, sortable Table headers, and status badges with <kbd>Tab</kbd>, <kbd>Enter</kbd>, and <kbd>Space</kbd>.
- **ARIA Standards**: Complete ARIA roles, `aria-selected`, and `aria-sort` indicators across all views.
- **Sidebar & Mobile Responsive**: Uses CSS Container Queries to seamlessly adapt layout when docked in sidebars or on mobile screens.

---

## 🚀 Installation

### Install from source

1. Install Node.js and clone this repository.
2. From the repository directory, run `npm install` and `npm run build`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into `<your-vault>/.obsidian/plugins/job-application-tracker/`.
4. In Obsidian, enable **Community plugins** and turn on **Job Application Tracker**. Restart Obsidian if the plugin does not appear.

For development, run `npm run dev` and load the same plugin folder in a test vault. Rebuild after source changes.

### Application and artefact workflow

1. Choose **Add Application**, enter the company and role, and select any configured tags.
2. The plugin creates a `{Company - Role}` folder under the configured Applications Folder and stores the application Markdown note there.
3. Use the Job Description or Artefacts controls to open the native file chooser. Select a type for generic artefacts; repeat to add multiple CVs, cover letters, or notes.
4. Link a folder when the application has a dedicated artefact directory. Vault contents refresh on Obsidian file events; use the dashboard Refresh action after external changes.
5. In Settings, configure tag options and whether to move vault artefacts into each new application folder. The default is enabled; external files are never moved.

The native chooser is an Electron desktop capability. The implementation uses the browser's native file/directory input, then reads Electron's exposed absolute file path when available. On mobile/web or builds that hide the absolute path, users can still select files and folders inside the vault via Obsidian's fuzzy selector. An empty external folder may not be selectable through the browser directory chooser; select a non-empty folder or link it from the vault.

## ⌨️ Commands & Shortcuts

Open the Obsidian Command Palette (<kbd>Cmd</kbd> + <kbd>P</kbd> or <kbd>Ctrl</kbd> + <kbd>P</kbd>) to access:

| Command | Description |
| :--- | :--- |
| `Job Application Tracker: Open tracker dashboard` | Opens the dashboard in your preferred default location |
| `Job Application Tracker: Open tracker dashboard in Main Center Tab` | Opens full-width in the central workspace (recommended for Kanban) |
| `Job Application Tracker: Open tracker dashboard in Sidebar` | Opens compact view in the right sidebar |
| `Job Application Tracker: Add new job application` | Create an application and browse to its optional folder and artefacts |
| `Job Application Tracker: Edit application details & attachments` | Edit application fields, browse folders, and manage linked artefacts |
| `Job Application Tracker: Update application status` | Fast status picker & activity log updater |
| `Job Application Tracker: Add contact to application` | Add recruiter/hiring manager info to an application |
| `Job Application Tracker: Add interview to application` | Schedule an interview round & create prep note |
| `Job Application Tracker: Log interview outcome / debrief` | Record debrief feedback and advance stage |
| `Job Application Tracker: Manage application (Contacts, Interviews & Details)` | Comprehensive overview & management modal |
| `Job Application Tracker: Delete application note` | Safely delete an application note and move to trash |

*Tip: When viewing any job application note, running these commands automatically pre-selects the active application.*

---

## ⚙️ Settings & Customization

Under **Settings** ➔ **Job Application Tracker**, you can configure:

- **Applications Folder**: Target folder where application notes are created (default: `Applications`).
- **Interview Notes Folder**: Subfolder for generated prep and debrief notes (default: `Applications/Interviews`).
- **Attachments Folder**: Retained for compatibility with older versions; the filesystem-linking workflow does not write files there.
- **Default View Location**: Main Tab (Center) or Sidebar when opening via ribbon icon or command.
- **Default Initial Status**: Default stage for new applications (default: `Applied`).
- **Application Sources**: Comma-separated list of sources (e.g. *LinkedIn, Referral, Company Website, Indeed, Wellfound, Otta*).
- **Automatically move artefacts into application folder**: Move linked vault files into each new application folder (enabled by default). External files are not moved.
- **Application tags**: Add, edit, reorder, and delete the selectable tag options used by application forms.
- **Hidden table columns**: Restore hidden attributes from the setting or the Table view's Restore columns button.
- **Interview Prep Note Template**: Full Markdown template supporting placeholders:
  - `{{company}}`
  - `{{role}}`
  - `{{roundName}}`
  - `{{date}}`
  - `{{time}}`
  - `{{interviewers}}`
  - `{{applicationNoteTitle}}`

---

## Filesystem-aware data model and migration

### Existing architecture and gaps

Applications are Markdown notes discovered by `ApplicationService` from the configured tracker folder. YAML frontmatter is the persisted source for status, contacts, interviews, and artefact references. `JobTrackerView` coordinates the Kanban, Table, List, Metrics, Gallery, and Company renderers. Legacy upload helpers and settings remain for compatibility, but current workflows link files instead of storing binaries in the plugin.

### Proposed data model

The application Markdown note remains the metadata record. New fields are optional for old notes:

```ts
type ArtefactType =
  | "Job Description" | "CV" | "Cover Letter" | "Interview Notes"
  | "Recruiter Notes" | "Follow-up Notes" | "General Notes"
  | "Portfolio" | "Assessment" | "Offer Letter" | "Contract" | "Custom";

interface ApplicationArtefact {
  id: string;
  type: ArtefactType;
  path: string;       // vault-relative path or absolute path outside the vault
  filename: string;
  createdAt: string;
  updatedAt: string;
}

interface JobApplication {
  datePosted?: string; // YYYY-MM-DD
  applicationFolderPath?: string;
  closingDate?: string; // YYYY-MM-DD
  artefacts: ApplicationArtefact[];
  // Existing application metadata, contacts, interviews, tags, and legacy JD field remain.
}
```

The implementation adds `datePosted` to `src/types.ts`. New records live at `Applications/{Role - Company}/Application.md` (or the configured applications folder), with their JD and linked vault artefacts colocated when automatic moving is enabled. Folder contents are discovered at read time from the vault, rather than duplicated as a second file inventory in plugin data. Explicit links remain in frontmatter so missing files can be shown and renamed links can be repaired.

### Obsidian events and migration

The plugin listens to Vault `create`, `delete`, and `rename` events and invalidates the application cache when a linked folder or tracked application changes. Vault folder scanning uses `Vault.getFiles()`; external folders use a guarded desktop filesystem scan when available. Vault path changes update persisted folder, artefact, and legacy JD paths. A periodic dashboard refresh recalculates date-dependent deadline colors. External filesystem changes are not observable through Obsidian events and appear after refreshing the dashboard.

Migration is additive and non-destructive:

1. Existing application notes, paths, statuses, contacts, interviews, body text, and `jobDescriptionFile` values remain in place; existing notes are not moved into the new per-application folder layout.
2. A legacy JD path is exposed as a Job Description artefact when reading old frontmatter; the embedded note section remains unchanged.
3. Older `Type | path` artefact strings are parsed into typed artefact records on load. On editing, artefacts are written to `artefacts` while `jobDescriptionFile` remains synchronized for older plugin versions.
4. Users can set `applicationFolderPath`; its current files are discovered automatically. The default auto-move option relocates linked vault files into a newly created application folder without overwriting existing names. External files are left untouched.
5. `closingDate` and `datePosted` are optional for legacy applications and are preserved as `YYYY-MM-DD`; newly created applications default `datePosted` to today.

### Dashboard and modal UX

The application editor exposes Closing Date and a guided file/folder workflow using the platform file chooser, falling back to searchable Obsidian fuzzy modals when absolute paths are unavailable. Job Description is managed separately; generic artefacts use a type dropdown and support multiple links per type. Each linked file can be opened, revealed, changed/relinked, or unlinked without deleting it. A folder picker links an application folder, whose contents are displayed in separate Job Description, CV, Cover Letter, Interview Notes, and Other Artefacts groups. Table headers provide context-menu actions for hiding and sorting columns; hidden columns can be restored in the Table view or Settings. Gallery, Company, saved views, multi-field filters, and the complete Details pane are also available.

The reusable `ArtefactEditor` uses native `<input type="file">` and directory selection dialogs on desktop, with fuzzy vault selectors as a fallback. `NewApplicationModal` and `EditApplicationModal` persist links through `ApplicationService`; `ManageApplicationModal` presents grouped read-only links; and `TableRenderer` exposes human-friendly counts and quick navigation. A missing persisted link offers relinking and unlinking, while a folder-discovered item remains in the folder collection if its explicit reference is removed.

Deadline state is computed from the local calendar date: red for past dates, orange for 0–7 days, yellow for 8–14 days, green for later dates, and grey when unspecified. The filter offers the same buckets and the closing-date header sorts the table.

### Implementation plan and trade-offs

The implementation retains the existing Obsidian plugin architecture and build tooling while adding native picker support, optional per-application folders, configurable tags, filtered/saved views, table column controls, Gallery and Company views, and legacy note-body preservation.

Trade-offs: vault references are robust across Obsidian rename events, while external references cannot be updated automatically when files move outside Obsidian. Native absolute-path access and external folder scanning are desktop/Electron capabilities; mobile and web builds fall back to vault selection. Moving an external file is intentionally avoided, and the browser-based directory dialog may not provide an absolute path for an empty folder.

---

## 📄 License

MIT © [cruisencode](https://github.com/cruisencode)
