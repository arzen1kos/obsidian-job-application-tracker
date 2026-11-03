import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { ApplicationArtefact, Contact, EmploymentType, JobStatus, WorkplaceType } from "../types";
import { sanitizeEmail, sanitizeUrl } from "../services/ApplicationService";
import { EMPLOYMENT_OPTIONS, WORKPLACE_OPTIONS } from "../constants";
import { ArtefactEditor } from "./ArtefactEditor";

/**
 * Modal for creating a new job application note with details and optional JD attachments.
 */
export class NewApplicationModal extends Modal {
	private plugin: JobApplicationTrackerPlugin;

	private company = "";
	private role = "";
	private status: JobStatus;
	private dateApplied = "";
	private location = "";
	private workplaceType: WorkplaceType | "" = "";
	private employmentType: EmploymentType | "" = "";
	private salary = "";
	private jobUrl = "";
	private source = "";
	private followUpDate = "";
	private closingDate = "";
	private applicationFolderPath = "";
	private artefacts: ApplicationArtefact[] = [];
	private notes = "";
	private recruiterName = "";
	private recruiterEmail = "";
	private tags: string[] = [];

	private companyInputEl: HTMLInputElement | null = null;
	private roleInputEl: HTMLInputElement | null = null;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		super(app);
		this.plugin = plugin;
		this.status = plugin.settings.defaultStatus || "Applied";
		this.dateApplied = plugin.appService.getTodayDateString();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		contentEl.createEl("h2", { text: "Add New Job Application" });

		// Company
		new Setting(contentEl)
			.setName("Company")
			.setDesc("Company name (required)")
			.addText((text) => {
				this.companyInputEl = text.inputEl;
				text.inputEl.maxLength = 100;
				text.setPlaceholder("e.g. Acme Corp").onChange((value) => {
					this.company = value;
				});
				text.inputEl.focus();
			});

		// Role
		new Setting(contentEl)
			.setName("Role / Position")
			.setDesc("Job title (required)")
			.addText((text) => {
				this.roleInputEl = text.inputEl;
				text.inputEl.maxLength = 150;
				text.setPlaceholder("e.g. Senior Software Engineer").onChange((value) => {
					this.role = value;
				});
			});

