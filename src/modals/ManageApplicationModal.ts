import { App, Notice, normalizePath, Setting, TFile, TFolder, setIcon } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication } from "../types";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { AddContactModal } from "./AddContactModal";
import { AddInterviewModal } from "./AddInterviewModal";
import { LogInterviewOutcomeModal } from "./LogInterviewOutcomeModal";
import { EditApplicationModal } from "./EditApplicationModal";
import { BaseApplicationModal } from "./BaseApplicationModal";

/**
 * Comprehensive management modal for viewing and managing an application's overview, contacts, and interview rounds.
 */
export class ManageApplicationModal extends BaseApplicationModal {
	private activeTab: "overview" | "contacts" | "interviews" = "overview";

	private reopenWithFreshData(tab: "overview" | "contacts" | "interviews"): void {
		if (!this.application) return;
		const file = this.resolveApplicationFile();
		let freshApp = this.application;
		if (file instanceof TFile) {
			const cached = this.plugin.appService.getApplicationFromCache(file);
			if (cached) freshApp = cached;
		}
		new ManageApplicationModal(this.app, this.plugin, freshApp, tab).open();
	}

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		application: JobApplication | null = null,
		defaultTab: "overview" | "contacts" | "interviews" = "overview"
	) {
		super(app, plugin, application);
		this.activeTab = defaultTab;
	}

	renderContent(): void {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.application) return;

		// Re-fetch fresh application data from file if available
		const file = this.plugin.appService.resolveFile(this.application.filePath);
		if (file instanceof TFile) {
			const freshApp = this.plugin.appService.getApplicationFromCache(file);
			if (freshApp) {
				this.application = freshApp;
			}
		}

		const header = contentEl.createDiv({ cls: "job-tracker-modal-header" });
		header.createEl("h2", { text: `Manage: ${this.application.company}` });
		header.createEl("p", {
			text: `${this.application.role} • Status: ${this.application.status}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Tab navigation buttons
		const tabRow = contentEl.createDiv({
			cls: "job-tracker-view-switcher job-tracker-modal-switcher",
			attr: { role: "tablist", "aria-label": "Application details tabs" },
		});

		const tabs: { id: "overview" | "contacts" | "interviews"; label: string }[] = [
			{ id: "overview", label: "Overview & Note" },
			{ id: "contacts", label: `Contacts (${this.application.contacts.length})` },
			{ id: "interviews", label: `Interviews (${this.application.interviews.length})` },
		];

		for (const tab of tabs) {
			const isActive = this.activeTab === tab.id;
			const tabBtn = tabRow.createEl("button", {
				cls: `job-tracker-mode-btn ${isActive ? "is-active" : ""}`,
				text: tab.label,
				attr: {
					id: `tab-${tab.id}`,
					role: "tab",
					"aria-controls": `tabpanel-${tab.id}`,
					"aria-selected": `${isActive}`,
					tabindex: isActive ? "0" : "-1",
				},
			});
			tabBtn.onclick = () => {
				this.activeTab = tab.id;
				this.renderContent();
			};
		}

		const tabContainer = contentEl.createDiv({
			cls: "job-tracker-modal-tab-content",
			attr: {
				role: "tabpanel",
				id: `tabpanel-${this.activeTab}`,
				"aria-labelledby": `tab-${this.activeTab}`,
			},
		});

		if (this.activeTab === "overview") {
			this.renderOverviewTab(tabContainer);
		} else if (this.activeTab === "contacts") {
			this.renderContactsTab(tabContainer);
		} else {
			this.renderInterviewsTab(tabContainer);
		}
	}

	private renderOverviewTab(container: HTMLElement): void {
		if (!this.application) return;

		container.createEl("p", {
			text: "Quick actions and details for this application.",
			cls: "text-muted",
		});

		new Setting(container)
			.setName("Edit Application Details")
			.setDesc("Edit role, company, status, dates, compensation, and other details")
			.addButton((btn) =>
				btn.setButtonText("Edit Details").onClick(() => {
					this.close();
					new EditApplicationModal(
						this.app,
						this.plugin,
						this.application,
						() => this.reopenWithFreshData("overview"),
						() => this.reopenWithFreshData("overview")
					).open();
				})
			);

		new Setting(container)
			.setName("Open Application Note")
			.setDesc("Open the full Markdown note in your workspace")
			.addButton((btn) =>
				btn.setButtonText("Open Note").onClick(async () => {
					this.close();
					const file = this.resolveApplicationFile();
					if (file instanceof TFile) {
						const leaf = this.app.workspace.getLeaf("tab");
						await leaf.openFile(file);
					}
				})
			);

		this.renderArtefactOverview(container);

		new Setting(container)
			.setName("Delete Application")
			.setDesc("Move this application note to the Obsidian trash")
			.addButton((btn) =>
				btn
					.setButtonText("Delete Application")
					.setClass("mod-warning")
					.onClick(() => {
						new ConfirmDeleteModal(
							this.app,
							`Delete ${this.application?.company}?`,
							`Are you sure you want to delete the application note for "${this.application?.company} - ${this.application?.role}"? This will move the file to trash.`,
							"Delete Application",
							async () => {
								try {
									const file = this.resolveApplicationFile();
									if (file instanceof TFile) {
										await this.plugin.appService.deleteApplication(file);
										this.close();
									}
								} catch (err) {
									this.handleModalError("Delete application", err);
								}
							}
						).open();
					})
			);
	}

	private renderArtefactOverview(container: HTMLElement): void {
		if (!this.application) return;
		container.createEl("h3", { text: "Application Files" });

		const folderPath = this.application.applicationFolderPath;
		if (folderPath) {
			const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
			const folderSetting = new Setting(container)
				.setName("Artefact Folder")
				.setDesc(folder instanceof TFolder ? folder.name || "Vault root" : "Folder not found");
			if (folder instanceof TFolder) {
				folderSetting.addButton((button) =>
					button.setButtonText("Open Folder").onClick(async () => {
						const file = this.app.vault.getFiles().find((item) => item.path.startsWith(folder.path + "/"));
						if (!file) {
							new Notice("The linked folder is empty.");
							return;
						}
						await this.app.workspace.getLeaf("tab").openFile(file);
						const explorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
						if (explorerLeaf) await this.app.workspace.revealLeaf(explorerLeaf);
					})
				);
			} else {
				folderSetting.setClass("job-tracker-missing-reference");
			}
		}

		const artefacts = this.plugin.appService.getApplicationArtefacts(this.application);
		const groups: { title: string; matches: (type: string) => boolean }[] = [
			{ title: "Job Description", matches: (type) => type === "Job Description" },
			{ title: "CVs", matches: (type) => type === "CV" },
			{ title: "Cover Letters", matches: (type) => type === "Cover Letter" },
			{ title: "Interview Notes", matches: (type) => ["Interview Notes", "Recruiter Notes", "Follow-up Notes", "General Notes"].includes(type) },
			{ title: "Other Artefacts", matches: (type) => !["Job Description", "CV", "Cover Letter", "Interview Notes", "Recruiter Notes", "Follow-up Notes", "General Notes"].includes(type) },
		];

		for (const group of groups) {
			const items = artefacts.filter((artefact) => group.matches(artefact.type));
			if (items.length === 0) continue;
			container.createEl("h4", { text: `${group.title} (${items.length})` });
			for (const artefact of items) {
				const file = this.plugin.appService.resolveFile(artefact.path);
				const setting = new Setting(container)
					.setName(artefact.filename)
					.setDesc(file instanceof TFile ? "" : "File not found");
				if (!(file instanceof TFile)) {
					setting.setClass("job-tracker-missing-reference");
					continue;
				}
				setting.addButton((button) =>
					button.setButtonText("Open").onClick(() => {
						void this.app.workspace.getLeaf("tab").openFile(file);
					})
				);
				setting.addButton((button) =>
					button.setButtonText("Reveal in Vault").onClick(async () => {
						await this.app.workspace.getLeaf("tab").openFile(file);
						const explorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
						if (explorerLeaf) await this.app.workspace.revealLeaf(explorerLeaf);
					})
				);
			}
		}
	}

	private renderContactsTab(container: HTMLElement): void {
		if (!this.application) return;

		new Setting(container)
			.setName("Key Contacts")
			.setDesc("Manage recruiters, interviewers, and team members connected to this role.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Contact")
					.setCta()
					.onClick(() => {
						this.close();
						new AddContactModal(
							this.app,
							this.plugin,
							this.application,
							() => this.reopenWithFreshData("contacts"),
							() => this.reopenWithFreshData("contacts")
						).open();
					})
			);

		const contacts = this.application.contacts || [];

		if (contacts.length === 0) {
			container.createEl("p", {
				text: "No contacts added yet. Click '+ Add Contact' above to record recruiter or hiring manager details.",
				cls: "text-muted",
			});
			return;
		}

		const listDiv = container.createDiv({ cls: "job-tracker-modal-item-list" });

		for (const contact of contacts) {
			const itemCard = listDiv.createDiv({ cls: "job-tracker-list-item" });

			const infoDiv = itemCard.createDiv({ cls: "job-tracker-list-main" });
			const nameRow = infoDiv.createDiv({ cls: "job-tracker-list-title-row" });
			nameRow.createEl("strong", { text: contact.name });
			nameRow.createSpan({ text: `(${contact.role})`, cls: "text-muted" });

			const detailsRow = infoDiv.createDiv({ cls: "job-tracker-list-details" });
			if (contact.email) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "mail");
				item.createSpan({ text: ` ${contact.email}` });
			}
			if (contact.phone) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "phone");
				item.createSpan({ text: ` ${contact.phone}` });
			}
			if (contact.linkedin) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "link");
				item.createSpan({ text: " LinkedIn" });
			}
			if (contact.notes) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item activity-note" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "file-text");
				item.createSpan({ text: ` ${contact.notes}` });
			}

			const actionsDiv = itemCard.createDiv({ cls: "job-tracker-list-actions" });

			const deleteBtn = actionsDiv.createEl("button", {
				cls: "job-tracker-icon-btn",
				attr: { "aria-label": "Delete contact" },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.onclick = () => {
				new ConfirmDeleteModal(
					this.app,
					`Delete Contact: ${contact.name}?`,
					`Are you sure you want to remove "${contact.name}" from this application?`,
					"Remove Contact",
					async () => {
						try {
							const file = this.resolveApplicationFile();
							if (file instanceof TFile) {
								await this.plugin.appService.deleteContact(file, contact.id);
								this.renderContent();
							}
						} catch (err) {
							this.handleModalError("Delete contact", err);
						}
					}
				).open();
			};
		}
	}

	private renderInterviewsTab(container: HTMLElement): void {
		if (!this.application) return;

		new Setting(container)
			.setName("Interview Stages & Debriefs")
			.setDesc("Track rounds, schedule new interviews, or log debrief feedback.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Schedule Interview")
					.setCta()
					.onClick(() => {
						this.close();
						new AddInterviewModal(
							this.app,
							this.plugin,
							this.application,
							() => this.reopenWithFreshData("interviews"),
							() => this.reopenWithFreshData("interviews")
						).open();
					})
			);

		const interviews = this.application.interviews || [];

		if (interviews.length === 0) {
			container.createEl("p", {
				text: "No interviews recorded yet. Click '+ Schedule Interview' above to add a round.",
				cls: "text-muted",
			});
			return;
		}

		const listDiv = container.createDiv({ cls: "job-tracker-modal-item-list" });

		for (const iv of interviews) {
			const itemCard = listDiv.createDiv({ cls: "job-tracker-list-item" });

			const infoDiv = itemCard.createDiv({ cls: "job-tracker-list-main" });
			const titleRow = infoDiv.createDiv({ cls: "job-tracker-list-title-row" });
			titleRow.createEl("strong", { text: iv.roundName });
			titleRow.createSpan({
				text: iv.status,
				cls: `job-tracker-status-badge ${iv.status === "Completed" ? "status-offer" : iv.status === "Cancelled" ? "status-rejected" : "status-interviewing"}`,
			});

			const detailsRow = infoDiv.createDiv({ cls: "job-tracker-list-details" });
			if (iv.date) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "calendar");
				item.createSpan({ text: ` ${iv.date} ${iv.time || ""}`.trim() });
			}
			if (iv.interviewers) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "users");
				item.createSpan({ text: ` ${iv.interviewers}` });
			}
			if (iv.outcomeNotes) {
				const item = detailsRow.createSpan({ cls: "job-tracker-detail-item activity-note" });
				setIcon(item.createSpan({ cls: "job-tracker-detail-icon" }), "message-square");
				item.createSpan({ text: ` ${iv.outcomeNotes}` });
			}

			const actionsDiv = itemCard.createDiv({ cls: "job-tracker-list-actions" });

			if (iv.prepNotePath) {
				const prepBtn = actionsDiv.createEl("button", {
					cls: "job-tracker-action-pill-btn",
					text: "Prep Note",
				});
				prepBtn.onclick = async () => {
					this.close();
					const prepFile = this.plugin.appService.resolveFile(iv.prepNotePath!);
					if (prepFile instanceof TFile) {
						const leaf = this.app.workspace.getLeaf("tab");
						await leaf.openFile(prepFile);
					}
				};
			}

			const debriefBtn = actionsDiv.createEl("button", {
				cls: "job-tracker-action-pill-btn",
				text: "Log Outcome",
			});
			debriefBtn.onclick = () => {
				this.close();
				const modal = new LogInterviewOutcomeModal(
					this.app,
					this.plugin,
					this.application,
					() => this.reopenWithFreshData("interviews"),
					() => this.reopenWithFreshData("interviews")
				);
				modal.selectedInterviewId = iv.id;
				modal.open();
			};

			const deleteBtn = actionsDiv.createEl("button", {
				cls: "job-tracker-icon-btn",
				attr: { "aria-label": "Delete interview round" },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.onclick = () => {
				new ConfirmDeleteModal(
					this.app,
					`Delete Interview: ${iv.roundName}?`,
					`Are you sure you want to remove "${iv.roundName}" from this application?`,
					"Remove Round",
					async () => {
						try {
							const file = this.resolveApplicationFile();
							if (file instanceof TFile) {
								await this.plugin.appService.deleteInterview(file, iv.id);
								this.renderContent();
							}
						} catch (err) {
							this.handleModalError("Delete interview", err);
						}
					}
				).open();
			};
		}
	}
}
