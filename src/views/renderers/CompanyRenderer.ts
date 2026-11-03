import { JobApplication } from "../../types";
import { getStatusClassName } from "../../constants";
import { JobTrackerView } from "../JobTrackerView";

export class CompanyRenderer {
	constructor(private readonly view: JobTrackerView) {}

	render(container: HTMLElement, applications: JobApplication[]): void {
		container.empty();
		const groups = new Map<string, JobApplication[]>();
		for (const application of applications) {
			const entries = groups.get(application.company) || [];
			entries.push(application);
			groups.set(application.company, entries);
		}
		const list = container.createDiv({ cls: "job-tracker-company-list" });
		for (const [company, entries] of groups) {
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
