import { App, FuzzySuggestModal, Notice, TFile, TFolder, normalizePath, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { ApplicationArtefact, ARTEFACT_TYPES, ArtefactType } from "../types";

export interface ArtefactEditorValue {
	applicationFolderPath: string;
	artefacts: ApplicationArtefact[];
}

class VaultFileSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Search vault files...");
		this.emptyStateText = "No files found in the vault.";
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}

class VaultFolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Search vault folders...");
		this.emptyStateText = "No folders found in the vault.";
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter((item): item is TFolder => item instanceof TFolder);
	}

	getItemText(folder: TFolder): string {
		return folder.path || "Vault root";
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}

export class ArtefactEditor {
	private readonly app: App;
	private readonly plugin: JobApplicationTrackerPlugin;
	private readonly value: ArtefactEditorValue;
	private readonly onChange: (value: ArtefactEditorValue) => void;
	private readonly discovered: ApplicationArtefact[];
	private selectedType: ArtefactType = "CV";
	private isAddingArtefact = false;

	constructor(
		app: App,
		plugin: JobApplicationTrackerPlugin,
		value: ArtefactEditorValue,
		onChange: (value: ArtefactEditorValue) => void,
		discovered: ApplicationArtefact[] = []
	) {
		this.app = app;
		this.plugin = plugin;
		this.value = {
			applicationFolderPath: value.applicationFolderPath,
			artefacts: [...value.artefacts],
		};
		this.onChange = onChange;
		this.discovered = discovered;
	}

	render(container: HTMLElement): void {
		container.empty();
		this.renderJobDescription(container);
		this.renderFolder(container);
		this.renderArtefacts(container);
	}

	private publish(container: HTMLElement): void {
		this.onChange({
			applicationFolderPath: this.value.applicationFolderPath,
			artefacts: [...this.value.artefacts],
		});
		this.render(container);
	}

	private renderJobDescription(container: HTMLElement): void {
		container.createEl("h4", { text: "Job Description" });
		const current = this.value.artefacts.find((artefact) => artefact.type === "Job Description");
		if (!current) {
			new Setting(container)
				.setName("Job Description")
				.addButton((button) =>
					button.setButtonText("Browse File").onClick(() => {
						this.openFilePicker((file) => {
							this.value.artefacts = this.upsertArtefact("Job Description", file, current);
							this.publish(container);
						});
					})
				);
			return;
		}
		this.renderArtefactRow(container, current, true);
	}

	private renderFolder(container: HTMLElement): void {
		container.createEl("h4", { text: "Artefact Folder" });
		const folderPath = this.value.applicationFolderPath;
		const folder = folderPath ? this.app.vault.getAbstractFileByPath(normalizePath(folderPath)) : null;
		if (!folderPath || !(folder instanceof TFolder)) {
			if (folderPath) {
				container.createEl("p", { text: "Folder not found", cls: "job-tracker-missing-reference" });
			}
			const missingFolderSetting = new Setting(container)
				.setName(folderPath ? "Choose another folder" : "No folder linked")
				.addButton((button) =>
					button.setButtonText("Browse Folder").onClick(() => {
						this.openFolderPicker((selected) => {
							this.value.applicationFolderPath = selected.path;
							this.publish(container);
						});
					})
				);
			if (folderPath) {
				missingFolderSetting.addButton((button) =>
					button.setButtonText("Remove Folder").onClick(() => {
						this.value.applicationFolderPath = "";
						this.publish(container);
					})
				);
			}
			return;
		}
		new Setting(container)
			.setName(folder.path || "Vault root")
			.addButton((button) =>
				button.setButtonText("Open Folder").onClick(() => this.openFolder(folder))
			)
			.addButton((button) =>
				button.setButtonText("Change Folder").onClick(() => {
					this.openFolderPicker((selected) => {
						this.value.applicationFolderPath = selected.path;
						this.publish(container);
					});
				})
			)
			.addButton((button) =>
				button.setButtonText("Remove").onClick(() => {
					this.value.applicationFolderPath = "";
					this.publish(container);
				})
			);
	}

	private renderArtefacts(container: HTMLElement): void {
		container.createEl("h4", { text: "Artefacts" });
		new Setting(container)
			.setName("Manage linked files")
			.addButton((button) =>
				button.setButtonText(this.isAddingArtefact ? "Cancel" : "+ Add Artefact")
					.setCta()
					.onClick(() => {
						this.isAddingArtefact = !this.isAddingArtefact;
						this.render(container);
					})
			);
		if (this.isAddingArtefact) {
			new Setting(container)
				.setName("Artefact Type")
				.addDropdown((dropdown) => {
					for (const type of ARTEFACT_TYPES) {
						if (type !== "Job Description") dropdown.addOption(type, type);
					}
					dropdown.setValue(this.selectedType);
					dropdown.onChange((value) => {
						this.selectedType = value as ArtefactType;
					});
				})
				.addButton((button) =>
					button.setButtonText("Select File").setCta().onClick(() => {
						this.openFilePicker((file) => {
							const nextArtefacts = this.upsertArtefact(this.selectedType, file);
							if (nextArtefacts === this.value.artefacts) return;
							this.value.artefacts = nextArtefacts;
							this.isAddingArtefact = false;
							this.publish(container);
						});
					})
				);
		}

		const combined = new Map<string, { artefact: ApplicationArtefact; linked: boolean }>();
		for (const artefact of this.value.artefacts) {
			if (artefact.type !== "Job Description") combined.set(normalizePath(artefact.path), { artefact, linked: true });
		}
		for (const artefact of this.discovered) {
			if (artefact.type !== "Job Description" && !combined.has(normalizePath(artefact.path))) {
				combined.set(normalizePath(artefact.path), { artefact, linked: false });
			}
		}

		const groups: { title: string; matches: (artefact: ApplicationArtefact) => boolean }[] = [
			{ title: "CVs", matches: (item) => item.type === "CV" },
			{ title: "Cover Letters", matches: (item) => item.type === "Cover Letter" },
			{ title: "Interview Notes", matches: (item) => item.type === "Interview Notes" || item.type === "Recruiter Notes" || item.type === "Follow-up Notes" || item.type === "General Notes" },
			{ title: "Other Artefacts", matches: (item) => !["CV", "Cover Letter", "Job Description", "Interview Notes", "Recruiter Notes", "Follow-up Notes", "General Notes"].includes(item.type) },
		];

		for (const group of groups) {
			const rows = [...combined.values()].filter(({ artefact }) => group.matches(artefact));
			if (rows.length === 0) continue;
			container.createEl("h5", { text: group.title });
			for (const { artefact, linked } of rows) {
				this.renderArtefactRow(container, artefact, linked);
			}
		}
	}

