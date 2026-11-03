import { App, Notice, TFile, TFolder, normalizePath, stringifyYaml } from "obsidian";
import { ApplicationArtefact, ARTEFACT_TYPES, ArtefactType, Contact, EmploymentType, InterviewRound, InterviewRoundType, JobApplication, JobApplicationFrontMatter, JobStatus, StatusHistoryEntry, WorkplaceType, isFinalStatus } from "../types";
import JobApplicationTrackerPlugin from "../main";

/**
 * Validates and sanitizes a URL, allowing only http: and https: protocols.
 * Returns empty string if the URL is invalid or uses a disallowed protocol (e.g. javascript:).
 */
export function sanitizeUrl(url?: string | null): string {
	if (!url) return "";
	const trimmed = url.trim();
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return trimmed;
		}
	} catch {
		// Not a valid URL
	}
	return "";
}

/**
 * Validates an email address. Returns empty string if invalid or dangerous.
 */
export function sanitizeEmail(email?: string | null): string {
	if (!email) return "";
	const trimmed = email.trim();
	if (/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(trimmed)) {
		return trimmed;
	}
	return "";
}

/**
 * Escapes characters that have markdown syntax significance to avoid unintentional formatting injection.
 */
export function escapeMarkdown(text?: string | null, preserveNewlines = false): string {
	if (!text) return "";
	let s = text;
	if (!preserveNewlines) {
		s = s.replace(/[\r\n]+/g, " ");
	}
	return s
		.replace(/\\/g, "\\\\")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)")
		.replace(/#/g, "\\#")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/\|/g, "\\|")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export class ApplicationService {
	private readonly app: App;
	private readonly plugin: JobApplicationTrackerPlugin;
	private fileLocks = new Map<string, Promise<void>>();
	private cachedApplications: JobApplication[] | null = null;
	private cachedArtefacts = new Map<string, ApplicationArtefact[]>();

	invalidateCache(): void {
		this.cachedApplications = null;
		this.cachedArtefacts.clear();
	}

	/**
	 * Checks if a file is within the tracked application folder or has job-application frontmatter.
	 */
	isTrackedFile(file: TFile): boolean {
		const appFolder = normalizePath(this.plugin.settings.trackerFolderPath);
		if (file.path.startsWith(appFolder + "/") || file.path === appFolder) {
			return true;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.type === "job-application";
	}

	private applyFrontMatterFields(fm: JobApplicationFrontMatter, fields: Partial<JobApplication>): void {
		if (fields.company !== undefined) fm.company = fields.company;
		if (fields.role !== undefined) fm.role = fields.role;
		if (fields.status !== undefined) fm.status = fields.status;
		if (fields.location !== undefined) fm.location = fields.location;
		if (fields.workplaceType !== undefined) fm.workplaceType = fields.workplaceType;
		if (fields.employmentType !== undefined) fm.employmentType = fields.employmentType;
		if (fields.salary !== undefined) fm.salary = fields.salary;
		if (fields.jobUrl !== undefined) fm.jobUrl = fields.jobUrl;
		if (fields.source !== undefined) fm.source = fields.source;
		if (fields.followUpDate !== undefined) fm.followUpDate = fields.followUpDate;
		if (fields.closingDate !== undefined) fm.closingDate = fields.closingDate;
		if (fields.applicationFolderPath !== undefined) fm.applicationFolderPath = fields.applicationFolderPath;
		if (fields.artefacts !== undefined) fm.artefacts = fields.artefacts;
		if (fields.dateApplied !== undefined) fm.dateApplied = fields.dateApplied;
		if (fields.jobDescriptionFile !== undefined) fm.jobDescriptionFile = fields.jobDescriptionFile;
		if (fields.contacts !== undefined) fm.contacts = fields.contacts;
		if (fields.interviews !== undefined) fm.interviews = fields.interviews;
	}

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Executes an asynchronous operation exclusively for a given file path.
	 * Concurrent operations on the same file are queued sequentially to prevent race conditions.
	 */
	async runWithFileLock<T>(file: TFile, op: () => Promise<T>): Promise<T> {
		const key = file.path;
		const prev = this.fileLocks.get(key) || Promise.resolve();
		let releaseLock: () => void;
		const next = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const lockPromise = prev.then(
			() => next,
			() => next
		);
		this.fileLocks.set(key, lockPromise);

		try {
			await prev;
			return await op();
		} finally {
			releaseLock!();
			if (this.fileLocks.get(key) === lockPromise) {
				this.fileLocks.delete(key);
			}
		}
	}

	/**
	 * Resolves a file path or wikilink to a TFile in the vault.
	 */
	resolveFile(pathOrLink: string): TFile | null {
		if (!pathOrLink) return null;
		const normalized = normalizePath(pathOrLink);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) {
			return file;
		}
		return this.app.metadataCache.getFirstLinkpathDest(pathOrLink, "");
	}

	/**
	 * Resolves a file path to a TFile and executes the provided action.
	 * Displays user feedback if the file cannot be found.
	 */
	async withFile<T>(
		pathOrLink: string,
		action: (file: TFile) => Promise<T> | T,
		errorMessage = "Application file could not be found. It may have been moved or deleted."
	): Promise<T | null> {
		const file = this.resolveFile(pathOrLink);
		if (file instanceof TFile) {
			return await action(file);
		}
		new Notice(errorMessage);
		return null;
	}

	/**
	 * Ensure that a folder exists in the vault, creating parent directories if needed.
	 */
	async ensureFolder(folderPath: string): Promise<TFolder> {
		const normalized = normalizePath(folderPath.trim());
		if (!normalized || normalized === "/" || normalized === ".") {
			return this.app.vault.getRoot();
		}

		const abstractItem = this.app.vault.getAbstractFileByPath(normalized);
		if (abstractItem instanceof TFolder) {
			return abstractItem;
		}
		if (abstractItem instanceof TFile) {
			throw new Error(`Path "${normalized}" is an existing file, not a folder.`);
		}

		// Ensure parent folder exists first
		const parentPath = normalized.substring(0, normalized.lastIndexOf("/"));
		if (parentPath) {
			await this.ensureFolder(parentPath);
		}

		try {
			return await this.app.vault.createFolder(normalized);
		} catch (err) {
			const checkAgain = this.app.vault.getAbstractFileByPath(normalized);
			if (checkAgain instanceof TFolder) {
				return checkAgain;
			}
			throw err;
		}
	}

	/**
	 * Sanitizes a string so it can safely be used as a markdown filename in Obsidian.
	 */
	sanitizeFileName(name: string, fallback = "Untitled Application"): string {
		const clean = (name || "")
			.replace(/[\\/:*?"<>|#^[\]]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
		return clean || fallback;
	}

	/**
	 * Formats today's date in YYYY-MM-DD format.
	 */
	getTodayDateString(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	parseArtefactReferences(value: string, existing: ApplicationArtefact[] = []): ApplicationArtefact[] {
		const now = new Date().toISOString();
		const artefacts: ApplicationArtefact[] = [];
		for (const line of value.split(/\r?\n/)) {
			const [rawType, ...pathParts] = line.split("|");
			const path = normalizePath((pathParts.length ? pathParts.join("|") : rawType).trim());
			if (!path) continue;
			const requestedType = pathParts.length ? rawType.trim() : "";
			const type = ARTEFACT_TYPES.find((item) => item.toLowerCase() === requestedType.toLowerCase())
				|| this.inferArtefactType(path);
			const previous = existing.find((item) => normalizePath(item.path) === path && item.type === type);
			artefacts.push({
				id: previous?.id || crypto.randomUUID(),
				type,
				path,
				filename: path.split("/").pop() || path,
				createdAt: previous?.createdAt || now,
				updatedAt: previous?.updatedAt || now,
			});
		}
		return artefacts;
	}

	isReferencedPath(path: string): boolean {
		const normalized = normalizePath(path);
		return this.getAllApplications().some((application) => {
			return this.applicationReferencesPath(application, normalized);
		});
	}

	private applicationReferencesPath(application: JobApplication, path: string): boolean {
		const normalized = normalizePath(path);
		const references = [
			application.applicationFolderPath,
			application.jobDescriptionFile,
			...(application.artefacts || []).map((artefact) => artefact.path),
		].filter((reference): reference is string => !!reference).map(normalizePath);
		return references.some((reference) =>
			reference === normalized ||
			reference.startsWith(normalized + "/") ||
			normalized.startsWith(reference + "/")
		);
	}

	private inferArtefactType(path: string): ArtefactType {
		const name = path.split("/").pop()?.toLowerCase() || "";
		if (/\b(job[ -]?description|jd)\b/.test(name)) return "Job Description";
		if (/\b(cv|resume|résumé)\b/.test(name)) return "CV";
		if (/\bcover[ -]?letter\b/.test(name)) return "Cover Letter";
		if (/\binterview\b/.test(name)) return "Interview Notes";
		if (/\brecruiter\b/.test(name)) return "Recruiter Notes";
		if (/\bfollow[ -]?up\b/.test(name)) return "Follow-up Notes";
		if (/\bportfolio\b/.test(name)) return "Portfolio";
		if (/\bassessment|test|challenge\b/.test(name)) return "Assessment";
		if (/\boffer\b/.test(name)) return "Offer Letter";
		if (/\bcontract\b/.test(name)) return "Contract";
		if (name.endsWith(".md")) return "General Notes";
		return "Custom";
	}

	private deserializeArtefacts(value: unknown): ApplicationArtefact[] {
		if (typeof value === "string") return this.parseArtefactReferences(value);
		if (!Array.isArray(value)) return [];
		const artefacts: ApplicationArtefact[] = [];
		for (const item of value) {
			if (typeof item === "string") {
				artefacts.push(...this.parseArtefactReferences(item));
				continue;
			}
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, unknown>;
			if (typeof record.path !== "string" || !record.path.trim()) continue;
			const path = normalizePath(record.path);
			const type = ARTEFACT_TYPES.find((candidate) => candidate === record.type) || this.inferArtefactType(path);
			artefacts.push({
				id: typeof record.id === "string" ? record.id : `legacy-${path}`,
				type,
				path,
				filename: typeof record.filename === "string" ? record.filename : path.split("/").pop() || path,
				createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
				updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
			});
		}
		return artefacts;
	}

	getApplicationArtefacts(application: JobApplication): ApplicationArtefact[] {
		const cached = this.cachedArtefacts.get(application.filePath);
		if (cached) return cached;
		const byPath = new Map<string, ApplicationArtefact>();
		const persisted = application.artefacts || [];
		for (const artefact of persisted) {
			if (artefact && typeof artefact.path === "string" && artefact.path) {
				const path = normalizePath(artefact.path);
				const file = this.resolveFile(path);
				byPath.set(path, {
					...artefact,
					path,
					filename: artefact.filename || path.split("/").pop() || path,
					exists: file instanceof TFile,
				});
			}
		}

		if (application.jobDescriptionFile) {
			const path = normalizePath(application.jobDescriptionFile);
			if (!byPath.has(path)) {
				const file = this.resolveFile(path);
				byPath.set(path, {
					id: `legacy-jd-${path}`,
					type: "Job Description",
					path,
					filename: path.split("/").pop() || path,
					createdAt: "",
					updatedAt: "",
					exists: file instanceof TFile,
				});
			}
		}

		const folderPath = normalizePath(application.applicationFolderPath || "");
		if (folderPath) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (folder instanceof TFolder) {
				for (const file of this.app.vault.getFiles()) {
					if (
						file.path.startsWith(folderPath + "/") &&
						file.path !== application.filePath &&
						!byPath.has(file.path)
					) {
						const date = (timestamp: number) => timestamp ? new Date(timestamp).toISOString() : "";
						byPath.set(file.path, {
							id: file.path,
							type: this.inferArtefactType(file.path),
							path: file.path,
							filename: file.name,
							createdAt: date(file.stat.ctime),
							updatedAt: date(file.stat.mtime),
							exists: true,
						});
					}
				}
			}
		}
		const artefacts = [...byPath.values()].sort((a, b) => a.filename.localeCompare(b.filename));
		this.cachedArtefacts.set(application.filePath, artefacts);
		return artefacts;
	}

	async handleFileRename(newPath: string, oldPath: string): Promise<void> {
		const oldNormalized = normalizePath(oldPath);
		const newNormalized = normalizePath(newPath);
		const replacePath = (path: string): string => {
			const normalized = normalizePath(path);
			return normalized === oldNormalized || normalized.startsWith(oldNormalized + "/")
				? newNormalized + normalized.slice(oldNormalized.length)
				: normalized;
		};
		try {
			for (const application of this.getAllApplications(true)) {
				if (!this.applicationReferencesPath(application, oldNormalized)) continue;
				const file = this.resolveFile(application.filePath);
				if (!(file instanceof TFile)) continue;
				let changed = false;
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (typeof fm.applicationFolderPath === "string") {
						const updatedPath = replacePath(fm.applicationFolderPath);
						if (updatedPath !== fm.applicationFolderPath) {
							fm.applicationFolderPath = updatedPath;
							changed = true;
						}
					}
					if (typeof fm.jobDescriptionFile === "string") {
						const updatedPath = replacePath(fm.jobDescriptionFile);
						if (updatedPath !== fm.jobDescriptionFile) {
							fm.jobDescriptionFile = updatedPath;
							changed = true;
						}
					}
					if (Array.isArray(fm.artefacts)) {
						for (const artefact of fm.artefacts) {
							if (artefact && typeof artefact.path === "string") {
								const updatedPath = replacePath(artefact.path);
								if (updatedPath !== artefact.path) {
									artefact.path = updatedPath;
									artefact.filename = updatedPath.split("/").pop() || updatedPath;
									artefact.updatedAt = new Date().toISOString();
									changed = true;
								}
							}
						}
					}
				});
				if (changed) {
					await this.app.vault.process(file, (content) =>
						content.replace(/(!?\[\[)([^\]|#]+)([^\]]*\]\])/g, (match, prefix: string, target: string, suffix: string) => {
							const updatedPath = replacePath(target);
							return updatedPath === normalizePath(target) ? match : `${prefix}${updatedPath}${suffix}`;
						})
					);
					this.invalidateCache();
				}
			}
		} catch (err) {
			console.error("Job Tracker: Failed to update linked paths after rename:", err);
			new Notice("Could not update all linked artefact paths after a rename. Check the console for details.");
		}
	}

	/**
	 * Inserts an entry into the Notes & Activity Log section, or appends the section at the end of the note if missing.
	 */
	appendActivityLogEntry(content: string, entry: string): string {
		const logHeaderRegex = /(?:^|\n)(#{1,6}\s+(?:📝\s*)?Notes\s*(?:&|and)?\s*Activity Log)/i;
		const match = content.match(logHeaderRegex);
		if (match && match[1]) {
			return content.replace(logHeaderRegex, (fullMatch, header) => {
				const prefix = fullMatch.startsWith("\n") ? "\n" : "";
				return `${prefix}${header}\n- ${entry}`;
			});
		}
		return `${content.trimEnd()}\n\n## 📝 Notes & Activity Log\n- ${entry}\n`;
	}

	/**
	 * Formats a contact into a safe markdown list line.
	 */
	formatContactLine(contact: Contact): string {
		const safeName = escapeMarkdown(contact.name);
		const safeRole = escapeMarkdown(contact.role);
		let line = `- **${safeName}** (${safeRole})`;
		const safeEmail = sanitizeEmail(contact.email);
		if (safeEmail) {
			line += ` - [${escapeMarkdown(contact.email)}](mailto:${safeEmail})`;
		} else if (contact.email) {
			line += ` - ${escapeMarkdown(contact.email)}`;
		}
		if (contact.phone) line += ` - ${escapeMarkdown(contact.phone)}`;
		const safeLinkedin = sanitizeUrl(contact.linkedin);
		if (safeLinkedin) {
			line += ` - [LinkedIn](${safeLinkedin})`;
		} else if (contact.linkedin) {
			line += ` - ${escapeMarkdown(contact.linkedin)}`;
		}
		if (contact.notes) line += `\n  - *Notes:* ${escapeMarkdown(contact.notes, true)}`;
		return line;
	}

	/**
	 * Formats an interview round into a safe markdown list line.
	 */
	formatInterviewLine(interview: InterviewRound): string {
		const prepLink = interview.prepNotePath ? ` - [[${interview.prepNotePath}|Prep Note]]` : "";
		const safeRound = escapeMarkdown(interview.roundName);
		const safeStatus = escapeMarkdown(interview.status);
		const safeDate = escapeMarkdown(interview.date || "TBD");
		const safeTime = interview.time ? ` ${escapeMarkdown(interview.time)}` : "";
		return `- **${safeRound}** (${safeStatus}) - ${safeDate}${safeTime}${prepLink}`;
	}

	/**
	 * Saves an attachment file (PDF, MD, etc.) into the attachments folder and returns the created TFile.
	 */
	async saveAttachment(file: File, prefix?: string): Promise<TFile> {
		try {
			const folderPath = this.plugin.settings.attachmentsFolderPath || "Job Applications/Attachments";
			await this.ensureFolder(folderPath);

			const arrayBuffer = await file.arrayBuffer();
			const safeOriginalName = this.sanitizeFileName(file.name);
			const cleanPrefix = prefix ? `${this.sanitizeFileName(prefix)} - ` : "";
			let baseFileName = `${cleanPrefix}${safeOriginalName}`;
			if (baseFileName.length > 180) {
				const extIndex = baseFileName.lastIndexOf(".");
				const ext = extIndex !== -1 ? baseFileName.substring(extIndex) : "";
				baseFileName = baseFileName.substring(0, 180 - ext.length).trim() + ext;
			}

			let filePath = `${normalizePath(folderPath)}/${baseFileName}`;
			let counter = 1;

			while (this.app.vault.getAbstractFileByPath(filePath) != null && counter < 1000) {
				const extIndex = baseFileName.lastIndexOf(".");
				const nameWithoutExt = extIndex !== -1 ? baseFileName.substring(0, extIndex) : baseFileName;
				const ext = extIndex !== -1 ? baseFileName.substring(extIndex) : "";
				filePath = `${normalizePath(folderPath)}/${nameWithoutExt} (${counter})${ext}`;
				counter++;
			}

			return await this.app.vault.createBinary(filePath, arrayBuffer);

		} catch (err) {
			console.error("Job Tracker: Failed to save attachment:", err);
			new Notice(`Failed to save attachment. Check console for details.`);
			throw err;
		}
	}

	/**
	 * Formats the ## 📋 Overview markdown section.
	 */
	formatOverviewSection(data: Partial<JobApplication>): string {
		const today = this.getTodayDateString();
		let sec = `## 📋 Overview\n`;
		if (data.salary) sec += `- **Salary / Comp:** ${escapeMarkdown(data.salary)}\n`;
		if (data.location) sec += `- **Location:** ${escapeMarkdown(data.location)}\n`;
		if (data.workplaceType) sec += `- **Workplace Model:** ${escapeMarkdown(data.workplaceType)}\n`;
		if (data.employmentType) sec += `- **Employment Type:** ${escapeMarkdown(data.employmentType)}\n`;
		if (data.source) sec += `- **Source:** ${escapeMarkdown(data.source)}\n`;
		if (data.followUpDate) sec += `- **Follow-up / Deadline:** ${escapeMarkdown(data.followUpDate)}\n`;
		if (data.closingDate) sec += `- **Closing Date:** ${escapeMarkdown(data.closingDate)}\n`;
		if (data.applicationFolderPath) sec += `- **Application Folder:** [[${data.applicationFolderPath}]]\n`;
		if (data.jobUrl) {
			const safeJobUrl = sanitizeUrl(data.jobUrl);
			if (safeJobUrl) {
				sec += `- **Job Posting:** [Link](${safeJobUrl})\n`;
			} else {
				sec += `- **Job Posting:** ${escapeMarkdown(data.jobUrl)}\n`;
			}
		}
		sec += `- **Applied Date:** ${escapeMarkdown(data.dateApplied || today)}\n`;
		return sec;
	}

	/**
	 * Generates markdown body content for a newly created application.
	 */
	generateNoteContent(appData: Partial<JobApplication>): string {
		const today = this.getTodayDateString();
		const company = escapeMarkdown(appData.company) || "Company";
		const role = escapeMarkdown(appData.role) || "Role";

		let body = `# ${company} - ${role}\n\n`;
		body += `${this.formatOverviewSection(appData)}\n`;

		body += `## 👥 Key Contacts\n`;
		if (appData.contacts && appData.contacts.length > 0) {
			for (const c of appData.contacts) {
				body += `${this.formatContactLine(c)}\n`;
			}
		} else {
			body += `*No contacts added yet.*\n`;
		}
		body += `\n`;

		body += `## 📅 Interviews & Stages\n`;
		if (appData.interviews && appData.interviews.length > 0) {
			for (const iv of appData.interviews) {
				body += `${this.formatInterviewLine(iv)}\n`;
			}
		} else {
			body += `*No interviews scheduled yet.*\n`;
		}
		body += `\n`;

		body += `## 📝 Notes & Activity Log\n`;
		if (appData.notes) {
			body += `- **${today}**: ${escapeMarkdown(appData.notes, true)}\n`;
		} else {
			body += `- **${today}**: Application created (Status: ${escapeMarkdown(appData.status || "Applied")})\n`;
		}
		body += `\n`;

		body += `## 📄 Job Description\n`;
		if (appData.jobDescriptionFile) {
			const isPdf = appData.jobDescriptionFile.toLowerCase().endsWith(".pdf");
			const title = isPdf ? "Job Description (PDF)" : "Job Description (Markdown)";
			body += `> [!abstract]- 📎 ${title}\n> ![[${appData.jobDescriptionFile}]]\n\n`;
		}
		if (appData.jobDescription) {
			body += `${appData.jobDescription}\n`;
		} else if (!appData.jobDescriptionFile) {
			body += `*Paste job description or requirements here...*\n`;
		}

		return body;
	}

	/**
	 * Creates a new job application markdown file with frontmatter and structured body.
	 */
	async createApplication(data: {
		company: string;
		role: string;
		status?: JobStatus;
		dateApplied?: string;
		location?: string;
		workplaceType?: WorkplaceType;
		employmentType?: EmploymentType;
		salary?: string;
		jobUrl?: string;
		source?: string;
		followUpDate?: string;
		closingDate?: string;
		applicationFolderPath?: string;
		artefacts?: ApplicationArtefact[];
		notes?: string;
		jobDescription?: string;
		jobDescriptionFile?: string;
		contacts?: Contact[];
	}): Promise<TFile> {
		try {
			const folderPath = this.plugin.settings.trackerFolderPath;
			await this.ensureFolder(folderPath);

			const today = this.getTodayDateString();
			const status = data.status || this.plugin.settings.defaultStatus || "Applied";
			const dateApplied = data.dateApplied || today;

			let baseFileName = this.sanitizeFileName(`${data.company} - ${data.role}`);
			if (baseFileName.length > 180) {
				baseFileName = baseFileName.substring(0, 180).trim();
			}
			let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
			let counter = 1;

			while (this.app.vault.getAbstractFileByPath(filePath) != null && counter < 1000) {
				filePath = `${normalizePath(folderPath)}/${baseFileName} (${counter}).md`;
				counter++;
			}

			const initialStatusHistory: StatusHistoryEntry[] = [
				{
					status: status,
					date: today,
					note: data.notes || "Application created",
				},
			];

			const frontmatterObj: JobApplicationFrontMatter = {
				type: "job-application",
				company: data.company,
				role: data.role,
				status: status,
				dateApplied: dateApplied,
				lastUpdated: today,
				location: data.location || "",
				workplaceType: data.workplaceType || undefined,
				employmentType: data.employmentType || undefined,
				salary: data.salary || "",
				jobUrl: data.jobUrl || "",
				source: data.source || "",
				followUpDate: data.followUpDate || undefined,
				closingDate: data.closingDate || undefined,
				applicationFolderPath: data.applicationFolderPath ? normalizePath(data.applicationFolderPath) : undefined,
				artefacts: data.artefacts?.length
					? data.artefacts
					: data.jobDescriptionFile
						? this.parseArtefactReferences(`Job Description | ${data.jobDescriptionFile}`)
						: [],
				jobDescriptionFile: data.jobDescriptionFile || "",
				tags: ["job-application"],
				contacts: data.contacts || [],
				interviews: [],
				statusHistory: initialStatusHistory,
			};

			const yamlHeader = `---\n${stringifyYaml(frontmatterObj)}---\n\n`;

			const body = this.generateNoteContent({
				...data,
				status,
				dateApplied,
			});

			const fullContent = `${yamlHeader}${body}`;
			const file = await this.app.vault.create(filePath, fullContent);
			this.invalidateCache();
			new Notice(`Created application: ${data.company} - ${data.role}`);
			return file;

		} catch (err) {
			console.error("Job Tracker: Failed to create application:", err);
			new Notice(`Failed to create application. Check console for details.`);
			throw err;
		}
	}

	/**
	 * Parse a TFile into a typed JobApplication object with runtime validation.
	 */
	getApplicationFromCache(file: TFile): JobApplication | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const rawFrontmatter = cache?.frontmatter;

		if (!rawFrontmatter || typeof rawFrontmatter !== "object") {
			return null;
		}

		// Explicitly ignore interview prep notes and non-application types
		if (rawFrontmatter.type === "interview-prep" || rawFrontmatter.type === "interview") {
			return null;
		}

		// Check if file is in interview notes folder
		const interviewFolder = normalizePath(this.plugin.settings.interviewNotesFolderPath);
		if (file.path.startsWith(interviewFolder + "/") || file.path === interviewFolder) {
			return null;
		}

		const isExplicitApp = rawFrontmatter.type === "job-application";
		const rawCompany = typeof rawFrontmatter.company === "string" ? rawFrontmatter.company.trim() : "";
		const rawRole = typeof rawFrontmatter.role === "string" ? rawFrontmatter.role.trim() : "";
		const rawStatus = typeof rawFrontmatter.status === "string" ? rawFrontmatter.status.trim() : "";
		const hasAppFields = Boolean(rawCompany && (rawRole || rawStatus));

		if (!isExplicitApp && !hasAppFields) {
			return null;
		}

		const baseParts = file.basename.split(" - ");
		const company = rawCompany || (baseParts[0]?.trim() || "Unknown Company");
		const role = rawRole || (baseParts[1]?.trim() || "Unknown Role");
		const status = rawStatus || "Applied";

		const contacts: Contact[] = [];
		if (Array.isArray(rawFrontmatter.contacts)) {
			for (const c of rawFrontmatter.contacts) {
				if (c && typeof c === "object" && typeof (c as Record<string, unknown>).name === "string") {
					const cObj = c as Record<string, unknown>;
					contacts.push({
						id: typeof cObj.id === "string" ? cObj.id : String(Date.now()),
						name: String(cObj.name),
						role: typeof cObj.role === "string" ? cObj.role : "Contact",
						email: typeof cObj.email === "string" ? cObj.email : undefined,
						phone: typeof cObj.phone === "string" ? cObj.phone : undefined,
						linkedin: typeof cObj.linkedin === "string" ? cObj.linkedin : undefined,
						notes: typeof cObj.notes === "string" ? cObj.notes : undefined,
					});
				}
			}
		}

		const interviews: InterviewRound[] = [];
		if (Array.isArray(rawFrontmatter.interviews)) {
			for (const iv of rawFrontmatter.interviews) {
				if (iv && typeof iv === "object" && typeof (iv as Record<string, unknown>).roundName === "string") {
					const ivObj = iv as Record<string, unknown>;
					const rawIvStatus = ivObj.status;
					const ivStatus = rawIvStatus === "Completed" || rawIvStatus === "Cancelled" ? rawIvStatus : "Scheduled";
					interviews.push({
						id: typeof ivObj.id === "string" ? ivObj.id : String(Date.now()),
						roundName: String(ivObj.roundName),
						roundType: (typeof ivObj.roundType === "string" ? ivObj.roundType : "Other") as InterviewRoundType,
						date: typeof ivObj.date === "string" ? ivObj.date : undefined,
						time: typeof ivObj.time === "string" ? ivObj.time : undefined,
						interviewers: typeof ivObj.interviewers === "string" ? ivObj.interviewers : undefined,
						prepNotePath: typeof ivObj.prepNotePath === "string" ? ivObj.prepNotePath : undefined,
						status: ivStatus,
						outcomeNotes: typeof ivObj.outcomeNotes === "string" ? ivObj.outcomeNotes : undefined,
					});
				}
			}
		}

		const statusHistory: StatusHistoryEntry[] = [];
		if (Array.isArray(rawFrontmatter.statusHistory)) {
			for (const sh of rawFrontmatter.statusHistory) {
				if (sh && typeof sh === "object" && typeof (sh as Record<string, unknown>).status === "string") {
					const shObj = sh as Record<string, unknown>;
					statusHistory.push({
						status: String(shObj.status),
						date: typeof shObj.date === "string" ? shObj.date : "",
						note: typeof shObj.note === "string" ? shObj.note : undefined,
					});
				}
			}
		}

		return {
			filePath: file.path,
			company,
			role,
			status,
			dateApplied: typeof rawFrontmatter.dateApplied === "string" ? rawFrontmatter.dateApplied : "",
			lastUpdated: typeof rawFrontmatter.lastUpdated === "string" ? rawFrontmatter.lastUpdated : "",
			location: typeof rawFrontmatter.location === "string" ? rawFrontmatter.location : "",
			workplaceType: typeof rawFrontmatter.workplaceType === "string" ? (rawFrontmatter.workplaceType as WorkplaceType) : undefined,
			employmentType: typeof rawFrontmatter.employmentType === "string" ? (rawFrontmatter.employmentType as EmploymentType) : undefined,
			salary: typeof rawFrontmatter.salary === "string" ? rawFrontmatter.salary : "",
			jobUrl: typeof rawFrontmatter.jobUrl === "string" ? rawFrontmatter.jobUrl : "",
			source: typeof rawFrontmatter.source === "string" ? rawFrontmatter.source : "",
			followUpDate: typeof rawFrontmatter.followUpDate === "string" ? rawFrontmatter.followUpDate : undefined,
			closingDate: typeof rawFrontmatter.closingDate === "string" ? rawFrontmatter.closingDate : undefined,
			applicationFolderPath: typeof rawFrontmatter.applicationFolderPath === "string" ? rawFrontmatter.applicationFolderPath : undefined,
			artefacts: this.deserializeArtefacts(rawFrontmatter.artefacts),
			jobDescriptionFile: typeof rawFrontmatter.jobDescriptionFile === "string" ? rawFrontmatter.jobDescriptionFile : "",
			contacts,
			interviews,
			statusHistory,
			tags: Array.isArray(rawFrontmatter.tags) ? rawFrontmatter.tags.map(String) : [],
		};
	}

	/**
	 * Get all job applications in the configured tracker folder. Uses cached list if available.
	 */
	getAllApplications(forceRefresh = false): JobApplication[] {
		if (!forceRefresh && this.cachedApplications !== null) {
			return this.cachedApplications;
		}

		const applications: JobApplication[] = [];
		const folderPrefix = normalizePath(this.plugin.settings.trackerFolderPath);
		const interviewFolderPrefix = normalizePath(this.plugin.settings.interviewNotesFolderPath);

		// Direct scan of configured application folder
		const trackerAbstract = this.app.vault.getAbstractFileByPath(folderPrefix);
		if (trackerAbstract instanceof TFolder) {
			const collectFromFolder = (folder: TFolder) => {
				for (const child of folder.children) {
					if (child instanceof TFile && child.extension === "md") {
						if (!child.path.startsWith(interviewFolderPrefix + "/") && child.path !== interviewFolderPrefix) {
							const appData = this.getApplicationFromCache(child);
							if (appData) applications.push(appData);
						}
					} else if (child instanceof TFolder) {
						if (!child.path.startsWith(interviewFolderPrefix + "/") && child.path !== interviewFolderPrefix) {
							collectFromFolder(child);
						}
					}
				}
			};
			collectFromFolder(trackerAbstract);
		}

		// Sort by last updated / date applied descending
		applications.sort((a, b) => {
			const dateA = a.lastUpdated || a.dateApplied || "";
			const dateB = b.lastUpdated || b.dateApplied || "";
			return dateB.localeCompare(dateA);
		});

		this.cachedApplications = applications;
		return applications;
	}

	/**
	 * Updates the status of an application note, appending to statusHistory and activity log.
	 */
	async updateStatus(file: TFile, newStatus: JobStatus, note?: string): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					const previousStatus = fm.status;
					fm.status = newStatus;
					fm.lastUpdated = today;

					if (!Array.isArray(fm.statusHistory)) {
						fm.statusHistory = [];
					}

					// If previous status was a final status and new status is also a final status,
					// replace the previous final status entry instead of chaining multiple final statuses.
					const isPrevFinal = previousStatus ? isFinalStatus(previousStatus) : false;
					const isNewFinal = isFinalStatus(newStatus);

					if (isPrevFinal && isNewFinal && fm.statusHistory.length > 0) {
						const lastEntry = fm.statusHistory[fm.statusHistory.length - 1];
						if (lastEntry.status && isFinalStatus(lastEntry.status)) {
							lastEntry.status = newStatus;
							lastEntry.date = today;
							lastEntry.note = note || `Final status changed from ${previousStatus || "previous"} to ${newStatus}`;
							return;
						}
					}

					fm.statusHistory.push({
						status: newStatus,
						date: today,
						note: note || `Status updated to ${newStatus}`,
					});
				});

				// If a note was provided, append it to the Notes & Activity Log section in the markdown
				if (note) {
					await this.app.vault.process(file, (content) => {
						return this.appendActivityLogEntry(content, `**${today}** (${escapeMarkdown(newStatus)}): ${escapeMarkdown(note, true)}`);
					});
				}

				this.invalidateCache();
				new Notice(`Updated status to "${newStatus}" for ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update status:", err);
				new Notice(`Failed to update status. Check console for details.`);
			}
		});
	}

	/**
	 * Comprehensive update of application details and job description attachments.
	 */
	async updateApplicationDetails(
		file: TFile,
		fields: Partial<JobApplication>,
		newJobDescriptionText?: string
	): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				let currentData: Partial<JobApplication> = {};
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					this.applyFrontMatterFields(fm, fields);
					fm.lastUpdated = today;
					currentData = {
						company: fm.company,
						role: fm.role,
						salary: fm.salary,
						location: fm.location,
						workplaceType: fm.workplaceType,
						employmentType: fm.employmentType,
						source: fm.source,
						followUpDate: fm.followUpDate,
						closingDate: fm.closingDate,
						applicationFolderPath: fm.applicationFolderPath,
						jobUrl: fm.jobUrl,
						dateApplied: fm.dateApplied,
						jobDescriptionFile: fm.jobDescriptionFile,
					};
				});

				// Update Title, Overview, and Job Description sections in note body
				await this.app.vault.process(file, (content) => {
					let updated = content;

					// 1. Update Title header if company or role were provided
					if (fields.company !== undefined || fields.role !== undefined) {
						const titleRegex = /(?:^|\n)(#\s+[^\n]+)/;
						const company = escapeMarkdown(currentData.company) || "Company";
						const role = escapeMarkdown(currentData.role) || "Role";
						const newTitle = `# ${company} - ${role}`;
						if (titleRegex.test(updated)) {
							updated = updated.replace(titleRegex, (fullMatch) => {
								const prefix = fullMatch.startsWith("\n") ? "\n" : "";
								return `${prefix}${newTitle}`;
							});
						}
					}

					// 2. Update Overview section
					const overviewSectionRegex = /(?:^|\n)(#{1,6}\s+(?:📋\s*)?Overview)[\s\S]*?(?=\n#{1,6}\s+|$)/i;
					const newOverviewContent = this.formatOverviewSection(currentData);
					if (overviewSectionRegex.test(updated)) {
						updated = updated.replace(overviewSectionRegex, (fullMatch) => {
							const prefix = fullMatch.startsWith("\n") ? "\n" : "";
							return `${prefix}${newOverviewContent.trimEnd()}`;
						});
					}

					// 3. Update Job Description section if updated
					if (fields.jobDescriptionFile !== undefined || newJobDescriptionText !== undefined) {
						const jdHeader = "## 📄 Job Description";
						const jdSectionRegex = /(?:^|\n)(#{1,6}\s+(?:📄\s*)?Job Description)([\s\S]*?)(?=\n#{1,6}\s+|$)/i;
						const existingSection = updated.match(jdSectionRegex);
						const existingText = existingSection?.[2]
							.replace(/^\s*> \[!abstract\][^\n]*(?:\r?\n>.*)*/m, "")
							.trim() || "";
						const descriptionText = newJobDescriptionText === undefined ? existingText : newJobDescriptionText;
						let newJdContent = `${jdHeader}\n`;
						if (currentData.jobDescriptionFile) {
							const isPdf = currentData.jobDescriptionFile.toLowerCase().endsWith(".pdf");
							const title = isPdf ? "Job Description (PDF)" : "Job Description (Markdown)";
							newJdContent += `> [!abstract]- 📎 ${title}\n> ![[${currentData.jobDescriptionFile}]]\n\n`;
						}
						if (descriptionText) {
							newJdContent += `${descriptionText}\n`;
						} else if (!currentData.jobDescriptionFile) {
							newJdContent += `*Paste job description or requirements here...*\n`;
						}

						if (jdSectionRegex.test(updated)) {
							updated = updated.replace(jdSectionRegex, (fullMatch, header) => {
								const prefix = fullMatch.startsWith("\n") ? "\n" : "";
								return `${prefix}${header}\n${newJdContent.substring(jdHeader.length + 1).trimEnd()}`;
							});
						} else {
							updated = `${updated.trimEnd()}\n\n${newJdContent.trimEnd()}\n`;
						}
					}

					return updated;
				});

				this.invalidateCache();
				new Notice(`Updated application details for ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update application details:", err);
				new Notice(`Failed to update application details. Check console for details.`);
			}
		});
	}

	/**
	 * Update general application frontmatter fields.
	 */
	async updateApplicationFields(file: TFile, fields: Partial<JobApplication>): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					this.applyFrontMatterFields(fm, fields);
					fm.lastUpdated = today;
				});
				this.invalidateCache();
			} catch (err) {
				console.error("Job Tracker: Failed to update application fields:", err);
				new Notice(`Failed to update application fields. Check console for details.`);
			}
		});
	}

	/**
	 * Add a contact to an application note and update the markdown body.
	 */
	async addContactToApplication(file: TFile, contact: Contact): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (!Array.isArray(fm.contacts)) {
						fm.contacts = [];
					}
					fm.contacts.push(contact);
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});

				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });

				this.invalidateCache();
				new Notice(`Added contact ${contact.name} to ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to add contact to application:", err);
				new Notice(`Failed to add contact to application. Check console for details.`);
			}
		});
	}

	/**
	 * Creates an interview prep note based on the plugin template.
	 */
	async createInterviewPrepNote(
		appData: JobApplication,
		interview: InterviewRound
	): Promise<TFile> {
		const folderPath = this.plugin.settings.interviewNotesFolderPath;
		await this.ensureFolder(folderPath);

		let baseFileName = this.sanitizeFileName(
			`${appData.company} - ${interview.roundName} - Prep`
		);
		if (baseFileName.length > 180) {
			baseFileName = baseFileName.substring(0, 180).trim();
		}
		let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(filePath) != null && counter < 1000) {
			filePath = `${normalizePath(folderPath)}/${baseFileName} (${counter}).md`;
			counter++;
		}

		const appFile = this.resolveFile(appData.filePath);
		const appTitle = appFile instanceof TFile ? appFile.basename : `${appData.company} - ${appData.role}`;

		const template = this.plugin.settings.interviewPrepTemplate || "";
		const escapeVal = (val?: string) => (val ? val.replace(/\\/g, "\\\\").replace(/"/g, '\\"') : "");
		const replacements: Record<string, string> = {
			"{{company}}": escapeVal(appData.company),
			"{{role}}": escapeVal(appData.role),
			"{{roundName}}": escapeVal(interview.roundName),
			"{{date}}": escapeVal(interview.date || this.getTodayDateString()),
			"{{time}}": escapeVal(interview.time || "TBD"),
			"{{interviewers}}": escapeVal(interview.interviewers || "TBD"),
			"{{applicationNoteTitle}}": escapeVal(appTitle),
		};
		const renderedContent = template.replace(
			/\{\{(?:company|role|roundName|date|time|interviewers|applicationNoteTitle)\}\}/g,
			(match) => replacements[match] ?? match
		);

		const prepFile = await this.app.vault.create(filePath, renderedContent);
		new Notice(`Created interview prep note: ${prepFile.basename}`);
		return prepFile;
	}

	/**
	 * Add an interview round to an application note, generate prep note if requested, and update markdown.
	 */
	async addInterviewToApplication(
		file: TFile,
		interview: InterviewRound,
		createPrepNote = true,
		autoUpdateStatus = true
	): Promise<{ interview: InterviewRound; prepFile?: TFile }> {
		return await this.runWithFileLock(file, async () => {
			try {
				const appData = this.getApplicationFromCache(file);
				let prepFile: TFile | undefined;

				if (createPrepNote && appData) {
					prepFile = await this.createInterviewPrepNote(appData, interview);
					interview.prepNotePath = prepFile.path;
				}

				const today = this.getTodayDateString();

				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (!Array.isArray(fm.interviews)) {
						fm.interviews = [];
					}
					fm.interviews.push(interview);
					fm.lastUpdated = today;

					// Bump status to Interviewing unless already in Interviewing or a later status (e.g. Offer or final)
					const currentStatus = fm.status || "Applied";
					if (autoUpdateStatus && currentStatus !== "Interviewing" && currentStatus !== "Offer" && !isFinalStatus(currentStatus)) {
						fm.status = "Interviewing";
						if (!Array.isArray(fm.statusHistory)) fm.statusHistory = [];
						fm.statusHistory.push({
							status: "Interviewing",
							date: today,
							note: `Scheduled interview: ${interview.roundName}`,
						});
					}

					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});

				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });

				this.invalidateCache();
				new Notice(`Added ${interview.roundName} to ${file.basename}`);
				return { interview, prepFile };

			} catch (err) {
				console.error("Job Tracker: Failed to add interview to application:", err);
				new Notice(`Failed to add interview to application. Check console for details.`);
				throw err;
			}
		});
	}

	/**
	 * Log interview outcome/debrief and update notes.
	 */
	async updateInterviewOutcome(
		file: TFile,
		interviewId: string,
		status: "Completed" | "Cancelled",
		outcomeNotes?: string,
		newJobStatus?: JobStatus
	): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.interviews)) {
						const iv = fm.interviews.find((i: InterviewRound) => i.id === interviewId);
						if (iv) {
							iv.status = status;
							if (outcomeNotes) {
								iv.outcomeNotes = outcomeNotes;
							}
						}
					}

					if (newJobStatus) {
						fm.status = newJobStatus;
						if (!Array.isArray(fm.statusHistory)) fm.statusHistory = [];
						fm.statusHistory.push({
							status: newJobStatus,
							date: today,
							note: outcomeNotes || `Interview ${status} -> Moved to ${newJobStatus}`,
						});
					}

					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});

				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });

				if (outcomeNotes) {
					await this.app.vault.process(file, (content) => {
						return this.appendActivityLogEntry(content, `**${today}** (Interview ${escapeMarkdown(status)}): ${escapeMarkdown(outcomeNotes, true)}`);
					});
				}

				this.invalidateCache();
				new Notice(`Logged outcome for interview on ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update interview outcome:", err);
				new Notice(`Failed to update interview outcome. Check console for details.`);
			}
		});
	}

	/**
	 * Moves an application file to Obsidian trash respecting user deletion preference.
	 */
	async deleteApplication(file: TFile): Promise<void> {
		try {
			const name = file.basename;
			await this.app.fileManager.trashFile(file);
			this.invalidateCache();
			new Notice(`Moved "${name}" to trash.`);

		} catch (err) {
			console.error("Job Tracker: Failed to delete application:", err);
			new Notice(`Failed to delete application. Check console for details.`);
		}
	}

	/**
	 * Synchronizes Key Contacts and Interviews markdown body sections.
	 * Accepts optional pre-fetched data to avoid reading from the (potentially stale) metadata cache
	 * when called immediately after processFrontMatter.
	 */
	async syncNoteBodySections(
		file: TFile,
		freshData?: { contacts?: Contact[]; interviews?: InterviewRound[] }
	): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			await this._syncNoteBodySections(file, freshData);
		});
	}

	private async _syncNoteBodySections(
		file: TFile,
		freshData?: { contacts?: Contact[]; interviews?: InterviewRound[] }
	): Promise<void> {
		let contacts: Contact[];
		let interviews: InterviewRound[];

		if (freshData) {
			contacts = freshData.contacts ?? [];
			interviews = freshData.interviews ?? [];
		} else {
			const appData = this.getApplicationFromCache(file);
			if (!appData) return;
			contacts = appData.contacts ?? [];
			interviews = appData.interviews ?? [];
		}

		await this.app.vault.process(file, (content) => {
			let updated = content;

			// Contacts section
			const contactHeader = "## 👥 Key Contacts";
			let newContactsSection = `${contactHeader}\n`;
			if (contacts.length > 0) {
				for (const c of contacts) {
					newContactsSection += `${this.formatContactLine(c)}\n`;
				}
			} else {
				newContactsSection += `*No contacts added yet.*\n`;
			}

			const contactSectionRegex = /(?:^|\n)(#{1,6}\s+(?:👥\s*)?Key Contacts)[\s\S]*?(?=\n#{1,6}\s+|$)/i;
			if (contactSectionRegex.test(updated)) {
				updated = updated.replace(contactSectionRegex, (fullMatch, header) => {
					const prefix = fullMatch.startsWith("\n") ? "\n" : "";
					return `${prefix}${header}\n${newContactsSection.substring(contactHeader.length + 1).trimEnd()}`;
				});
			} else if (contacts.length > 0) {
				// Fallback: append Key Contacts section if not found
				updated = `${updated.trimEnd()}\n\n${newContactsSection.trimEnd()}\n`;
			}

			// Interviews section
			const interviewHeader = "## 📅 Interviews & Stages";
			let newInterviewsSection = `${interviewHeader}\n`;
			if (interviews.length > 0) {
				for (const iv of interviews) {
					newInterviewsSection += `${this.formatInterviewLine(iv)}\n`;
				}
			} else {
				newInterviewsSection += `*No interviews scheduled yet.*\n`;
			}

			const interviewSectionRegex = /(?:^|\n)(#{1,6}\s+(?:📅\s*)?Interviews\s*(?:&|and)?\s*Stages)[\s\S]*?(?=\n#{1,6}\s+|$)/i;
			if (interviewSectionRegex.test(updated)) {
				updated = updated.replace(interviewSectionRegex, (fullMatch, header) => {
					const prefix = fullMatch.startsWith("\n") ? "\n" : "";
					return `${prefix}${header}\n${newInterviewsSection.substring(interviewHeader.length + 1).trimEnd()}`;
				});
			} else if (interviews.length > 0) {
				// Fallback: append Interviews & Stages section if not found
				updated = `${updated.trimEnd()}\n\n${newInterviewsSection.trimEnd()}\n`;
			}

			return updated;
		});
	}

	/**
	 * Updates an existing contact and syncs markdown note body.
	 */
	async updateContact(file: TFile, contactId: string, updated: Partial<Contact>): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.contacts)) {
						const idx = fm.contacts.findIndex((c: Contact) => c.id === contactId);
						if (idx !== -1) {
							fm.contacts[idx] = { ...fm.contacts[idx], ...updated };
						}
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Updated contact on ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update contact:", err);
				new Notice(`Failed to update contact. Check console for details.`);
			}
		});
	}

	/**
	 * Deletes a contact from frontmatter and note body.
	 */
	async deleteContact(file: TFile, contactId: string): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.contacts)) {
						fm.contacts = fm.contacts.filter((c: Contact) => c.id !== contactId);
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Removed contact from ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to delete contact:", err);
				new Notice(`Failed to delete contact. Check console for details.`);
			}
		});
	}

	/**
	 * Updates an interview round and syncs markdown note body.
	 */
	async updateInterview(file: TFile, interviewId: string, updated: Partial<InterviewRound>): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.interviews)) {
						const idx = fm.interviews.findIndex((i: InterviewRound) => i.id === interviewId);
						if (idx !== -1) {
							fm.interviews[idx] = { ...fm.interviews[idx], ...updated };
						}
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Updated interview round on ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update interview:", err);
				new Notice(`Failed to update interview. Check console for details.`);
			}
		});
	}

	/**
	 * Deletes an interview round from frontmatter and note body.
	 */
	async deleteInterview(file: TFile, interviewId: string): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.interviews)) {
						fm.interviews = fm.interviews.filter((i: InterviewRound) => i.id !== interviewId);
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Removed interview round from ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to delete interview:", err);
				new Notice(`Failed to delete interview. Check console for details.`);
			}
		});
	}
}
