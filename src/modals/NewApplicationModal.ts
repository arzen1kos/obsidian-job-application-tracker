import { App, ButtonComponent, Modal, Notice, normalizePath, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { ApplicationArtefact, Contact, EmploymentType, JobStatus, WorkplaceType } from "../types";
import { sanitizeEmail, sanitizeUrl } from "../services/ApplicationService";
import { EMPLOYMENT_OPTIONS, WORKPLACE_OPTIONS } from "../constants";
import { ArtefactEditor } from "./ArtefactEditor";

const WIZARD_STEPS = ["Job Description", "Application Details", "Artefacts", "Review"];

/**
 * Guided creation flow for a Job Description-centered application.
 */
export class NewApplicationModal extends Modal {
	private readonly plugin: JobApplicationTrackerPlugin;
	private company = "";
	private role = "";
	private status: JobStatus;
	private dateApplied = "";
	private datePosted = "";
	private location = "";
	private workplaceType: WorkplaceType | "" = "";
	private employmentType: EmploymentType | "" = "";
	private salary = "";
	private jobUrl = "";
	private source = "";
	private followUpDate = "";
	private closingDate = "";
	private artefacts: ApplicationArtefact[] = [];
	private jobDescriptionSource: "file" | "text" = "file";
	private jobDescriptionText = "";
	private notes = "";
	private recruiterName = "";
	private recruiterEmail = "";
	private tags: string[] = [];
	private activeStep = 0;
	private companyInputEl: HTMLInputElement | null = null;
	private roleInputEl: HTMLInputElement | null = null;
	private dateAppliedInputEl: HTMLInputElement | null = null;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		super(app);
		this.plugin = plugin;
		this.status = plugin.settings.defaultStatus || "Applied";
		this.datePosted = plugin.appService.getTodayDateString();
		this.dateApplied = this.status === "Applied" ? this.datePosted : "";
		this.source = plugin.settings.defaultSourceOptions[0] || "";
	}

	onOpen(): void {
		this.renderWizard();
	}

	private renderWizard(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");
		contentEl.createEl("h2", { text: "Add New Job Application" });

		const progress = contentEl.createDiv({ cls: "job-tracker-wizard-progress" });
		progress.createEl("span", { text: `Step ${this.activeStep + 1} of ${WIZARD_STEPS.length}` });
		progress.createEl("strong", { text: WIZARD_STEPS[this.activeStep] });

		const stepContent = contentEl.createDiv({ cls: "job-tracker-wizard-content" });
		switch (this.activeStep) {
			case 0:
				this.renderJobDescriptionStep(stepContent);
				break;
			case 1:
				this.renderApplicationDetailsStep(stepContent);
				break;
			case 2:
				this.renderArtefactsStep(stepContent);
				break;
			case 3:
				this.renderReviewStep(stepContent);
				break;
		}

		const footer = contentEl.createDiv({ cls: "job-tracker-wizard-footer" });
		if (this.activeStep > 0) {
			new Setting(footer).addButton((button) =>
				button.setButtonText("Back").onClick(() => {
					this.activeStep--;
					this.renderWizard();
				})
			);
		}
		if (this.activeStep < WIZARD_STEPS.length - 1) {
			new Setting(footer)
				.addButton((button) =>
					button.setButtonText("Cancel").onClick(() => this.close())
				)
				.addButton((button) =>
					button.setButtonText("Next").setCta().onClick(() => {
						if (!this.validateStep()) return;
						this.activeStep++;
						this.renderWizard();
					})
				);
			return;
		}

		let submitButton: ButtonComponent;
		new Setting(footer)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton((button) => {
				submitButton = button;
				button.setButtonText("Create Application").setCta().onClick(async () => {
					submitButton.setDisabled(true);
					try {
						await this.handleSubmit();
					} finally {
						submitButton.setDisabled(false);
					}
				});
			});
	}

	private renderJobDescriptionStep(container: HTMLElement): void {
		container.createEl("p", { text: "Start with the job description. Choose a file or paste its text." });
		const sourceChoice = container.createDiv({ cls: "job-tracker-wizard-choice" });
		for (const [source, label] of [["file", "Choose a JD file"], ["text", "Paste JD text"]] as const) {
			const button = sourceChoice.createEl("button", {
				text: label,
				cls: `clickable-icon ${this.jobDescriptionSource === source ? "is-active" : ""}`,
				attr: { type: "button", "aria-pressed": String(this.jobDescriptionSource === source) },
			});
			button.onclick = () => {
				this.jobDescriptionSource = source;
				this.renderWizard();
			};
		}

		if (this.jobDescriptionSource === "file") {
			const editor = container.createDiv({ cls: "job-tracker-artefact-editor" });
			new ArtefactEditor(
				this.app,
				this.plugin,
				{ applicationFolderPath: "", artefacts: this.artefacts },
				(value) => {
					this.artefacts = value.artefacts;
				}
			).render(editor, {
				jobDescription: true,
				folder: false,
				artefacts: false,
				jobDescriptionExtensions: ["pdf", "txt", "md"],
			});
			return;
		}

		new Setting(container)
			.setName("Job Description Text")
			.setDesc("The text is saved as a standard Job Description.md file in the application folder.")
			.addTextArea((text) => {
				text.inputEl.maxLength = 10000;
				text.setPlaceholder("Paste the job description here...")
					.setValue(this.jobDescriptionText)
					.onChange((value) => {
						this.jobDescriptionText = value;
					});
				text.inputEl.rows = 10;
			});
	}

	private renderApplicationDetailsStep(container: HTMLElement): void {
		new Setting(container)
			.setName("Company")
			.setDesc("Company name (required)")
			.addText((text) => {
				this.companyInputEl = text.inputEl;
				text.inputEl.maxLength = 100;
				text.setValue(this.company).setPlaceholder("e.g. Acme Corp").onChange((value) => {
					this.company = value;
				});
				text.inputEl.focus();
			});

		new Setting(container)
			.setName("Role / Position")
			.setDesc("Job title (required)")
			.addText((text) => {
				this.roleInputEl = text.inputEl;
				text.inputEl.maxLength = 150;
				text.setValue(this.role).setPlaceholder("e.g. Senior Software Engineer").onChange((value) => {
					this.role = value;
				});
			});

		const appliedFields: HTMLElement[] = [];
		new Setting(container)
			.setName("Status")
			.setDesc("Initial application stage")
			.addDropdown((dropdown) => {
				for (const status of this.plugin.settings.statuses) dropdown.addOption(status, status);
				dropdown.setValue(this.status).onChange((value) => {
					this.status = value;
					if (this.status === "Applied" && !this.dateApplied) {
						this.dateApplied = this.plugin.appService.getTodayDateString();
						if (this.dateAppliedInputEl) this.dateAppliedInputEl.value = this.dateApplied;
					}
					for (const field of appliedFields) {
						field.toggleClass("job-tracker-is-hidden", this.status !== "Applied");
					}
				});
			});

		new Setting(container)
			.setName("Date Posted")
			.setDesc("Defaults to today")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.datePosted).onChange((value) => {
					this.datePosted = value;
				});
			});

		const dateAppliedSetting = new Setting(container)
			.setName("Date Applied")
			.setDesc("Shown and used when Status is Applied")
			.addText((text) => {
				text.inputEl.type = "date";
				this.dateAppliedInputEl = text.inputEl;
				text.setValue(this.dateApplied).onChange((value) => {
					this.dateApplied = value;
				});
			});
		appliedFields.push(dateAppliedSetting.settingEl);

		const followUpSetting = new Setting(container)
			.setName("Follow Up Date")
			.setDesc("Shown and used when Status is Applied")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.followUpDate).onChange((value) => {
					this.followUpDate = value;
				});
			});
		appliedFields.push(followUpSetting.settingEl);
		for (const field of appliedFields) field.toggleClass("job-tracker-is-hidden", this.status !== "Applied");

		new Setting(container)
			.setName("Closing Date")
			.setDesc("Application deadline")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.closingDate).onChange((value) => {
					this.closingDate = value;
				});
			});

		new Setting(container)
			.setName("Location")
			.addText((text) => {
				text.inputEl.maxLength = 150;
				text.setValue(this.location).setPlaceholder("e.g. Wellington, NZ").onChange((value) => {
					this.location = value;
				});
			});

		new Setting(container)
			.setName("Workplace Model")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select model...");
				for (const option of WORKPLACE_OPTIONS) dropdown.addOption(option, option);
				dropdown.setValue(this.workplaceType).onChange((value) => {
					this.workplaceType = value as WorkplaceType | "";
				});
			});

		new Setting(container)
			.setName("Employment Type")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Select type...");
				for (const option of EMPLOYMENT_OPTIONS) dropdown.addOption(option, option);
				dropdown.setValue(this.employmentType).onChange((value) => {
					this.employmentType = value as EmploymentType | "";
				});
			});

		new Setting(container)
			.setName("Salary / Compensation")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setValue(this.salary).setPlaceholder("$150,000 - $180,000").onChange((value) => {
					this.salary = value;
				});
			});

		new Setting(container)
			.setName("Job Posting URL")
			.addText((text) => {
				text.inputEl.maxLength = 500;
				text.setValue(this.jobUrl).setPlaceholder("https://company.com/careers/...").onChange((value) => {
					this.jobUrl = value;
				});
			});

		new Setting(container)
			.setName("Source")
			.addDropdown((dropdown) => {
				for (const option of this.plugin.settings.defaultSourceOptions) dropdown.addOption(option, option);
				dropdown.setValue(this.source).onChange((value) => {
					this.source = value;
				});
			});

		new Setting(container)
			.setName("Tags")
			.setDesc("Select one or more configured tags");
		this.renderTagOptions(container.createDiv({ cls: "job-tracker-tag-selector" }));

		container.createEl("h3", { text: "Contact and Notes" });
		new Setting(container)
			.setName("Recruiter / Contact Name")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setValue(this.recruiterName).setPlaceholder("e.g. Jane Doe").onChange((value) => {
					this.recruiterName = value;
				});
			});
		new Setting(container)
			.setName("Contact Email")
			.addText((text) => {
				text.inputEl.maxLength = 100;
				text.setValue(this.recruiterEmail).setPlaceholder("jane@company.com").onChange((value) => {
					this.recruiterEmail = value;
				});
			});
		new Setting(container)
			.setName("Initial Notes")
			.setDesc("Saved as a standard Markdown note inside the application folder")
			.addTextArea((text) => {
				text.inputEl.maxLength = 2000;
				text.setValue(this.notes).setPlaceholder("Notes...").onChange((value) => {
					this.notes = value;
				});
				text.inputEl.rows = 3;
			});
	}

	private renderArtefactsStep(container: HTMLElement): void {
		container.createEl("p", { text: "Link supporting files. These remain ordinary vault files and are moved into the application folder when enabled in settings." });
		const editor = container.createDiv({ cls: "job-tracker-artefact-editor" });
		new ArtefactEditor(
			this.app,
			this.plugin,
			{ applicationFolderPath: "", artefacts: this.artefacts },
			(value) => {
				this.artefacts = value.artefacts;
			}
		).render(editor, { jobDescription: false, folder: false, artefacts: true });
	}

	private renderReviewStep(container: HTMLElement): void {
		container.createEl("p", { text: "Review the application before creating it." });
		const folderName = this.plugin.appService.sanitizeFileName(`${this.role.trim()} - ${this.company.trim()}`)
			.substring(0, 180)
			.trim();
		const baseFolderPath = normalizePath(`${this.plugin.settings.trackerFolderPath}/${folderName}`);
		let applicationFolderPath = baseFolderPath;
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(applicationFolderPath)) {
			applicationFolderPath = `${baseFolderPath} (${suffix})`;
			suffix++;
		}
		this.addReviewRow(container, "Application Folder", applicationFolderPath);
		this.addReviewRow(
			container,
			"Job Description",
			this.jobDescriptionSource === "text"
				? `Pasted text (${this.jobDescriptionText.trim().length} characters)`
				: this.artefacts.find((artefact) => artefact.type === "Job Description")?.filename || "No file selected"
		);
		this.addReviewRow(container, "Company", this.company || "Not entered");
		this.addReviewRow(container, "Role", this.role || "Not entered");
		this.addReviewRow(container, "Status", this.status);
		this.addReviewRow(container, "Date Posted", this.datePosted || "Not specified");
		this.addReviewRow(container, "Closing Date", this.closingDate || "Not specified");
		this.addReviewRow(container, "Tags", this.tags.join(", ") || "None");

		const supportingArtefacts = this.getSupportingArtefacts();
		container.createEl("h3", { text: `Supporting Artefacts (${supportingArtefacts.length})` });
		if (supportingArtefacts.length) {
			const list = container.createEl("ul");
			for (const artefact of supportingArtefacts) list.createEl("li", { text: `${artefact.type}: ${artefact.filename}` });
		} else {
			container.createEl("p", { text: "No supporting artefacts selected." });
		}
	}

	private addReviewRow(container: HTMLElement, label: string, value: string): void {
		const row = container.createDiv({ cls: "job-tracker-review-row" });
		row.createEl("strong", { text: label });
		row.createEl("span", { text: value });
	}

	private getSupportingArtefacts(): ApplicationArtefact[] {
		return this.artefacts.filter((artefact) => artefact.type !== "Job Description");
	}

	private validateStep(): boolean {
		if (this.activeStep === 0) {
			const jdFiles = this.artefacts.filter((artefact) => artefact.type === "Job Description");
			if (this.jobDescriptionSource === "file") {
				if (jdFiles.length !== 1) {
					new Notice("Select one Job Description file or choose Paste JD Text.");
					return false;
				}
				if (!["pdf", "txt", "md"].includes(jdFiles[0].filename.split(".").pop()?.toLowerCase() || "")) {
					new Notice("Job Description files must be PDF, TXT, or Markdown.");
					return false;
				}
			} else if (!this.jobDescriptionText.trim()) {
				new Notice("Paste the Job Description text or choose a file.");
				return false;
			}
		}
		if (this.activeStep === 1) {
			if (!this.company.trim()) {
				new Notice("Please enter a company name.");
				this.companyInputEl?.focus();
				return false;
			}
			if (!this.role.trim()) {
				new Notice("Please enter a role / job title.");
				this.roleInputEl?.focus();
				return false;
			}
			if (!this.datePosted.trim()) this.datePosted = this.plugin.appService.getTodayDateString();
			for (const [label, value] of [
				["Date Posted", this.datePosted],
				["Date Applied", this.dateApplied],
				["Follow Up Date", this.followUpDate],
				["Closing Date", this.closingDate],
			]) {
				if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
					new Notice(`Please select a valid date for ${label}.`);
					return false;
				}
			}
			if (this.recruiterEmail.trim() && !sanitizeEmail(this.recruiterEmail.trim())) {
				new Notice("Please enter a valid email address for the contact.");
				return false;
			}
			if (this.jobUrl.trim() && !sanitizeUrl(this.jobUrl.trim())) {
				new Notice("Job URL must begin with http:// or https://");
				return false;
			}
		}
		return true;
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

	private async handleSubmit(): Promise<void> {
		if (!this.validateStep() || !this.company.trim() || !this.role.trim()) return;
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
			const selectedArtefacts = this.jobDescriptionSource === "file"
				? this.artefacts
				: this.artefacts.filter((artefact) => artefact.type !== "Job Description");
			const file = await this.plugin.appService.createApplication({
				company: this.company.trim(),
				role: this.role.trim(),
				status: this.status,
				dateApplied: this.dateApplied.trim(),
				datePosted: this.datePosted.trim() || undefined,
				location: this.location.trim(),
				workplaceType: this.workplaceType || undefined,
				employmentType: this.employmentType || undefined,
				salary: this.salary.trim(),
				jobUrl: this.jobUrl.trim(),
				source: this.source.trim(),
				followUpDate: this.followUpDate.trim() || undefined,
				closingDate: this.closingDate.trim() || undefined,
				notes: this.notes.trim(),
				jobDescription: this.jobDescriptionSource === "text" ? this.jobDescriptionText.trim() : undefined,
				artefacts: selectedArtefacts,
				jobDescriptionFile: this.jobDescriptionSource === "file"
					? selectedArtefacts.find((artefact) => artefact.type === "Job Description")?.path
					: undefined,
				contacts,
				tags: this.tags,
			});

			this.close();
			await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (error) {
			console.error("Job Tracker: Modal action failed:", error);
			new Notice(`Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
