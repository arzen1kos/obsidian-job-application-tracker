import { JobApplication } from "../../types";
import { getStatusClassName } from "../../constants";
import { JobTrackerView } from "../JobTrackerView";

export class CompanyRenderer {
	private sortMode = 0;
	private readonly sortModes = ["Company A-Z", "Company Z-A", "Count low-high", "Count high-low"];

	constructor(private readonly view: JobTrackerView) {}

	render(container: HTMLElement, applications: JobApplication[]): void {
		const groups = new Map<string, JobApplication[]>();
		for (const application of applications) {
			const entries = groups.get(application.company) || [];
			entries.push(application);
			groups.set(application.company, entries);
		}
		const list = container.createDiv({ cls: "job-tracker-company-list" });
		const controls = list.createDiv({ cls: "job-tracker-company-sort" });
		const sortButton = controls.createEl("button", {
			text: `Sort: ${this.sortModes[this.sortMode]}`,
		});
		sortButton.onclick = () => {
			this.sortMode = (this.sortMode + 1) % this.sortModes.length;
			this.render(container, applications);
		};
		const sortByCount = this.sortMode >= 2;
		const ascending = this.sortMode === 0 || this.sortMode === 2;
		const companies = [...groups.entries()].sort(([nameA, appsA], [nameB, appsB]) =>
			sortByCount ? appsA.length - appsB.length || nameA.localeCompare(nameB) : nameA.localeCompare(nameB)
		);
		if (!ascending) companies.reverse();
		for (const [company, entries] of companies) {
			const card = list.createDiv({ cls: "job-tracker-company-card" });
			const header = card.createDiv({ cls: "job-tracker-company-heading" });
			header.createEl("h3", { text: company });
			header.createSpan({ text: `${entries.length} application${entries.length === 1 ? "" : "s"}` });
			const statusCounts = new Map<string, number>();
			for (const entry of entries) statusCounts.set(entry.status, (statusCounts.get(entry.status) || 0) + 1);
			const breakdown = card.createDiv({ cls: "job-tracker-company-statuses" });
			for (const [status, count] of statusCounts) {
				breakdown.createSpan({
					text: `${status}: ${count}`,
					cls: `job-tracker-company-status ${getStatusClassName(status)}`,
				});
			}
			for (const application of entries) {
				const row = card.createEl("button", {
					cls: "job-tracker-company-application",
					text: `${application.role} · ${application.status}`,
				});
				row.onclick = () => {
					this.view.selectedApplication = application;
					this.view.renderContentOnly();
				};
			}
		}
	}
}
