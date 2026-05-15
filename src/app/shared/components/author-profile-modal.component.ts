import { Component, inject, OnInit, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TranslocoPipe } from "@jsverse/transloco";
import { ProjectService } from "../../core/services/project.service";
import { AuthorProfile } from "../../core/models/project.model";
import { InkModalComponent } from "./ink-modal.component";
import { InkButtonComponent } from "./ink-button.component";

@Component({
  selector: "ink-author-profile-modal",
  standalone: true,
  imports: [InkModalComponent, InkButtonComponent, FormsModule, TranslocoPipe],
  styles: [
    `
      .field-label {
        color: var(--ink-subtle);
        font-size: 0.7rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .field-input {
        width: 100%;
        padding: 0.4rem 0.6rem;
        border-radius: 0.25rem;
        background: var(--ink-bg);
        border: 1px solid var(--ink-border);
        color: var(--ink-text);
        font-size: 0.8rem;
      }
      .field-input:focus {
        outline: none;
        border-color: var(--ink-accent);
      }
      .field-input::placeholder {
        color: var(--ink-muted);
      }
    `,
  ],
  templateUrl: "./author-profile-modal.component.html",
})
export class AuthorProfileModalComponent implements OnInit {
  projectService = inject(ProjectService);

  closed = output<void>();

  legalName = "";
  penName = "";
  email = "";
  phone = "";
  address = "";
  agentName = "";
  agentContact = "";
  genre = "";
  language = "es";
  copyrightYear = new Date().getFullYear();
  publisher = "";

  saving = signal(false);

  ngOnInit(): void {
    const p = this.projectService.project()?.authorProfile;
    if (p) {
      this.legalName = p.legalName;
      this.penName = p.penName ?? "";
      this.email = p.email;
      this.phone = p.phone ?? "";
      this.address = p.address ?? "";
      this.agentName = p.agentName ?? "";
      this.agentContact = p.agentContact ?? "";
      this.genre = p.genre;
      this.language = p.language;
      this.copyrightYear = p.copyrightYear;
      this.publisher = p.publisher ?? "";
    }
  }

  canSave(): boolean {
    return !!(this.legalName.trim() && this.email.trim() && this.genre.trim());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.projectService.updateAuthorProfile({
        legalName: this.legalName,
        penName: this.penName || undefined,
        email: this.email,
        phone: this.phone || undefined,
        address: this.address || undefined,
        agentName: this.agentName || undefined,
        agentContact: this.agentContact || undefined,
        genre: this.genre,
        language: this.language,
        copyrightYear: this.copyrightYear,
        publisher: this.publisher || undefined,
      });
      this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
