# Job Application Tracker

An all-in-one job application pipeline and career search command center for [Obsidian](https://obsidian.md). Track applications across customizable stages, manage key contacts and recruiters, schedule multi-round interview pipelines, link existing files and folders as application artefacts, track closing dates and follow-ups, and visualize your search pipeline with Kanban, Table, List, and Metrics views.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Obsidian](https://img.shields.io/badge/Obsidian-v1.7.2%2B-purple.svg)

---

## ✨ Features

### 📊 Visual Dashboard with 4 View Modes
- **Kanban Board**: Drag-and-drop cards across pipeline stage columns (*Wishlist* ➔ *Applied* ➔ *Screening* ➔ *Interviewing* ➔ *Offer* ➔ *Accepted* / *Rejected* / *Withdrawn* / *Ghosted*). Moving cards instantly updates note frontmatter and logs timestamped status activity.
- **Table View**: Company, Role, Status, Closing Date, Folder, Job Description, CV versions, Cover Letter versions, Notes, and artefact counts. Sort by closing date, filter by deadline, and open linked files directly without exposing raw paths.
- **List View**: Compact card layout highlighting workplace type, compensation, follow-up deadlines, and next scheduled interviews.
- **Metrics & Conversion Analytics**:
  - **Sankey Pipeline Diagram**: Pure native SVG vector Sankey diagram charting the flow from application sources through screening and interview stages to final outcomes (zero external dependencies, zero permission prompts).
  - **Key KPI Cards**: Total Applications, Active Pipeline, Response Rate (%), Interview Rate (%), Offer Rate (%), Total Contacts, and Interview Rounds.
  - **Pipeline Stage Breakdown**: Real-time distribution and progress bars of applications currently sitting in each stage.
  - **Source Performance**: Breakdown analyzing which platforms yield the highest interview and offer conversion rates.
  - **Recent Activity Timeline**: Timestamped audit trail of recent status transitions across all applications.

### 📝 Native Markdown Notes & Data Storage
- Each application is saved as a Markdown note with clean YAML frontmatter in your designated applications folder (`Job Applications/` by default).
- Zero vendor lock-in; fully compatible with Obsidian Search, Dataview, and graph view.
- Automatically generated note sections:
  - 📋 **Overview**: Role, Salary, Location, Workplace Model (Remote/Hybrid/On-site), Employment Type, Source, Closing Date, Application Folder, Follow-up Date, Job Posting link, Applied Date.
  - 👥 **Key Contacts**: Dynamic list of hiring managers, recruiters, coordinators.
  - 📅 **Interviews & Stages**: Chronological list of interview rounds linked to prep notes.
  - 📝 **Notes & Activity Log**: Timestamped audit trail of status updates and feedback.
  - 📄 **Job Description**: Native embedded PDF viewer or Markdown notes wrapped in default-collapsed callouts.

### 📎 Filesystem-aware Artefacts
- Link vault-relative files and an optional application folder. The plugin does not copy, move, rename, or store binary files.
- Folder contents are discovered from the Obsidian Vault and refreshed on file create, delete, and rename events.
- Job descriptions, CVs, cover letters, assessments, offers, contracts, and note files are represented as generic artefacts. CV and cover-letter versions remain independently accessible.
- File and folder selection uses Obsidian fuzzy-search modals over vault `TFile` and `TFolder` entries; paths are never entered manually in the application UI.
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
- **Applications Folder**: Target folder where application notes are created (default: `Job Applications`).
- **Interview Notes Folder**: Subfolder for generated prep and debrief notes (default: `Job Applications/Interviews`).
- **Attachments Folder**: Retained for compatibility with older versions; the filesystem-linking workflow does not write files there.
- **Default View Location**: Main Tab (Center) or Sidebar when opening via ribbon icon or command.
- **Default Initial Status**: Default stage for new applications (default: `Applied`).
- **Application Sources**: Comma-separated list of sources (e.g. *LinkedIn, Referral, Company Website, Indeed, Wellfound, Otta*).
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

Applications are Markdown notes discovered by `ApplicationService` from the configured tracker folder. YAML frontmatter is the persisted source for status, contacts, interviews, and legacy `jobDescriptionFile`; the service updates both frontmatter and generated note sections. `JobTrackerView` coordinates the Kanban, Table, List, and Metrics renderers. Previously the new/edit modals accepted uploads and `saveAttachment` wrote the binary into the plugin's configured attachments folder. The old model had no application-folder link, generic artefact type, CV history, or dedicated closing date; file refresh was also scoped mainly to tracker Markdown files.

### Proposed data model

The application Markdown note remains the database record. New fields are optional for old notes:

```ts
type ArtefactType =
  | "Job Description" | "CV" | "Cover Letter" | "Interview Notes"
  | "Recruiter Notes" | "Follow-up Notes" | "General Notes"
  | "Portfolio" | "Assessment" | "Offer Letter" | "Contract" | "Custom";

interface ApplicationArtefact {
  id: string;
  type: ArtefactType;
  path: string;       // vault-relative path, not a copied file
  filename: string;
  createdAt: string;
  updatedAt: string;
}

interface JobApplication {
  applicationFolderPath?: string;
  closingDate?: string; // YYYY-MM-DD
  artefacts: ApplicationArtefact[];
  // Existing application metadata, contacts, interviews, notes, and legacy JD field remain.
}
```

The implementation adds these fields to `src/types.ts`. Folder contents are discovered at read time from the vault, rather than duplicated as a second file inventory in plugin data. Explicit links remain in frontmatter so missing files can be shown and renamed links can be repaired.

### Obsidian events and migration

The plugin listens to Vault `create`, `delete`, and `rename` events and invalidates the application cache when a linked folder or tracked application changes. Folder scanning uses `Vault.getFiles()`, with metadata timestamps from `TFile.stat`; path changes update persisted folder, artefact, and legacy JD paths. A periodic dashboard refresh recalculates date-dependent deadline colors. Only files within the vault are accessible to these APIs; files outside the vault cannot be linked or monitored without a separate integration.

Migration is additive and non-destructive:

1. Existing application notes, statuses, contacts, interviews, body text, and `jobDescriptionFile` values remain in place.
2. A legacy JD path is exposed as a Job Description artefact when reading old frontmatter; the embedded note section remains unchanged.
3. Older `Type | path` artefact strings are parsed into typed artefact records on load. On editing, artefacts are written to `artefacts` while `jobDescriptionFile` remains synchronized for older plugin versions.
4. Users can set `applicationFolderPath`; its current files are discovered automatically. The plugin never migrates or removes those files.
5. `closingDate` is optional and is preserved as `YYYY-MM-DD`.

### Dashboard and modal UX

The application editor exposes Closing Date and a guided file/folder workflow using searchable Obsidian fuzzy modals. Job Description is managed separately; generic artefacts use a type dropdown, then a vault file picker, and support multiple links per type. Each linked file can be opened, revealed in the vault, changed/relinked, or unlinked without deleting the file. A folder picker links an application folder, whose contents are discovered and displayed in separate Job Description, CV, Cover Letter, Interview Notes, and Other Artefacts groups. The dashboard table lays out Company, Role, Status, Closing Date, Folder, JD, CVs, Cover Letters, Notes, Artefacts, and Actions using names, indicators, and counts rather than raw paths.

The reusable `ArtefactEditor` component uses `FuzzySuggestModal<TFile>` and `FuzzySuggestModal<TFolder>` backed by `Vault.getFiles()` and `Vault.getAllLoadedFiles()`. `NewApplicationModal` and `EditApplicationModal` own the editor value and persist its selections through `ApplicationService`; `ManageApplicationModal` presents grouped read-only links; and `TableRenderer` exposes human-friendly counts and quick navigation. A missing persisted link offers relinking and unlinking, while a folder-discovered item remains in the folder collection if its explicit reference is removed.

Deadline state is computed from the local calendar date: red for past dates, orange for 0–7 days, yellow for 8–14 days, green for later dates, and grey when unspecified. The filter offers the same buckets and the closing-date header sorts the table.

### Implementation plan and trade-offs

The changes are implemented in these increments: add backward-compatible types and parsing; persist optional folder, artefact, and closing-date metadata; add folder discovery and rename reconciliation; replace manual path entry with `FuzzySuggestModal`-based selection; add grouped artefact management, counts, and version navigation; and document the migration. The existing build and Obsidian plugin architecture are retained.

Trade-offs: path references are robust across vault rename events, but not against files renamed outside Obsidian or external processes that bypass Vault events. Folder scans are live and avoid stale duplicated records, but require a vault scan and only include vault contents. Type inference is filename-based for discovered files; explicit references can specify a type. Existing upload helper/settings remain available to avoid breaking older integrations but are no longer used by the new/edit workflow.

---

## 📄 License

MIT © [cruisencode](https://github.com/cruisencode)
