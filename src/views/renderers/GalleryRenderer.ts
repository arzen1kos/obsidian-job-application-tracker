import { getDeadlineStatus, JobApplication } from "../../types";
import { getStatusClassName } from "../../constants";
import { JobTrackerView } from "../JobTrackerView";

export class GalleryRenderer {
	constructor(private readonly view: JobTrackerView) {}

	render(container: HTMLElement, applications: JobApplication[]): void {
		const gallery = container.createDiv({ cls: "job-tracker-gallery" });
		for (const application of applications) {
			const card = gallery.createDiv({
				cls: `job-tracker-gallery-card ${getStatusClassName(application.status)}`,
				attr: { role: "button", tabindex: "0" },
			});
			card.onclick = () => {
				this.view.selectedApplication = application;
				this.view.renderContentOnly();
			};
			card.onkeydown = (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					this.view.selectedApplication = application;
					this.view.renderContentOnly();
				}
			};
			card.createDiv({ cls: "job-tracker-gallery-status", text: application.status });
			card.createEl("h3", { text: application.company });
			card.createEl("h4", { text: application.role });
			card.createDiv({ cls: "job-tracker-gallery-location", text: application.location || "Location not set" });
			const closing = application.closingDate || "No closing date";
			card.createDiv({
				cls: `job-tracker-gallery-closing deadline-${getDeadlineStatus(application.closingDate)}`,
				text: closing,
			});
		}
	}
}
