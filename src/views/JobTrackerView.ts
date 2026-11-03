import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	TFile,
	TFolder,
	debounce,
	Menu,
	normalizePath,
	Notice,
} from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { getDeadlineStatus, JobApplication, JobSortField, JobStatus, SavedTrackerView, isAbsoluteFilePath } from "../types";
import { sanitizeUrl } from "../services/ApplicationService";
import { VIEW_TYPE_JOB_TRACKER } from "../constants";
import { NewApplicationModal } from "../modals/NewApplicationModal";
import { UpdateStatusModal } from "../modals/UpdateStatusModal";
import { AddContactModal } from "../modals/AddContactModal";
import { AddInterviewModal } from "../modals/AddInterviewModal";
import { EditApplicationModal } from "../modals/EditApplicationModal";
import { ManageApplicationModal } from "../modals/ManageApplicationModal";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import { KanbanRenderer } from "./renderers/KanbanRenderer";
import { TableRenderer } from "./renderers/TableRenderer";
import { ListRenderer } from "./renderers/ListRenderer";
import { MetricsRenderer } from "./renderers/MetricsRenderer";
import { GalleryRenderer } from "./renderers/GalleryRenderer";
import { CompanyRenderer } from "./renderers/CompanyRenderer";

export type TrackerViewMode = "kanban" | "table" | "list" | "metrics" | "gallery" | "company";

export interface MetricsData {
	appHistories: { app: JobApplication; visited: string[] }[];
	totalApps: number;
	appliedTotal: number;
	wishlistCount: number;
	activeCount: number;
	responseRate: string;
	interviewRate: string;
	offerRate: string;
	totalContacts: number;
	totalInterviews: number;
	completedInterviews: number;
	respondedCount: number;
	interviewCount: number;
	offerCount: number;
	acceptedCount: number;
	sourceMap: Map<string, { total: number; interviews: number; offers: number }>;
	allHistoryEntries: { company: string; role: string; filePath: string; date: string; status: string; note?: string }[];
}

/**
 * Main dashboard view for the Job Application Tracker plugin, coordinating
 * Kanban, Table, List, and Metrics view modes with debounced search and filtering.
 */
export class JobTrackerView extends ItemView {
	plugin: JobApplicationTrackerPlugin;

	private currentMode: TrackerViewMode = "kanban";
	private searchQuery = "";
	private statusFilter = "All";
	private deadlineFilter = "All";
	private companyFilter = "All";
	private tagFilter = "All";
	private locationFilter = "All";
	private selectedSavedViewId = "";
	sortField: JobSortField = "dateApplied";
	sortAscending = false;
	applications: JobApplication[] = [];
	selectedApplication: JobApplication | null = null;

	private kanbanRenderer: KanbanRenderer;
	private tableRenderer: TableRenderer;
	private listRenderer: ListRenderer;
	private metricsRenderer: MetricsRenderer;
	private galleryRenderer: GalleryRenderer;
	private companyRenderer: CompanyRenderer;

	/** Incremental data version for metrics computation and caching */
	private dataVersion = 0;
	private metricsVersion = -1;
	private metricsCache: MetricsData | null = null;

	private headerEl: HTMLElement | null = null;
	private contentAreaEl: HTMLElement | null = null;
	private countBadgeEl: HTMLElement | null = null;
	private modeButtons: { mode: TrackerViewMode; btn: HTMLButtonElement }[] = [];
	private filterRowEl: HTMLElement | null = null;
	private statusSelectEl: HTMLSelectElement | null = null;
	private deadlineSelectEl: HTMLSelectElement | null = null;
	private companySelectEl: HTMLSelectElement | null = null;
	private tagSelectEl: HTMLSelectElement | null = null;
	private locationSelectEl: HTMLSelectElement | null = null;
	private savedViewSelectEl: HTMLSelectElement | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private searchClearEl: HTMLElement | null = null;

	private debouncedRefresh: () => void;
	private debouncedSearch: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: JobApplicationTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.kanbanRenderer = new KanbanRenderer(this);
		this.tableRenderer = new TableRenderer(this);
		this.listRenderer = new ListRenderer(this);
		this.metricsRenderer = new MetricsRenderer(this);
		this.galleryRenderer = new GalleryRenderer(this);
		this.companyRenderer = new CompanyRenderer(this);

		this.debouncedRefresh = debounce(
			() => {
				this.loadAndRender();
			},
			300,
			true
		);

