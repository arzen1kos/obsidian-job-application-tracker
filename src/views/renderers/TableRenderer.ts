import { Notice, normalizePath, setIcon, TFolder } from "obsidian";
import { getDeadlineStatus, JobApplication, JobSortField } from "../../types";
import { getStatusClassName } from "../../constants";
import { UpdateStatusModal } from "../../modals/UpdateStatusModal";
import { JobTrackerView } from "../JobTrackerView";

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

		const columns: { label: string; field?: JobSortField }[] = [
			{ label: "Company", field: "company" },
			{ label: "Role", field: "role" },
			{ label: "Status", field: "status" },
			{ label: "Closing Date", field: "closingDate" },
			{ label: "Folder" },
			{ label: "JD" },
			{ label: "CVs" },
			{ label: "Cover Letters" },
			{ label: "Notes" },
			{ label: "Artefacts" },
		];

		for (const col of columns) {
			const isSorted = !!col.field && this.view.sortField === col.field;
			const ariaSort = isSorted ? (this.view.sortAscending ? "ascending" : "descending") : "none";
			const th = headerRow.createEl("th", {
				cls: col.field ? "job-tracker-sortable-th" : "",
				attr: col.field ? { role: "columnheader", "aria-sort": ariaSort, tabindex: "0" } : { role: "columnheader" },
			});
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
		}

		headerRow.createEl("th", { text: "Actions" });

		// Table Body
		const tbody = table.createEl("tbody");
		const displayedApps = apps.slice(0, this.displayedLimit);

		for (const app of displayedApps) {
			const deadlineStatus = getDeadlineStatus(app.closingDate);
			const tr = tbody.createEl("tr", { cls: `job-tracker-deadline-row deadline-${deadlineStatus}` });
			const artefacts = this.view.plugin.appService.getApplicationArtefacts(app);

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

			// Role
			tr.createEl("td", { text: app.role });

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

			const deadlineCell = tr.createEl("td", {
				text: app.closingDate || "—",
				cls: `job-tracker-deadline-cell deadline-${deadlineStatus}`,
				attr: { "aria-label": app.closingDate ? `Closing date ${app.closingDate}: ${deadlineStatus}` : "No closing date" },
			});
			if (!app.closingDate) deadlineCell.addClass("text-muted");

			this.renderFolderCell(tr.createEl("td"), app);
			this.renderArtefactCell(tr.createEl("td"), artefacts.filter((item) => item.type === "Job Description"), "JD");
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
				this.view.showCardMenu(e, app);
			};
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

	private renderFolderCell(container: HTMLElement, app: JobApplication): void {
		const path = app.applicationFolderPath;
		if (!path) {
			container.createSpan({ text: "—", cls: "text-muted" });
			return;
		}
		const folder = this.view.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(folder instanceof TFolder)) {
			container.createSpan({ text: `${path} (missing)`, cls: "job-tracker-missing-reference" });
			return;
		}
		const link = container.createEl("button", {
			text: path,
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
			text: `${label} (${items.length})`,
			cls: items.some((item) => item.exists === false) ? "job-tracker-missing-reference" : "job-tracker-artefact-link",
			attr: { "aria-label": `${items.length} ${label} artefact${items.length === 1 ? "" : " versions"}` },
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
