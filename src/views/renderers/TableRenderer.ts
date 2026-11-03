import { Menu, Notice, normalizePath, setIcon, TFolder } from "obsidian";
import { getDeadlineStatus, JobApplication, JobSortField, isAbsoluteFilePath } from "../../types";
import { getStatusClassName } from "../../constants";
import { UpdateStatusModal } from "../../modals/UpdateStatusModal";
import { JobTrackerView } from "../JobTrackerView";
import { sanitizeUrl } from "../../services/ApplicationService";

/**
 * Renderer for the Table view mode, providing sortable columns, status badges, and action menus.
 */
export class TableRenderer {
	private view: JobTrackerView;
	private displayedLimit = 50;

	constructor(view: JobTrackerView) {
		this.view = view;
	}

	resetPagination() {
		this.displayedLimit = 50;
	}

	/**
	 * Renders the full applications table with sortable headers.
	 */
	render(container: HTMLElement, apps: JobApplication[]) {
		const tableWrapper = container.createDiv({ cls: "job-tracker-table-wrapper" });
		const table = tableWrapper.createEl("table", {
			cls: "job-tracker-table",
			attr: { role: "grid", "aria-label": "Job Applications" },
		});

		// Table Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");

		const columns: { key: string; label: string; field: JobSortField }[] = [
			{ key: "jobDescription", label: "JD", field: "jobDescription" },
			{ key: "role", label: "Role", field: "role" },
			{ key: "company", label: "Company", field: "company" },
			{ key: "datePosted", label: "Date Posted", field: "datePosted" },
			{ key: "status", label: "Status", field: "status" },
			{ key: "jobUrl", label: "URL", field: "jobUrl" },
			{ key: "location", label: "Location", field: "location" },
			{ key: "tags", label: "Tags", field: "tags" },
			{ key: "closingDate", label: "Closing Date", field: "closingDate" },
			{ key: "folder", label: "Folder", field: "folder" },
			{ key: "cvs", label: "CVs", field: "cvs" },
			{ key: "coverLetters", label: "Cover Letters", field: "coverLetters" },
			{ key: "notes", label: "Notes", field: "notes" },
			{ key: "artefacts", label: "Artefacts", field: "artefacts" },
		];

		for (const col of columns) {
			const isSorted = !!col.field && this.view.sortField === col.field;
			const ariaSort = isSorted ? (this.view.sortAscending ? "ascending" : "descending") : "none";
			const th = headerRow.createEl("th", {
				cls: col.field ? "job-tracker-sortable-th" : "",
				attr: col.field ? { role: "columnheader", "aria-sort": ariaSort, tabindex: "0" } : { role: "columnheader" },
			});
			th.hidden = this.view.plugin.settings.hiddenTableColumns.includes(col.key);
			th.createSpan({ text: col.label });
			if (isSorted) {
				const sortIcon = th.createSpan({ cls: "job-tracker-sort-indicator" });
				setIcon(sortIcon, this.view.sortAscending ? "arrow-up" : "arrow-down");
			}
			if (!col.field) continue;
			const field = col.field;
			const handleSort = () => {
				if (this.view.sortField === field) {
					this.view.sortAscending = !this.view.sortAscending;
				} else {
					this.view.sortField = field;
					this.view.sortAscending = true;
				}
				this.view.renderContentOnly();
			};
			th.onclick = handleSort;
			th.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleSort();
				}
			};
			th.oncontextmenu = (event) => {
				event.preventDefault();
				const menu = new Menu();
				menu.addItem((item) => item
					.setTitle("Hide this attribute")
					.setIcon("eye-off")
					.onClick(() => {
						if (!this.view.plugin.settings.hiddenTableColumns.includes(col.key)) {
							this.view.plugin.settings.hiddenTableColumns.push(col.key);
							this.view.plugin.settings.tableColumnsInitialized = true;
							void this.view.plugin.saveSettings();
						}
						this.view.renderContentOnly();
					}));
				if (col.field) {
					menu.addSeparator();
					menu.addItem((item) => item.setTitle("Sort ascending").setIcon("arrow-up").onClick(() => {
						this.view.sortField = col.field!;
						this.view.sortAscending = true;
						this.view.renderContentOnly();
					}));
					menu.addItem((item) => item.setTitle("Sort descending").setIcon("arrow-down").onClick(() => {
						this.view.sortField = col.field!;
						this.view.sortAscending = false;
						this.view.renderContentOnly();
					}));
				}
				menu.showAtMouseEvent(event);
			};
		}

		headerRow.createEl("th", { text: "Actions" });
		if (this.view.plugin.settings.hiddenTableColumns.length > 0) {
			const restoreButton = tableWrapper.createEl("button", {
				text: "Restore columns",
				cls: "job-tracker-restore-columns",
			});
			restoreButton.onclick = () => {
				this.view.plugin.settings.hiddenTableColumns = [];
				this.view.plugin.settings.tableColumnsInitialized = true;
				void this.view.plugin.saveSettings();
				this.view.renderContentOnly();
			};
		}

		// Table Body
		const tbody = table.createEl("tbody");
		const displayedApps = apps.slice(0, this.displayedLimit);

		for (const app of displayedApps) {
			const deadlineStatus = getDeadlineStatus(app.closingDate);
			const tr = tbody.createEl("tr", { cls: `job-tracker-deadline-row deadline-${deadlineStatus}` });
			tr.onclick = () => {
				this.view.selectedApplication = app;
				this.view.renderContentOnly();
			};
			const artefacts = this.view.plugin.appService.getApplicationArtefacts(app);

			this.renderArtefactCell(tr.createEl("td"), artefacts.filter((item) => item.type === "Job Description"), "JD");
			tr.createEl("td", { text: app.role || "—" });

			// Company
			const tdCompany = tr.createEl("td", { cls: "job-tracker-td-company" });
			const cLink = tdCompany.createEl("a", {
				text: app.company,
				cls: "job-tracker-company-link",
				attr: { role: "link", tabindex: "0" },
			});
			cLink.onclick = () => { void this.view.openNote(app.filePath); };
			cLink.onkeydown = (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					void this.view.openNote(app.filePath);
				}
			};

			tr.createEl("td", { text: app.datePosted || "—", cls: app.datePosted ? "" : "text-muted" });

			// Status Badge
			const tdStatus = tr.createEl("td");
			const statusBadge = tdStatus.createSpan({
				text: app.status,
				cls: `job-tracker-status-badge ${getStatusClassName(app.status)}`,
				attr: { role: "button", tabindex: "0", "aria-label": `Change status: ${app.status}` },
			});
			statusBadge.onclick = () => {
				new UpdateStatusModal(this.view.app, this.view.plugin, app).open();
			};
			statusBadge.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					new UpdateStatusModal(this.view.app, this.view.plugin, app).open();
				}
			};

			this.renderUrlCell(tr.createEl("td"), app.jobUrl);
			tr.createEl("td", { text: app.location || "—", cls: app.location ? "" : "text-muted" });
			const applicationTags = (app.tags || []).filter((tag) => tag !== "job-application");
			tr.createEl("td", {
				text: applicationTags.map((tag) => `#${tag}`).join(", ") || "—",
				cls: applicationTags.length ? "job-tracker-table-tags" : "text-muted",
			});

			const deadlineCell = tr.createEl("td", {
				text: app.closingDate || "—",
				cls: `job-tracker-deadline-cell deadline-${deadlineStatus}`,
				attr: { "aria-label": app.closingDate ? `Closing date ${app.closingDate}: ${deadlineStatus}` : "No closing date" },
			});
			if (!app.closingDate) deadlineCell.addClass("text-muted");

			this.renderFolderCell(tr.createEl("td"), app);
			this.renderArtefactCell(tr.createEl("td"), artefacts.filter((item) => item.type === "CV"), "CV");
			this.renderArtefactCell(tr.createEl("td"), artefacts.filter((item) => item.type === "Cover Letter"), "Cover Letter");
			this.renderArtefactCell(
				tr.createEl("td"),
				artefacts.filter((item) => item.type.endsWith("Notes") || (item.type === "General Notes" && item.filename.toLowerCase().endsWith(".md"))),
				"Notes"
			);
			tr.createEl("td", {
				text: `${artefacts.length}`,
				cls: artefacts.some((item) => item.exists === false) ? "job-tracker-missing-reference" : "",
				attr: { "aria-label": `${artefacts.length} artefacts${artefacts.some((item) => item.exists === false) ? ", missing file reference" : ""}` },
			});

			// Actions
			const tdActions = tr.createEl("td", { cls: "job-tracker-td-actions" });
			const actionMenuBtn = tdActions.createEl("button", {
				cls: "job-tracker-action-btn",
				attr: { "aria-label": "Actions" },
			});
			setIcon(actionMenuBtn, "more-horizontal");
			actionMenuBtn.onclick = (e) => {
				e.stopPropagation();
				this.view.showCardMenu(e, app);
			};
			for (const [index, column] of columns.entries()) {
				if (this.view.plugin.settings.hiddenTableColumns.includes(column.key)) {
					if (headerRow.children.item(index) instanceof HTMLElement) {
						(headerRow.children.item(index) as HTMLElement).hidden = true;
					}
					(tr.children.item(index) as HTMLElement).hidden = true;
				}
			}
		}

		if (apps.length > this.displayedLimit) {
			const paginationDiv = container.createDiv({ cls: "job-tracker-pagination-bar" });
			paginationDiv.createSpan({
				text: `Showing ${displayedApps.length} of ${apps.length} applications`,
				cls: "job-tracker-pagination-info text-muted",
			});
			const remaining = apps.length - this.displayedLimit;
			const loadMoreBtn = paginationDiv.createEl("button", {
				text: `Load More (${Math.min(50, remaining)} more)`,
				cls: "job-tracker-load-more-btn mod-cta",
			});
			loadMoreBtn.onclick = () => {
				this.displayedLimit += 50;
				this.view.renderContentOnly();
			};
		}
	}

	private renderUrlCell(container: HTMLElement, rawUrl?: string): void {
		const url = sanitizeUrl(rawUrl);
		if (!url) {
			container.createSpan({ text: "—", cls: "text-muted" });
			return;
		}
		const link = container.createEl("a", {
			text: new URL(url).hostname,
			attr: { href: url, target: "_blank", rel: "noopener noreferrer", "aria-label": `Open job posting: ${url}` },
		});
		link.onclick = (event) => event.stopPropagation();
	}

	private renderFolderCell(container: HTMLElement, app: JobApplication): void {
		const path = app.applicationFolderPath;
		if (!path) {
			container.createSpan({ text: "—", cls: "text-muted" });
			return;
		}
		if (isAbsoluteFilePath(path)) {
			try {
				if (!require("fs").statSync(path).isDirectory()) throw new Error("not a folder");
			} catch {
				container.createSpan({ text: "⚠ Missing folder", cls: "job-tracker-missing-reference" });
				return;
			}
			const link = container.createEl("button", {
				text: `📁 ${path.split(/[\\/]/).filter(Boolean).pop() || "Open folder"}`,
				cls: "job-tracker-folder-link",
				attr: { "aria-label": "Open linked application folder outside the vault" },
			});
			link.onclick = () => { void this.view.openNote(path); };
			return;
		}
		const folder = this.view.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(folder instanceof TFolder)) {
			container.createSpan({ text: "⚠ Missing folder", cls: "job-tracker-missing-reference", attr: { "aria-label": `Linked folder not found: ${path}` } });
			return;
		}
		const link = container.createEl("button", {
			text: `📁 ${folder.name || "Open folder"}`,
			cls: "job-tracker-folder-link",
			attr: { "aria-label": `Open linked application folder ${path}` },
		});
		link.onclick = () => {
			const file = this.view.app.vault.getFiles().find((item) => item.path.startsWith(folder.path + "/"));
			if (file) void this.view.openNote(file.path);
			else new Notice(`The linked folder is empty: ${path}`);
		};
	}

	private renderArtefactCell(container: HTMLElement, items: JobApplication["artefacts"], label: string): void {
		if (items.length === 0) {
			container.createSpan({ text: "—", cls: "text-muted" });
			return;
		}
		const sorted = [...items].sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt) ||
			b.updatedAt.localeCompare(a.updatedAt) ||
			b.filename.localeCompare(a.filename)
		);
		const latest = sorted[0];
		const button = container.createEl("button", {
			text: `${items.some((item) => item.exists === false) ? "⚠ " : "✓ "}${label} (${items.length})`,
			cls: items.some((item) => item.exists === false) ? "job-tracker-missing-reference" : "job-tracker-artefact-link",
			attr: { "aria-label": `${items.length} ${label} artefact${items.length === 1 ? "" : " versions"}${items.some((item) => item.exists === false) ? ", missing file" : ""}` },
		});
		button.onclick = () => {
			if (latest.exists === false) {
				new Notice(`Linked file could not be found: ${latest.path}`);
				return;
			}
			void this.view.openNote(latest.path);
		};
		if (items.length > 1) {
			const details = container.createEl("details", { cls: "job-tracker-artefact-versions" });
			details.createEl("summary", { text: `View all ${items.length}` });
			for (const item of sorted) {
				const version = details.createEl("button", {
					text: `${item.filename}${item.exists === false ? " (missing)" : ""}`,
					cls: item.exists === false ? "job-tracker-missing-reference" : "job-tracker-artefact-link",
				});
				version.onclick = () => {
					if (item.exists === false) new Notice(`Linked file could not be found: ${item.path}`);
					else void this.view.openNote(item.path);
				};
			}
		}
	}
}