	private renderArtefactRow(container: HTMLElement, artefact: ApplicationArtefact, linked: boolean): void {
		const file = this.plugin.appService.resolveFile(artefact.path);
		const missing = !(file instanceof TFile);
		const row = new Setting(container)
			.setName(`${artefact.type}: ${artefact.filename}`)
			.setDesc(missing ? "File not found" : linked ? "" : "Discovered in the linked folder");
		if (missing) {
			row.addButton((button) =>
				button.setButtonText("Relink").onClick(() => this.chooseReplacement(artefact, container))
			);
		} else {
			row.addButton((button) =>
				button.setButtonText("Open").onClick(() => {
					if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
				})
			);
			row.addButton((button) =>
				button.setButtonText("Reveal in Vault").onClick(() => {
					if (file instanceof TFile) void this.revealFile(file);
				})
			);
		}

		if (!linked) return;
		row.addButton((button) =>
			button.setButtonText("Change").onClick(() => this.chooseReplacement(artefact, container))
		);
		row.addButton((button) =>
			button.setButtonText("Remove").onClick(() => {
				this.value.artefacts = this.value.artefacts.filter((item) => item.id !== artefact.id);
				this.publish(container);
			})
		);
	}

	private chooseReplacement(artefact: ApplicationArtefact, container: HTMLElement): void {
		this.openFilePicker((file) => {
			this.value.artefacts = this.value.artefacts.map((item) =>
				item.id === artefact.id
					? {
						...item,
						path: file.path,
						filename: file.name,
						createdAt: file.stat.ctime ? new Date(file.stat.ctime).toISOString() : item.createdAt,
						updatedAt: file.stat.mtime ? new Date(file.stat.mtime).toISOString() : item.updatedAt,
					}
					: item
			);
			this.publish(container);
		});
	}

	private upsertArtefact(type: ArtefactType, file: TFile, existing?: ApplicationArtefact): ApplicationArtefact[] {
		const createdAt = file.stat.ctime ? new Date(file.stat.ctime).toISOString() : new Date().toISOString();
		const updatedAt = file.stat.mtime ? new Date(file.stat.mtime).toISOString() : createdAt;
		const artefact: ApplicationArtefact = {
			id: existing?.id || crypto.randomUUID(),
			type,
			path: file.path,
			filename: file.name,
			createdAt: existing?.createdAt || createdAt,
			updatedAt,
		};
		if (type === "Job Description") {
			return [...this.value.artefacts.filter((item) => item.type !== "Job Description"), artefact];
		}
		const sameLink = this.value.artefacts.findIndex((item) => item.path === file.path && item.type === type);
		if (sameLink !== -1) {
			new Notice("This file is already linked as that artefact type.");
			return this.value.artefacts;
		}
		return [...this.value.artefacts, artefact];
	}

	private openFilePicker(onChoose: (file: TFile) => void): void {
		new VaultFileSuggestModal(this.app, onChoose).open();
	}

	private openFolderPicker(onChoose: (folder: TFolder) => void): void {
		new VaultFolderSuggestModal(this.app, onChoose).open();
	}

	private async revealFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf("tab").openFile(file);
		const explorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (explorerLeaf) await this.app.workspace.revealLeaf(explorerLeaf);
	}

	private async openFolder(folder: TFolder): Promise<void> {
		const file = this.app.vault.getFiles().find((item) => item.path.startsWith(folder.path + "/"));
		if (file) {
			await this.revealFile(file);
		} else {
			new Notice(`This folder is empty: ${folder.name}`);
		}
	}
}

export function migrateArtefactReferences(values: ApplicationArtefact[], legacyJobDescription?: string): ApplicationArtefact[] {
	const byPath = new Map<string, ApplicationArtefact>();
	for (const item of values) {
		const path = normalizePath(item.path);
		if (path) byPath.set(path, { ...item, path, filename: item.filename || path.split("/").pop() || path });
	}
	if (legacyJobDescription && !byPath.has(normalizePath(legacyJobDescription))) {
		const path = normalizePath(legacyJobDescription);
		byPath.set(path, {
			id: `legacy-jd-${path}`,
			type: "Job Description",
			path,
			filename: path.split("/").pop() || path,
			createdAt: "",
			updatedAt: "",
		});
	}
	return [...byPath.values()];
}