		const appliedFieldSettings: HTMLElement[] = [];
		// Status
		new Setting(contentEl)
			.setName("Status")
			.setDesc("Initial application stage")
			.addDropdown((dropdown) => {
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.status);
				dropdown.onChange((value) => {
					this.status = value;
					for (const setting of appliedFieldSettings) {
						setting.toggleClass("job-tracker-is-hidden", this.status !== "Applied");
					}
				});
			});

		// Date Applied
		const dateAppliedSetting = new Setting(contentEl)
			.setName("Date Applied")
			.setDesc("Date when the application was submitted")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.dateApplied).onChange((value) => {
					this.dateApplied = value;
				});
			});
		appliedFieldSettings.push(dateAppliedSetting.settingEl);

		// Location
		new Setting(contentEl)
			.setName("Location")
			.setDesc("e.g. New York, NY, Austin, TX")
			.addText((text) => {
				text.inputEl.maxLength = 150;
				text.setPlaceholder("e.g. New York, NY").onChange((value) => {
					this.location = value;
				});
			});

		// Workplace Model
		new Setting(contentEl)
			.setName("Workplace Model")
			.setDesc("Work arrangement model")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select model...");
				for (const option of WORKPLACE_OPTIONS) {
					dropdown.addOption(option, option);
				}
				dropdown.onChange((value) => {
					this.workplaceType = value as WorkplaceType | "";
				});
			});

		// Employment Type
		new Setting(contentEl)
			.setName("Employment Type")
			.setDesc("Job engagement type")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select type...");
				for (const option of EMPLOYMENT_OPTIONS) {
					dropdown.addOption(option, option);
				}
				dropdown.onChange((value) => {
					this.employmentType = value as EmploymentType | "";
				});
			});

		// Salary
		new Setting(contentEl)
			.setName("Salary / Compensation")
			.setDesc("e.g. $150k - $180k + equity")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setPlaceholder("$150,000 - $180,000").onChange((value) => {
					this.salary = value;
				});
			});

		// Job URL
		new Setting(contentEl)
			.setName("Job Posting URL")
			.setDesc("Link to active listing")
			.addText((text) => {
				text.inputEl.maxLength = 500;
				text.setPlaceholder("https://company.com/careers/...").onChange((value) => {
					this.jobUrl = value;
				});
			});

		// Source
		new Setting(contentEl)
			.setName("Source")
			.setDesc("Where did you find this role?")
			.addDropdown((dropdown) => {
				for (const src of this.plugin.settings.defaultSourceOptions) {
					dropdown.addOption(src, src);
				}
				dropdown.setValue(this.plugin.settings.defaultSourceOptions[0]);
				this.source = this.plugin.settings.defaultSourceOptions[0];
				dropdown.onChange((value) => {
					this.source = value;
				});
			});

		// Follow-up Date
		const followUpSetting = new Setting(contentEl)
			.setName("Follow-up Date")
			.setDesc("Optional reminder or deadline date")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.followUpDate).onChange((value) => {
					this.followUpDate = value;
				});
			});
		appliedFieldSettings.push(followUpSetting.settingEl);
		for (const setting of appliedFieldSettings) {
				setting.toggleClass("job-tracker-is-hidden", this.status !== "Applied");
		}

		new Setting(contentEl)
			.setName("Closing Date")
			.setDesc("Application deadline (used for dashboard reminders)")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.closingDate).onChange((value) => {
					this.closingDate = value;
				});
			});

		contentEl.createEl("h3", { text: "Tags" });
		const tagContainer = contentEl.createDiv({ cls: "job-tracker-tag-selector" });
		this.renderTagOptions(tagContainer);

		// Recruiter Name & Email
		contentEl.createEl("h3", { text: "Contact Information" });
		new Setting(contentEl)
			.setName("Contact / Recruiter Name")
			.setDesc("Name of recruiter, sourcer, or hiring manager")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setPlaceholder("e.g. Jane Doe").onChange((value) => {
					this.recruiterName = value;
				});
			});

		new Setting(contentEl)
			.setName("Contact Email")
			.setDesc("Email address")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setPlaceholder("jane@company.com").onChange((value) => {
					this.recruiterEmail = value;
				});
			});

		// Initial Notes
		contentEl.createEl("h3", { text: "Notes & Job Description" });
		new Setting(contentEl)
			.setName("Initial Notes")
			.setDesc("Private impressions, how you found it, referral context")
			.addTextArea((text) => {
				text.inputEl.maxLength = 2000;
				text.setPlaceholder("Notes...").onChange((value) => {
					this.notes = value;
				});
				text.inputEl.rows = 3;
			});

		const artefactContainer = contentEl.createDiv({ cls: "job-tracker-artefact-editor" });
		new ArtefactEditor(
			this.app,
			this.plugin,
			{ applicationFolderPath: this.applicationFolderPath, artefacts: this.artefacts },
			(value) => {
				this.applicationFolderPath = value.applicationFolderPath;
				this.artefacts = value.artefacts;
			}
		).render(artefactContainer);

		// Or paste plain text JD
		let jobDescriptionText = "";
		new Setting(contentEl)
			.setName("Or Paste Job Description Text")
			.setDesc("Markdown or plain text that will be embedded into the note")
			.addTextArea((text) => {
				text.inputEl.maxLength = 10000;
				text.setPlaceholder("Paste job requirements and details here...").onChange((value) => {
					jobDescriptionText = value;
				});
				text.inputEl.rows = 4;
			});

		// Submit & Cancel buttons
		let submitBtn: ButtonComponent;
		new Setting(contentEl)
			.addButton((btn) => {
				submitBtn = btn;
				btn
					.setButtonText("Create Application")
					.setCta()
					.onClick(async () => {
						submitBtn.setDisabled(true);
						try {
							await this.handleSubmit(jobDescriptionText);
						} finally {
							submitBtn.setDisabled(false);
						}
					});
			})
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	}

	private renderTagOptions(container: HTMLElement): void {
		container.empty();
		for (const tag of this.plugin.settings.applicationTagOptions) {
			const selected = this.tags.includes(tag);
			const button = container.createEl("button", {
				text: tag,
				cls: `job-tracker-tag-option ${selected ? "is-selected" : ""}`,
				attr: { type: "button", "aria-pressed": String(selected) },
			});
			button.onclick = () => {
				this.tags = selected ? this.tags.filter((item) => item !== tag) : [...this.tags, tag];
				this.renderTagOptions(container);
			};
		}
		if (this.plugin.settings.applicationTagOptions.length === 0) {
			container.createEl("p", { text: "Add tag options in plugin settings.", cls: "text-muted" });
		}
	}

	private async handleSubmit(jobDescriptionText: string): Promise<void> {
		if (!this.company.trim()) {
			new Notice("Please enter a company name.");
			this.companyInputEl?.focus();
			return;
		}
		if (!this.role.trim()) {
			new Notice("Please enter a role / job title.");
			this.roleInputEl?.focus();
			return;
		}
		const jobDescriptionFileCount = this.artefacts.filter((artefact) => artefact.type === "Job Description").length;
		const hasJobDescriptionFile = jobDescriptionFileCount === 1;
		const hasJobDescriptionText = !!jobDescriptionText.trim();
		if (jobDescriptionFileCount > 1 || hasJobDescriptionFile === hasJobDescriptionText) {
			new Notice("Choose either a Job Description file or paste Job Description text.");
			return;
		}
		if (this.dateApplied.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(this.dateApplied.trim())) {
			new Notice("Please select a valid date for Date Applied.");
			return;
		}
		if (this.followUpDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(this.followUpDate.trim())) {
			new Notice("Please select a valid date for Follow-up Date.");
			return;
		}
		if (this.closingDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(this.closingDate.trim())) {
			new Notice("Please select a valid date for Closing Date.");
			return;
		}
		if (this.recruiterEmail.trim() && !sanitizeEmail(this.recruiterEmail.trim())) {
			new Notice("Please enter a valid email address for the contact.");
			return;
		}
		if (this.jobUrl.trim() && !sanitizeUrl(this.jobUrl.trim())) {
			new Notice("Job URL must begin with http:// or https://");
			return;
		}

		try {
			const contacts: Contact[] = [];
			if (this.recruiterName.trim()) {
				contacts.push({
					id: crypto.randomUUID(),
					name: this.recruiterName.trim(),
					role: "Recruiter",
					email: this.recruiterEmail.trim() || undefined,
				});
			}

			const file = await this.plugin.appService.createApplication({
				company: this.company.trim(),
				role: this.role.trim(),
				status: this.status,
				dateApplied: this.dateApplied.trim(),
				location: this.location.trim(),
				workplaceType: this.workplaceType || undefined,
				employmentType: this.employmentType || undefined,
				salary: this.salary.trim(),
				jobUrl: this.jobUrl.trim(),
				source: this.source.trim(),
				followUpDate: this.followUpDate.trim() || undefined,
				closingDate: this.closingDate.trim() || undefined,
				applicationFolderPath: this.applicationFolderPath.trim() || undefined,
				notes: this.notes.trim(),
				jobDescription: jobDescriptionText.trim() || undefined,
				artefacts: this.artefacts,
				jobDescriptionFile: this.artefacts.find((artefact) => artefact.type === "Job Description")?.path,
				contacts: contacts,
				tags: this.tags,
			});

			this.close();

			// Open the newly created note in a workspace tab
			const leaf = this.app.workspace.getLeaf("tab");
			await leaf.openFile(file);
		} catch (err) {
			console.error("Job Tracker: Modal action failed:", err);
			new Notice(`Operation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