		this.debouncedSearch = debounce(
			() => {
				this.tableRenderer.resetPagination();
				this.listRenderer.resetPagination();
				this.renderContentOnly();
			},
			200,
			false
		);
	}

	getViewType(): string {
		return VIEW_TYPE_JOB_TRACKER;
	}

	getDisplayText(): string {
		return "Job Applications";
	}

	getIcon(): string {
		return "briefcase";
	}

	async onOpen() {
		this.registerInterval(window.setInterval(() => this.renderContentOnly(), 60 * 60 * 1000));
		// Register vault & cache change listeners to auto-refresh view
		// Only respond to changes within the application or interview folders
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && (this.isTrackedFile(file) || this.isInLinkedApplicationFolder(file.path))) {
					this.debouncedRefresh();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && (this.isTrackedFile(file) || this.isInLinkedApplicationFolder(file.path))) {
					this.debouncedRefresh();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (
					(file instanceof TFile && (this.isTrackedFile(file) || this.isInLinkedApplicationFolder(file.path))) ||
					this.applications.some((a) => a.filePath === file.path || a.filePath.startsWith(file.path + "/"))
				) {
					this.debouncedRefresh();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const appFolder = normalizePath(this.plugin.settings.trackerFolderPath);
				if (
					(file instanceof TFile && (this.isTrackedFile(file) || this.isInLinkedApplicationFolder(file.path))) ||
					oldPath.startsWith(appFolder + "/") ||
					this.isInLinkedApplicationFolder(oldPath) ||
					this.isInLinkedApplicationFolder(file.path) ||
					this.plugin.appService.isReferencedPath(oldPath) ||
					this.plugin.appService.isReferencedPath(file.path) ||
					this.applications.some((a) => a.filePath === oldPath || a.filePath.startsWith(oldPath + "/"))
				) {
					this.debouncedRefresh();
				}
			})
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile && this.isTrackedFile(file)) this.debouncedRefresh();
			})
		);

		this.loadAndRender();
	}

	/**
	 * Checks if a file is within the tracked application folder or has job-application frontmatter.
	 */
	private isTrackedFile(file: TFile): boolean {
		return this.plugin.appService.isTrackedFile(file);
	}

	private isInLinkedApplicationFolder(path: string): boolean {
		return this.plugin.appService.isReferencedPath(path);
	}

	async onClose() {
		this.contentEl.empty();
		this.headerEl = null;
		this.contentAreaEl = null;
		this.countBadgeEl = null;
		this.filterRowEl = null;
		this.statusSelectEl = null;
		this.deadlineSelectEl = null;
		this.companySelectEl = null;
		this.tagSelectEl = null;
		this.locationSelectEl = null;
		this.savedViewSelectEl = null;
		this.searchInputEl = null;
		this.searchClearEl = null;
		this.modeButtons = [];
		this.metricsCache = null;
	}

	loadAndRender() {
		this.plugin.appService.invalidateCache();
		this.applications = this.plugin.appService.getAllApplications();
		this.dataVersion++;
		this.metricsCache = null;
		this.tableRenderer.resetPagination();
		this.listRenderer.resetPagination();
		this.render();
	}

	render() {
		const { contentEl } = this;
		if (!this.headerEl || !this.contentAreaEl || !contentEl.contains(this.headerEl)) {
			contentEl.empty();
			contentEl.addClass("job-tracker-view");
			this.headerEl = contentEl.createDiv({ cls: "job-tracker-header" });
			this.contentAreaEl = contentEl.createDiv({ cls: "job-tracker-content-area" });
			this.renderHeader(this.headerEl);
		} else {
			this.updateHeaderState();
		}

		this.renderContentOnly();
	}

	updateHeaderState() {
		if (this.countBadgeEl) {
			this.countBadgeEl.setText(`${this.applications.length} apps`);
		}
		for (const { mode, btn } of this.modeButtons) {
			const isActive = this.currentMode === mode;
			btn.classList.toggle("is-active", isActive);
			btn.setAttribute("aria-selected", `${isActive}`);
			btn.setAttribute("tabindex", isActive ? "0" : "-1");
		}
		if (this.filterRowEl) {
			this.filterRowEl.toggleClass("job-tracker-is-hidden", this.currentMode === "metrics");
		}
		if (this.searchInputEl && this.searchInputEl.value !== this.searchQuery) {
			this.searchInputEl.value = this.searchQuery;
		}
		if (this.searchClearEl) {
			this.searchClearEl.toggleClass("job-tracker-is-hidden", !this.searchQuery);
		}
		if (this.deadlineSelectEl && this.deadlineSelectEl.value !== this.deadlineFilter) {
			this.deadlineSelectEl.value = this.deadlineFilter;
		}
		if (this.statusSelectEl && this.statusSelectEl.value !== this.statusFilter) this.statusSelectEl.value = this.statusFilter;
		if (this.companySelectEl && this.companySelectEl.value !== this.companyFilter) this.companySelectEl.value = this.companyFilter;
		if (this.tagSelectEl && this.tagSelectEl.value !== this.tagFilter) this.tagSelectEl.value = this.tagFilter;
		if (this.locationSelectEl && this.locationSelectEl.value !== this.locationFilter) this.locationSelectEl.value = this.locationFilter;
		if (this.savedViewSelectEl && this.savedViewSelectEl.value !== this.selectedSavedViewId) {
			this.savedViewSelectEl.value = this.selectedSavedViewId;
		}
	}

	renderHeader(container: HTMLElement) {
		this.modeButtons = [];

		// Top row: Title + Actions
		const topRow = container.createDiv({ cls: "job-tracker-header-top" });
		const titleContainer = topRow.createDiv({ cls: "job-tracker-title-container" });
		const titleIcon = titleContainer.createSpan({ cls: "job-tracker-title-icon" });
		setIcon(titleIcon, "briefcase");
		titleContainer.createEl("h3", { text: "Job Tracker", cls: "job-tracker-title" });
		this.countBadgeEl = titleContainer.createSpan({
			text: `${this.applications.length} apps`,
			cls: "job-tracker-count-badge",
		});

		const headerActions = topRow.createDiv({ cls: "job-tracker-header-actions" });

		// Mode switcher buttons
		const viewSwitcher = headerActions.createDiv({
			cls: "job-tracker-view-switcher",
			attr: { role: "tablist", "aria-label": "View mode" },
		});

		const modes: { mode: TrackerViewMode; label: string; icon: string }[] = [
			{ mode: "kanban", label: "Kanban View", icon: "columns-3" },
			{ mode: "table", label: "Table View", icon: "table" },
			{ mode: "list", label: "List View", icon: "list" },
			{ mode: "metrics", label: "Metrics & Statistics", icon: "bar-chart-3" },
			{ mode: "gallery", label: "Gallery View", icon: "layout-grid" },
			{ mode: "company", label: "Company View", icon: "building-2" },
		];

		for (const { mode, label, icon } of modes) {
			const isActive = this.currentMode === mode;
			const btn = viewSwitcher.createEl("button", {
				cls: `job-tracker-mode-btn ${isActive ? "is-active" : ""}`,
				attr: {
					"aria-label": label,
					role: "tab",
					"aria-selected": `${isActive}`,
					tabindex: isActive ? "0" : "-1",
				},
			});
			setIcon(btn, icon);
			this.modeButtons.push({ mode, btn });
			btn.onclick = () => {
				this.currentMode = mode;
				this.updateHeaderState();
				this.renderContentOnly();
			};

		}

		// Refresh button
		const refreshBtn = headerActions.createEl("button", {
			cls: "job-tracker-icon-btn",
			attr: { "aria-label": "Refresh applications" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.onclick = () => this.loadAndRender();

		const saveViewBtn = headerActions.createEl("button", {
			cls: "job-tracker-icon-btn",
			text: "Save view",
			attr: { "aria-label": "Save current view" },
		});
		saveViewBtn.onclick = () => {
			const view: SavedTrackerView = {
				id: crypto.randomUUID(),
				name: `View ${this.plugin.settings.savedViews.length + 1}`,
				mode: this.currentMode,
				search: this.searchQuery,
				status: this.statusFilter,
				company: this.companyFilter,
				tags: this.tagFilter === "All" ? [] : [this.tagFilter],
				location: this.locationFilter,
				deadline: this.deadlineFilter,
				sortField: this.sortField,
				sortAscending: this.sortAscending,
			};
			this.plugin.settings.savedViews.push(view);
			this.selectedSavedViewId = view.id;
			this.savedViewSelectEl?.createEl("option", { value: view.id, text: view.name });
			void this.plugin.saveSettings();
			this.render();
		};

		// Add Application CTA button
		const addBtn = headerActions.createEl("button", {
			cls: "mod-cta job-tracker-add-btn",
			text: "+ Add Application",
		});
		addBtn.onclick = () => {
			new NewApplicationModal(this.app, this.plugin).open();
		};

		// Filter & Search bar row (only for non-metrics view)
		this.filterRowEl = container.createDiv({ cls: "job-tracker-filter-row" });
		this.filterRowEl.toggleClass("job-tracker-is-hidden", this.currentMode === "metrics");

		// Search input
		const searchWrapper = this.filterRowEl.createDiv({ cls: "job-tracker-search-wrapper" });
		const searchIcon = searchWrapper.createSpan({ cls: "job-tracker-search-icon" });
		setIcon(searchIcon, "search");
		this.searchInputEl = searchWrapper.createEl("input", {
			type: "text",
			placeholder: "Search company, role, location...",
			cls: "job-tracker-search-input",
			value: this.searchQuery,
			attr: { "aria-label": "Search applications" },
		});
		this.searchInputEl.oninput = (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			if (this.searchClearEl) {
				this.searchClearEl.toggleClass("job-tracker-is-hidden", !this.searchQuery);
			}
			this.debouncedSearch();
		};

		this.searchClearEl = searchWrapper.createSpan({
			cls: "job-tracker-search-clear",
			attr: { "aria-label": "Clear search", role: "button", tabindex: "0" },
		});
		setIcon(this.searchClearEl, "x");
		this.searchClearEl.toggleClass("job-tracker-is-hidden", !this.searchQuery);
		this.searchClearEl.onclick = () => {
			this.searchQuery = "";
			if (this.searchInputEl) this.searchInputEl.value = "";
			this.updateHeaderState();
			this.renderContentOnly();
		};
		this.searchClearEl.onkeydown = (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				this.searchQuery = "";
				if (this.searchInputEl) this.searchInputEl.value = "";
				this.updateHeaderState();
				this.renderContentOnly();
			}
		};

		// Status filter dropdown
		this.statusSelectEl = this.filterRowEl.createEl("select", {
			cls: "job-tracker-filter-select",
			attr: { "aria-label": "Filter by status" },
		});
		this.statusSelectEl.createEl("option", { text: "All Statuses", value: "All" });
		for (const st of this.plugin.settings.statuses) {
			const opt = this.statusSelectEl.createEl("option", { text: st, value: st });
			if (st === this.statusFilter) opt.selected = true;
		}
		this.statusSelectEl.onchange = (e) => {
			this.statusFilter = (e.target as HTMLSelectElement).value;
			this.renderContentOnly();
		};

		this.deadlineSelectEl = this.filterRowEl.createEl("select", {
			cls: "job-tracker-filter-select",
			attr: { "aria-label": "Filter by closing date" },
		});
		for (const [value, label] of [
			["All", "All Deadlines"],
			["overdue", "Closing date passed"],
			["within-7-days", "Due in 7 days"],
			["within-14-days", "Due in 14 days"],
			["later", "Due later"],
			["none", "No closing date"],
		]) {
			const option = this.deadlineSelectEl.createEl("option", { value, text: label });
			option.selected = this.deadlineFilter === value;
		}
		this.deadlineSelectEl.onchange = (e) => {
			this.deadlineFilter = (e.target as HTMLSelectElement).value;
			this.renderContentOnly();
		};

		this.savedViewSelectEl = this.filterRowEl.createEl("select", {
			cls: "job-tracker-filter-select",
			attr: { "aria-label": "Load saved view" },
		});
		this.savedViewSelectEl.createEl("option", { value: "", text: "Saved views" });
		for (const savedView of this.plugin.settings.savedViews) {
			this.savedViewSelectEl.createEl("option", { value: savedView.id, text: savedView.name });
		}
		this.savedViewSelectEl.value = this.selectedSavedViewId;
		this.savedViewSelectEl.onchange = () => {
			const savedView = this.plugin.settings.savedViews.find((item) => item.id === this.savedViewSelectEl?.value);
			if (savedView) this.applySavedView(savedView);
		};
		this.companySelectEl = this.addFilterSelect(
			"Filter by company",
			"All Companies",
			[...new Set(this.applications.map((application) => application.company).filter(Boolean))],
			this.companyFilter,
			(value) => { this.companyFilter = value; }
		);
		this.tagSelectEl = this.addFilterSelect(
			"Filter by tag",
			"All Tags",
			[...new Set(this.applications.flatMap((application) => (application.tags || []).filter((tag) => tag !== "job-application")))],
			this.tagFilter,
			(value) => { this.tagFilter = value; }
		);
		this.locationSelectEl = this.addFilterSelect(
			"Filter by location",
			"All Locations",
			[...new Set(this.applications.map((application) => application.location || "").filter(Boolean))],
			this.locationFilter,
			(value) => { this.locationFilter = value; }
		);
	}

	private addFilterSelect(
		ariaLabel: string,
		allLabel: string,
		values: string[],
		selected: string,
		onChange: (value: string) => void
	): HTMLSelectElement {
		const select = this.filterRowEl!.createEl("select", {
			cls: "job-tracker-filter-select",
			attr: { "aria-label": ariaLabel },
		});
		select.createEl("option", { value: "All", text: allLabel });
		for (const value of values.sort((a, b) => a.localeCompare(b))) {
			select.createEl("option", { value, text: value });
		}
		select.value = selected;
		select.onchange = () => {
			onChange(select.value);
			this.renderContentOnly();
		};
		return select;
	}

	private applySavedView(savedView: SavedTrackerView): void {
		this.currentMode = savedView.mode;
		this.searchQuery = savedView.search || "";
		this.statusFilter = savedView.status;
		this.companyFilter = savedView.company;
		this.tagFilter = savedView.tags[0] || "All";
		this.locationFilter = savedView.location;
		this.deadlineFilter = savedView.deadline;
		this.sortField = savedView.sortField;
		this.sortAscending = savedView.sortAscending;
		this.selectedSavedViewId = savedView.id;
		this.render();
	}

	renderContentOnly() {
		const contentArea = this.contentAreaEl ?? this.contentEl.querySelector<HTMLElement>(".job-tracker-content-area");
		if (contentArea instanceof HTMLElement) {
			contentArea.empty();
			const filteredApps = this.getFilteredAndSortedApps();
			const selectedIsVisible = !!this.selectedApplication &&
				filteredApps.some((app) => app.filePath === this.selectedApplication?.filePath);
			contentArea.toggleClass("job-tracker-has-details", selectedIsVisible);
			if (filteredApps.length === 0) {
				if (this.applications.length === 0) {
					this.renderEmptyState(contentArea);
				} else {
					this.renderNoSearchResults(contentArea);
				}
				return;
			}
			const mainContent = selectedIsVisible
				? contentArea.createDiv({ cls: "job-tracker-main-content" })
				: contentArea;
			if (this.currentMode === "kanban") {
				this.kanbanRenderer.render(mainContent, filteredApps);
			} else if (this.currentMode === "table") {
				this.tableRenderer.render(mainContent, filteredApps);
			} else if (this.currentMode === "list") {
				this.listRenderer.render(mainContent, filteredApps);
			} else if (this.currentMode === "metrics") {
				this.metricsRenderer.render(mainContent);
			} else if (this.currentMode === "gallery") {
				this.galleryRenderer.render(mainContent, filteredApps);
			} else {
				this.companyRenderer.render(mainContent, filteredApps);
			}
			if (selectedIsVisible && this.selectedApplication) {
				this.renderDetailsPane(contentArea, this.selectedApplication);
			}
		}
	}

	getFilteredAndSortedApps(): JobApplication[] {
		let result = [...this.applications];

		// Status Filter
		if (this.statusFilter !== "All") {
			result = result.filter((a) => a.status === this.statusFilter);
		}
		if (this.deadlineFilter !== "All") {
			result = result.filter((application) => getDeadlineStatus(application.closingDate) === this.deadlineFilter);
		}
		if (this.companyFilter !== "All") result = result.filter((application) => application.company === this.companyFilter);
		if (this.tagFilter !== "All") result = result.filter((application) => application.tags?.includes(this.tagFilter));
		if (this.locationFilter !== "All") result = result.filter((application) => application.location === this.locationFilter);

		// Search filter
		if (this.searchQuery.trim()) {
			const q = this.searchQuery.toLowerCase().trim();
			result = result.filter(
				(a) =>
					(a.company ?? "").toLowerCase().includes(q) ||
					(a.role ?? "").toLowerCase().includes(q) ||
					(a.location && a.location.toLowerCase().includes(q)) ||
					(a.source && a.source.toLowerCase().includes(q)) ||
					(a.salary && a.salary.toLowerCase().includes(q)) ||
					(a.applicationFolderPath && a.applicationFolderPath.toLowerCase().includes(q)) ||
					this.plugin.appService.getApplicationArtefacts(a).some((item) => item.filename.toLowerCase().includes(q)) ||
					(a.contacts?.some(
						(c) =>
							c.name.toLowerCase().includes(q) ||
							(c.email && c.email.toLowerCase().includes(q))
					) ?? false)
			);
		}

		// Sorting
		result.sort((a, b) => {
			if (this.sortField === "status") {
				const statuses = this.plugin.settings.statuses;
				const idxA = statuses.indexOf(a.status);
				const idxB = statuses.indexOf(b.status);
				const orderA = idxA !== -1 ? idxA : statuses.length;
				const orderB = idxB !== -1 ? idxB : statuses.length;
				if (orderA !== orderB) {
					return this.sortAscending ? orderA - orderB : orderB - orderA;
				}
			} else if (this.sortField === "salary") {
				const numA = this.parseSalary(a.salary);
				const numB = this.parseSalary(b.salary);
				if (numA !== null && numB !== null) {
					if (numA !== numB) {
						return this.sortAscending ? numA - numB : numB - numA;
					}
				} else if (numA !== null) {
					return this.sortAscending ? -1 : 1;
				} else if (numB !== null) {
					return this.sortAscending ? 1 : -1;
				}
			} else if (this.sortField === "closingDate") {
				const dateA = a.closingDate || "";
				const dateB = b.closingDate || "";
				if (!dateA || !dateB) {
					if (dateA !== dateB) return dateA ? -1 : 1;
				}
				if (dateA !== dateB) return this.sortAscending ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
			}

			const countFor = (application: JobApplication): number => {
				const artefacts = this.plugin.appService.getApplicationArtefacts(application);
				if (this.sortField === "jobDescription") return artefacts.some((item) => item.type === "Job Description") ? 1 : 0;
				if (this.sortField === "cvs") return artefacts.filter((item) => item.type === "CV").length;
				if (this.sortField === "coverLetters") return artefacts.filter((item) => item.type === "Cover Letter").length;
				if (this.sortField === "notes") return artefacts.filter((item) => item.type.endsWith("Notes") || item.type === "General Notes").length;
				return artefacts.length;
			};
			const countFields = ["jobDescription", "cvs", "coverLetters", "notes", "artefacts"];
			if (countFields.includes(this.sortField)) {
				const difference = countFor(a) - countFor(b);
				if (difference !== 0) return this.sortAscending ? difference : -difference;
			}
			const rawA = this.sortField === "folder" ? a.applicationFolderPath : a[this.sortField as Exclude<JobSortField, "folder" | "jobDescription" | "cvs" | "coverLetters" | "notes" | "artefacts">];
			const rawB = this.sortField === "folder" ? b.applicationFolderPath : b[this.sortField as Exclude<JobSortField, "folder" | "jobDescription" | "cvs" | "coverLetters" | "notes" | "artefacts">];
			const valA = typeof rawA === "string" ? rawA.toLowerCase() : "";
			const valB = typeof rawB === "string" ? rawB.toLowerCase() : "";

			if (valA < valB) return this.sortAscending ? -1 : 1;
			if (valA > valB) return this.sortAscending ? 1 : -1;
			return 0;
		});

		return result;
	}

	private renderDetailsPane(container: HTMLElement, application: JobApplication): void {
		const pane = container.createDiv({ cls: "job-tracker-details-pane" });
		const title = pane.createDiv({ cls: "job-tracker-details-heading" });
		title.createEl("h2", { text: `${application.company} - ${application.role}` });
		const close = title.createEl("button", { text: "Close", cls: "job-tracker-details-close" });
		close.onclick = () => {
			this.selectedApplication = null;
			this.renderContentOnly();
		};
		const details: [string, string][] = [
			["Status", application.status],
			["Applied Date", application.dateApplied || "—"],
			["Follow Up Date", application.followUpDate || "—"],
			["Tags", (application.tags || []).join(", ") || "—"],
			["Folder", application.applicationFolderPath || "—"],
			["Company", application.company],
			["Role", application.role],
			["Location", application.location || "—"],
			["Closing Date", application.closingDate || "—"],
		];
		for (const [label, value] of details) {
			const row = pane.createDiv({ cls: "job-tracker-details-row" });
			row.createEl("strong", { text: label });
			row.createSpan({ text: value });
			if (label === "Folder" && application.applicationFolderPath) {
				const openFolder = row.createEl("button", { text: "Open folder" });
				openFolder.onclick = () => this.openApplicationFolder(application.applicationFolderPath!);
			}
		}
		const artefacts = this.plugin.appService.getApplicationArtefacts(application);
		pane.createEl("h3", { text: `Artefacts (${artefacts.length})` });
		for (const artefact of artefacts) {
			const button = pane.createEl("button", {
				text: `${artefact.exists === false ? "⚠ " : ""}${artefact.type}: ${artefact.filename}`,
				cls: artefact.exists === false ? "job-tracker-missing-reference" : "job-tracker-artefact-link",
			});
			button.onclick = () => {
				if (artefact.exists === false) new Notice(`Linked file could not be found: ${artefact.path}`);
				else void this.openNote(artefact.path);
			};
		}
	}

	async openApplicationFolder(path: string): Promise<void> {
		if (isAbsoluteFilePath(path)) {
			await this.openNote(path);
			return;
		}
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(folder instanceof TFolder)) {
			new Notice(`The linked folder could not be found: ${path}`);
			return;
		}
		const file = this.app.vault.getFiles().find((item) => item.path.startsWith(`${folder.path}/`));
		if (file) await this.openNote(file.path);
		else new Notice(`The linked folder is empty: ${folder.name}`);
	}

	/**
	 * Parses a salary string (e.g. "$150,000", "$120k - $140k", "85k", "60/hr") into a numeric value for sorting.
	 */
	private parseSalary(salary?: string): number | null {
		if (!salary) return null;
		const cleaned = salary.trim().toLowerCase();
		if (!cleaned) return null;
		const match = cleaned.match(/([\d,]+(?:\.\d+)?)\s*([km])?/i);
		if (!match) return null;
		const numStr = match[1].replace(/,/g, "");
		let val = parseFloat(numStr);
		if (isNaN(val)) return null;
		if (match[2]) {
			if (match[2].toLowerCase() === "k") val *= 1000;
			if (match[2].toLowerCase() === "m") val *= 1000000;
		}
		return val;
	}

	renderEmptyState(container: HTMLElement) {
		const emptyDiv = container.createDiv({ cls: "job-tracker-empty-state" });
		const iconEl = emptyDiv.createDiv({ cls: "job-tracker-empty-icon" });
		setIcon(iconEl, "briefcase");
		emptyDiv.createEl("h4", { text: "No Job Applications Found" });
		emptyDiv.createEl("p", {
			text: "Get started by adding your first job application.",
		});
		const addBtn = emptyDiv.createEl("button", {
			cls: "mod-cta",
			text: "+ Add Job Application",
		});
		addBtn.onclick = () => {
			new NewApplicationModal(this.app, this.plugin).open();
		};
	}

	renderNoSearchResults(container: HTMLElement) {
		const emptyDiv = container.createDiv({ cls: "job-tracker-empty-state" });
		const iconEl = emptyDiv.createDiv({ cls: "job-tracker-empty-icon" });
		setIcon(iconEl, "search");
		emptyDiv.createEl("h4", { text: "No Matching Applications" });
		emptyDiv.createEl("p", {
			text: "No job applications match your current search query or filter.",
		});
		const clearBtn = emptyDiv.createEl("button", {
			cls: "mod-cta",
			text: "Clear Filters",
		});
		clearBtn.onclick = () => {
			this.searchQuery = "";
			this.statusFilter = "All";
			this.deadlineFilter = "All";
			this.companyFilter = "All";
			this.tagFilter = "All";
			this.locationFilter = "All";
			this.selectedSavedViewId = "";
			this.render();
		};
	}

	/**
	 * Extracts the chronological sequence of statuses that the application entered/exited.
	 * Resolves final statuses (Accepted, Rejected, Withdrawn, Ghosted) so only the latest
	 * current final status is kept at the end of the chain, preventing multiple final transitions.
	 */
	getVisitedStatuses(app: JobApplication): string[] {
		const rawVisited: string[] = [];

		// 1. Extract from statusHistory
		if (app.statusHistory && app.statusHistory.length > 0) {
			for (const entry of app.statusHistory) {
				if (entry.status && (rawVisited.length === 0 || rawVisited[rawVisited.length - 1] !== entry.status)) {
					rawVisited.push(entry.status);
				}
			}
		}

		// 2. Ensure current status is at the end
		if (app.status && (rawVisited.length === 0 || rawVisited[rawVisited.length - 1] !== app.status)) {
			rawVisited.push(app.status);
		}

		// 3. Fallback: If application has interview records but "Interviewing" isn't in history
		if (app.interviews && app.interviews.length > 0 && !rawVisited.includes("Interviewing")) {
			const last = rawVisited[rawVisited.length - 1];
			if (["Offer", "Accepted", "Rejected", "Ghosted", "Withdrawn"].includes(last)) {
				rawVisited.splice(rawVisited.length - 1, 0, "Interviewing");
			} else {
				rawVisited.push("Interviewing");
			}
		}

		// 4. Ensure "Applied" is in the chain if application was submitted beyond Wishlist
		if (rawVisited.length === 0) {
			rawVisited.push(app.status || "Applied");
		} else if (rawVisited[0] !== "Wishlist" && !rawVisited.includes("Applied")) {
			rawVisited.unshift("Applied");
		}

		// 5. Eliminate cycles / loops
		const visited: string[] = [];
		for (const st of rawVisited) {
			const existingIdx = visited.indexOf(st);
			if (existingIdx !== -1) {
				visited.length = existingIdx + 1;
			} else {
				visited.push(st);
			}
		}

		// 6. Enforce Single Final Status Rule
		const finalStatuses = ["Accepted", "Rejected", "Withdrawn", "Ghosted"];
		let lastFinalStatus: string | null = null;

		for (let i = visited.length - 1; i >= 0; i--) {
			if (finalStatuses.includes(visited[i])) {
				lastFinalStatus = visited[i];
				break;
			}
		}

		if (lastFinalStatus) {
			const filtered: string[] = [];
			for (let i = 0; i < visited.length; i++) {
				const s = visited[i];
				if (!finalStatuses.includes(s)) {
					filtered.push(s);
				}
			}
			filtered.push(lastFinalStatus);
			return filtered;
		}

		return visited;
	}

	/**
	 * Computes and caches metrics data. Only recomputes when applications data has changed.
	 */
	getOrComputeMetrics(): MetricsData {
		if (this.metricsCache && this.metricsVersion === this.dataVersion) {
			return this.metricsCache;
		}

		const totalApps = this.applications.length;
		const appHistories = this.applications.map((a) => ({
			app: a,
			visited: this.getVisitedStatuses(a),
		}));

		const appliedApps = appHistories.filter(
			(h) => h.visited.some((st) => st !== "Wishlist") || h.app.status !== "Wishlist"
		);
		const wishlistApps = appHistories.filter(
			(h) => h.app.status === "Wishlist" && !h.visited.some((st) => st !== "Wishlist")
		);
		const appliedTotal = appliedApps.length;

		const activeStatuses: JobStatus[] = ["Applied", "Screening", "Interviewing", "Offer"];
		const activeApps = this.applications.filter((a) => activeStatuses.includes(a.status));

		const interviewApps = appliedApps.filter(
			(h) =>
				h.visited.includes("Interviewing") ||
				h.visited.includes("Offer") ||
				h.visited.includes("Accepted") ||
				(h.app.interviews && h.app.interviews.length > 0)
		);

		const offerApps = appliedApps.filter(
			(h) => h.visited.includes("Offer") || h.visited.includes("Accepted") || h.app.status === "Offer" || h.app.status === "Accepted"
		);

		const acceptedApps = appliedApps.filter(
			(h) => h.visited.includes("Accepted") || h.app.status === "Accepted"
		);

		const respondedApps = appliedApps.filter(
			(h) =>
				h.visited.some((st) => ["Screening", "Interviewing", "Offer", "Accepted", "Rejected"].includes(st)) ||
				(h.app.interviews && h.app.interviews.length > 0)
		);

		const responseRate = appliedTotal > 0 ? ((respondedApps.length / appliedTotal) * 100).toFixed(1) : "0.0";
		const interviewRate = appliedTotal > 0 ? ((interviewApps.length / appliedTotal) * 100).toFixed(1) : "0.0";
		const offerRate = appliedTotal > 0 ? ((offerApps.length / appliedTotal) * 100).toFixed(1) : "0.0";

		const totalContacts = this.applications.reduce((acc, a) => acc + (a.contacts?.length || 0), 0);
		const totalInterviews = this.applications.reduce((acc, a) => acc + (a.interviews?.length || 0), 0);
		const completedInterviews = this.applications.reduce(
			(acc, a) => acc + (a.interviews?.filter((i) => i.status === "Completed").length || 0),
			0
		);

		const sourceMap = new Map<string, { total: number; interviews: number; offers: number }>();
		for (const h of appHistories) {
			const src = h.app.source || "Unspecified";
			const entry = sourceMap.get(src) || { total: 0, interviews: 0, offers: 0 };
			entry.total++;
			if (h.visited.includes("Interviewing") || (h.app.interviews && h.app.interviews.length > 0)) {
				entry.interviews++;
			}
			if (h.visited.includes("Offer") || h.app.status === "Offer") {
				entry.offers++;
			}
			sourceMap.set(src, entry);
		}

		const allHistoryEntries: { company: string; role: string; filePath: string; date: string; status: string; note?: string }[] = [];
		for (const app of this.applications) {
			for (const h of app.statusHistory || []) {
				allHistoryEntries.push({
					company: app.company,
					role: app.role,
					filePath: app.filePath,
					date: h.date,
					status: h.status,
					note: h.note,
				});
			}
		}
		allHistoryEntries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

		this.metricsCache = {
			appHistories,
			totalApps,
			appliedTotal,
			wishlistCount: wishlistApps.length,
			activeCount: activeApps.length,
			responseRate,
			interviewRate,
			offerRate,
			totalContacts,
			totalInterviews,
			completedInterviews,
			respondedCount: respondedApps.length,
			interviewCount: interviewApps.length,
			offerCount: offerApps.length,
			acceptedCount: acceptedApps.length,
			sourceMap,
			allHistoryEntries,
		};
		this.metricsVersion = this.dataVersion;
		return this.metricsCache;
	}

	showCardMenu(e: MouseEvent | KeyboardEvent, app: JobApplication) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Open Note")
				.setIcon("file-text")
				.onClick(() => this.openNote(app.filePath))
		);

		menu.addItem((item) =>
			item
				.setTitle("Manage Contacts & Interviews")
				.setIcon("users")
				.onClick(() => new ManageApplicationModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Edit Details & Attachment")
				.setIcon("edit")
				.onClick(() => new EditApplicationModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Update Status")
				.setIcon("arrow-right-circle")
				.onClick(() => new UpdateStatusModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Add Interview")
				.setIcon("calendar-plus")
				.onClick(() => new AddInterviewModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Add Contact")
				.setIcon("user-plus")
				.onClick(() => new AddContactModal(this.app, this.plugin, app).open())
		);

		if (app.jobDescriptionFile) {
			const isPdf = app.jobDescriptionFile.toLowerCase().endsWith(".pdf");
			menu.addItem((item) =>
				item
					.setTitle(isPdf ? "Open Attached PDF" : "Open Attached JD")
					.setIcon(isPdf ? "file-text" : "file")
					.onClick(() => this.openNote(app.jobDescriptionFile!))
			);
		}

		if (app.jobUrl) {
			const safeUrl = sanitizeUrl(app.jobUrl);
			if (safeUrl) {
				menu.addItem((item) =>
					item
						.setTitle("Open Job Posting URL")
						.setIcon("external-link")
						.onClick(() => window.open(safeUrl, "_blank"))
				);
			}
		}

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle("Delete Application")
				.setIcon("trash-2")
				.setWarning(true)
				.onClick(() => {
					new ConfirmDeleteModal(
						this.app,
						`Delete ${app.company}?`,
						`Are you sure you want to delete "${app.company} - ${app.role}"? This will move the application note to trash.`,
						"Delete Application",
						async () => {
							const file = this.plugin.appService.resolveFile(app.filePath);
							if (file instanceof TFile) {
								await this.plugin.appService.deleteApplication(file);
							}
						}
					).open();
				})
		);

		if (e instanceof MouseEvent && (e.clientX !== 0 || e.clientY !== 0)) {
			menu.showAtMouseEvent(e);
		} else {
			const target = (e.target as HTMLElement) || (e.currentTarget as HTMLElement);
			const rect = target?.getBoundingClientRect?.();
			if (rect) {
				menu.showAtPosition({ x: Math.round(rect.left), y: Math.round(rect.bottom + 4) });
			}
		}
	}

	async openNote(filePath: string) {
		if (isAbsoluteFilePath(filePath)) {
			try {
				const shell = require("electron").shell as { openPath?: (path: string) => Promise<string> };
				if (!shell?.openPath) {
					new Notice("Opening files outside the vault is not supported on this Obsidian platform.");
					return;
				}
				const error = await shell.openPath(filePath);
				if (error) new Notice(`Could not open file: ${error}`);
			} catch (error) {
				console.error("Job Tracker: Could not open external artefact:", error);
				new Notice("Could not open file outside the vault. Check the console for details.");
			}
			return;
		}
		const file = this.plugin.appService.resolveFile(filePath);
		if (file instanceof TFile) {
			await this.plugin.appService.simplifyLegacyApplicationNote(file);
			const targetLeaf = this.app.workspace.getLeaf("tab");
			await targetLeaf.openFile(file);
		}
	}
}
