export type DefaultJobStatus =
	| "Wishlist"
	| "Applied"
	| "Screening"
	| "Interviewing"
	| "Offer"
	| "Accepted"
	| "Rejected"
	| "Withdrawn"
	| "Ghosted";

export type JobStatus = DefaultJobStatus | (string & {});

export const FINAL_STATUSES = [
	"Accepted",
	"Rejected",
	"Withdrawn",
	"Ghosted",
] as const;

export const FINAL_STATUS_SET: ReadonlySet<string> = new Set(FINAL_STATUSES);

export function isFinalStatus(status: string): boolean {
	return FINAL_STATUS_SET.has(status);
}

export interface Contact {
	id: string;
	name: string;
	role: string; // e.g. "Recruiter", "Coordinator", "Hiring Manager", "Peer"
	email?: string;
	phone?: string;
	linkedin?: string;
	notes?: string;
}

export type InterviewRoundType =
	| "Recruiter Screen"
	| "Technical Screen"
	| "Hiring Manager"
	| "System Design"
	| "Coding Challenge"
	| "Behavioral"
	| "Onsite / Panel"
	| "Executive / Final"
	| "Other";

export interface InterviewRound {
	id: string;
	roundName: string;
	roundType: InterviewRoundType;
	date?: string; // YYYY-MM-DD
	time?: string; // HH:mm
	interviewers?: string;
	prepNotePath?: string;
	status: "Scheduled" | "Completed" | "Cancelled";
	outcomeNotes?: string;
}

export interface StatusHistoryEntry {
	status: JobStatus;
	date: string; // YYYY-MM-DD
	note?: string;
}

export type WorkplaceType = "Remote" | "Hybrid" | "On-site";

export type EmploymentType = "Full-time" | "Contract" | "Part-time" | "Internship";

export type ArtefactType =
	| "Job Description"
	| "CV"
	| "Cover Letter"
	| "Interview Notes"
	| "Recruiter Notes"
	| "Follow-up Notes"
	| "General Notes"
	| "Portfolio"
	| "Assessment"
	| "Offer Letter"
	| "Contract"
	| "Custom";

export const ARTEFACT_TYPES: readonly ArtefactType[] = [
	"Job Description",
	"CV",
	"Cover Letter",
	"Interview Notes",
	"Recruiter Notes",
	"Follow-up Notes",
	"General Notes",
	"Portfolio",
	"Assessment",
	"Offer Letter",
	"Contract",
	"Custom",
];

export interface ApplicationArtefact {
	id: string;
	type: ArtefactType;
	path: string;
	filename: string;
	createdAt: string;
	updatedAt: string;
	exists?: boolean;
}

export function isAbsoluteFilePath(path: string): boolean {
	return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/");
}

export type DeadlineStatus = "overdue" | "within-7-days" | "within-14-days" | "later" | "none";

export function getDeadlineStatus(date?: string, now = new Date()): DeadlineStatus {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "none";
	const [year, month, day] = date.split("-").map(Number);
	const normalizedDate = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
	if (normalizedDate !== date) return "none";
	const deadline = Date.UTC(year, month - 1, day);
	const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	const daysRemaining = Math.round((deadline - today) / 86400000);
	if (daysRemaining < 0) return "overdue";
	if (daysRemaining <= 7) return "within-7-days";
	if (daysRemaining <= 14) return "within-14-days";
	return "later";
}

export interface JobApplication {
	filePath: string;
	company: string;
	role: string;
	status: JobStatus;
	dateApplied: string; // YYYY-MM-DD
	datePosted?: string; // YYYY-MM-DD
	lastUpdated: string; // YYYY-MM-DD
	location?: string;
	workplaceType?: WorkplaceType;
	employmentType?: EmploymentType;
	salary?: string;
	jobUrl?: string;
	source?: string; // e.g. "LinkedIn", "Referral", "Indeed", "Company Site"
	followUpDate?: string; // YYYY-MM-DD
	closingDate?: string; // YYYY-MM-DD
	applicationFolderPath?: string;
	artefacts: ApplicationArtefact[];
	contacts: Contact[];
	interviews: InterviewRound[];
	statusHistory: StatusHistoryEntry[];
	tags: string[];
	jobDescriptionFile?: string; // Path or name of attached PDF or MD file
}

export type SavedViewMode = "kanban" | "table" | "list" | "metrics" | "gallery" | "company";

export interface SavedTrackerView {
	id: string;
	name: string;
	mode: SavedViewMode;
	search?: string;
	status: string;
	company: string;
	tags: string[];
	location: string;
	deadline: string;
	sortField: JobSortField;
	sortAscending: boolean;
}

export interface JobApplicationTrackerSettings {
	trackerFolderPath: string;
	interviewNotesFolderPath: string;
	attachmentsFolderPath: string;
	statuses: JobStatus[];
	defaultStatus: JobStatus;
	interviewPrepTemplate: string;
	defaultSourceOptions: string[];
	openViewLocation: "tab" | "right-sidebar" | "left-sidebar";
	autoMoveArtefacts: boolean;
	applicationTagOptions: string[];
	hiddenTableColumns: string[];
	tableColumnsInitialized: boolean;
	savedViews: SavedTrackerView[];
}

export interface JobApplicationFrontMatter {
	type?: string;
	company?: string;
	role?: string;
	status?: JobStatus;
	dateApplied?: string;
	datePosted?: string;
	lastUpdated?: string;
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
	jobDescriptionFile?: string;
	tags?: string[];
	contacts?: Contact[];
	interviews?: InterviewRound[];
	statusHistory?: StatusHistoryEntry[];
	[key: string]: unknown;
}export type JobSortField =
	| "company"
	| "role"
	| "status"
	| "datePosted"
	| "jobUrl"
	| "tags"
	| "folder"
	| "jobDescription"
	| "cvs"
	| "coverLetters"
	| "notes"
	| "artefacts"
	| "dateApplied"
	| "location"
	| "salary"
	| "source"
	| "lastUpdated"
	| "followUpDate"
	| "closingDate";
