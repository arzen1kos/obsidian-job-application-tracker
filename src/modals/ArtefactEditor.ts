import { App, FuzzySuggestModal, Notice, TFile, TFolder, normalizePath, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { ApplicationArtefact, ARTEFACT_TYPES, ArtefactType, isAbsoluteFilePath } from "../types";

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

interface SelectedArtefactFile {
	path: string;
	name: string;
	stat?: { ctime: number; mtime: number };
}

function getNativePath(file: File): string {
	return (file as File & { path?: string }).path || "";
}

function getElectronShell(): {
	openPath?: (path: string) => Promise<string>;
	showItemInFolder?: (path: string) => void;
} | null {
	try {
		return require("electron").shell ?? null;
	} catch {
		return null;
	}
}

function getExternalFs(): {
	existsSync?: (path: string) => boolean;
	statSync?: (path: string) => { isFile(): boolean; isDirectory(): boolean; ctimeMs: number; mtimeMs: number };
} | null {
	try {
		return require("fs");
	} catch {
		return null;
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
						this.openFilePicker(container, (file) => {
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
		const folder = folderPath && !isAbsoluteFilePath(folderPath)
			? this.app.vault.getAbstractFileByPath(normalizePath(folderPath))
			: null;
		const externalExists = folderPath && isAbsoluteFilePath(folderPath) ? this.externalPathExists(folderPath, true) : false;
		if (!folderPath || (!(folder instanceof TFolder) && !externalExists)) {
			if (folderPath) {
				container.createEl("p", { text: "Folder not found", cls: "job-tracker-missing-reference" });
			}
			const missingFolderSetting = new Setting(container)
				.setName(folderPath ? "Choose another folder" : "No folder linked")
				.addButton((button) =>
					button.setButtonText("Browse Folder").onClick(() => {
					this.openFolderPicker(container, (path) => {
						this.value.applicationFolderPath = path;
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
			.setName(folder instanceof TFolder ? folder.name || "Vault root" : this.getPathBasename(folderPath))
			.setDesc(isAbsoluteFilePath(folderPath) ? "Outside this vault" : "")
			.addButton((button) =>
				button.setButtonText("Open Folder").onClick(() => {
					if (folder instanceof TFolder) void this.openFolder(folder);
					else this.openExternalFolder(folderPath);
				})
			)
			.addButton((button) =>
				button.setButtonText("Change Folder").onClick(() => {
					this.openFolderPicker(container, (path) => {
						this.value.applicationFolderPath = path;
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
						this.openFilePicker(container, (file) => {
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
			if (artefact.type !== "Job Description") combined.set(artefact.path, { artefact, linked: true });
		}
		for (const artefact of this.discovered) {
			if (artefact.type !== "Job Description" && !combined.has(artefact.path)) {
				combined.set(artefact.path, { artefact, linked: false });
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
		const external = isAbsoluteFilePath(artefact.path);
		const missing = external ? !this.externalPathExists(artefact.path) : !(file instanceof TFile);
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
					else if (external) this.openExternalFile(artefact.path);
				})
			);
			row.addButton((button) =>
				button.setButtonText(external ? "Show in Folder" : "Reveal in Vault").onClick(() => {
					if (file instanceof TFile) void this.revealFile(file);
					else if (external) this.revealExternalFile(artefact.path);
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
		this.openFilePicker(container, (file) => {
			this.value.artefacts = this.value.artefacts.map((item) =>
				item.id === artefact.id
					? {
						...item,
						path: file.path,
						filename: file.name,
						createdAt: file.stat?.ctime ? new Date(file.stat.ctime).toISOString() : item.createdAt,
						updatedAt: file.stat?.mtime ? new Date(file.stat.mtime).toISOString() : item.updatedAt,
					}
					: item
			);
			this.publish(container);
		});
	}

	private upsertArtefact(type: ArtefactType, file: SelectedArtefactFile, existing?: ApplicationArtefact): ApplicationArtefact[] {
		const createdAt = file.stat?.ctime ? new Date(file.stat.ctime).toISOString() : new Date().toISOString();
		const updatedAt = file.stat?.mtime ? new Date(file.stat.mtime).toISOString() : createdAt;
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

	private openFilePicker(container: HTMLElement, onChoose: (file: SelectedArtefactFile) => void): void {
		this.openNativePicker(container, false, (selected) => {
			const path = getNativePath(selected);
			if (!path || !isAbsoluteFilePath(path)) {
				new Notice("This Obsidian platform does not expose the selected file's absolute path. Choose a file from the vault instead.");
				new VaultFileSuggestModal(this.app, (file) => onChoose(file)).open();
				return;
			}
			let stat: { ctimeMs: number; mtimeMs: number } | undefined;
			try {
				stat = getExternalFs()?.statSync?.(path);
			} catch (error) {
				console.error("Job Tracker: Could not inspect selected external file:", error);
				new Notice("The selected file is no longer available.");
				return;
			}
			onChoose({
				path,
				name: selected.name,
				stat: stat ? { ctime: stat.ctimeMs, mtime: stat.mtimeMs } : undefined,
			});
		});
	}

	private openFolderPicker(container: HTMLElement, onChoose: (path: string) => void): void {
		this.openNativePicker(container, true, (selected) => {
			const selectedPath = getNativePath(selected);
			if (selectedPath && isAbsoluteFilePath(selectedPath)) {
				const folderPath = selectedPath.slice(0, Math.max(selectedPath.lastIndexOf("/"), selectedPath.lastIndexOf("\\")));
				onChoose(folderPath);
				return;
			}
			new Notice("This Obsidian platform does not expose the selected folder's absolute path. Choose a folder from the vault instead.");
			new VaultFolderSuggestModal(this.app, (folder) => onChoose(folder.path)).open();
		});
	}

	private openNativePicker(
		container: HTMLElement,
		directory: boolean,
		onSelect: (file: File) => void
	): void {
		const input = container.createEl("input", {
			type: "file",
			attr: {
				...(directory ? { webkitdirectory: "", directory: "" } : {}),
			},
		});
		input.style.display = "none";
		input.onchange = () => {
			const selected = input.files?.[0];
			if (selected) onSelect(selected);
			input.remove();
		};
		input.addEventListener("cancel", () => input.remove(), { once: true });
		input.click();
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

	private externalPathExists(path: string, directory = false): boolean {
		try {
			const fs = getExternalFs();
			if (!fs?.existsSync?.(path)) return false;
			if (!fs.statSync) return true;
			const stat = fs.statSync(path);
			return directory ? stat.isDirectory() : stat.isFile();
		} catch {
			return false;
		}
	}

	private getPathBasename(path: string): string {
		return path.split(/[\\/]/).filter(Boolean).pop() || path;
	}

	private openExternalFile(path: string): void {
		const shell = getElectronShell();
		if (!shell?.openPath) {
			new Notice("Opening files outside the vault is not supported on this Obsidian platform.");
			return;
		}
		void shell.openPath(path)
			.then((error) => {
				if (error) new Notice(`Could not open file: ${error}`);
			})
			.catch((error: unknown) => {
				console.error("Job Tracker: Could not open external file:", error);
				new Notice("Could not open the external file. Check the console for details.");
			});
	}

	private openExternalFolder(path: string): void {
		const shell = getElectronShell();
		if (!shell?.openPath) {
			new Notice("Opening folders outside the vault is not supported on this Obsidian platform.");
			return;
		}
		void shell.openPath(path)
			.then((error) => {
				if (error) new Notice(`Could not open folder: ${error}`);
			})
			.catch((error: unknown) => {
				console.error("Job Tracker: Could not open external folder:", error);
				new Notice("Could not open the external folder. Check the console for details.");
			});
	}

	private revealExternalFile(path: string): void {
		const shell = getElectronShell();
		if (shell?.showItemInFolder) shell.showItemInFolder(path);
		else this.openExternalFolder(path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))));
	}
}

export function migrateArtefactReferences(values: ApplicationArtefact[], legacyJobDescription?: string): ApplicationArtefact[] {
	const byPath = new Map<string, ApplicationArtefact>();
	for (const item of values) {
		const path = isAbsoluteFilePath(item.path) ? item.path : normalizePath(item.path);
		if (path) byPath.set(path, { ...item, path, filename: item.filename || path.split(/[\\/]/).pop() || path });
	}
	const normalizedLegacy = legacyJobDescription
		? (isAbsoluteFilePath(legacyJobDescription) ? legacyJobDescription : normalizePath(legacyJobDescription))
		: "";
	if (normalizedLegacy && !byPath.has(normalizedLegacy)) {
		const path = normalizedLegacy;
		byPath.set(path, {
			id: `legacy-jd-${path}`,
			type: "Job Description",
			path,
			filename: path.split(/[\\/]/).pop() || path,
			createdAt: "",
			updatedAt: "",
		});
	}
	return [...byPath.values()];
}
