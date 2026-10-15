import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-circular-progress-bar',
  templateUrl: './circular-progress-bar.component.html',
  styleUrls: ['./circular-progress-bar.component.scss'],
})
export class CircularProgressBarComponent {
  @Input() firstLabel!: string;
  @Input() secondLabel: string | null = null;
  @Input() statusMessage: string | null = null; // New input for status messages
  @Input() icon: string | null = null;
  @Input() progressValue!: number;
  @Input() currentRateUpload!: number;
  @Input() currentRateDownload!: number;
  @Input() error: boolean = false;
  @Input() completed: boolean = false;

  @Output() startTest = new EventEmitter<void>();
  @Output() showError = new EventEmitter<boolean>();

  constructor(private translate: TranslateService) {}

  handleClick() {
    if (
      this.progressValue === 0 ||
      this.progressValue === 100 ||
      this.error ||
      this.completed
    ) {
      this.startTest.emit();
    }
  }

  getStrokeDashOffset(): string {
    if (!this.error) {
      return `calc(263.9px - (263.9px * ${this.progressValue}) / 100)`;
    } else {
      return `calc(263.9px - (263.9px * 100}) / 100)`;
    }
  }

  getFillColor(): string {
    if (this.progressValue === 0) {
      return 'rgba(70, 198, 109, 0.1)';
    }
    return 'transparent';
  }

  getTextClass(): string {
    if (this.secondLabel) return 'fill-color-tertiary';
    if (this.error) return 'fill-color-text-error';
    return 'fill-white';
  }

  getGreenColorClass(): string {
    return 'fill-green';
  }

  // Method to split status message into lines for better display
  getStatusMessageLines(): string[] {
    if (!this.statusMessage) return [];
    // Limit to maximum 2 lines to fit in circle
    return this.splitIntoLines(this.statusMessage, 12).slice(0, 2);
  }

  /**
   * "Try again" label, wrapped so long translations stay inside the circle.
   * A single line keeps the original size; two lines use a smaller font.
   */
  getTryAgainLines(): string[] {
    const label = this.translate.instant('startTest.tryAgain') as string;
    return this.splitIntoLines(label, 12);
  }

  getTryAgainFontSize(): number {
    return this.getTryAgainLines().length > 1 ? 10 : 12;
  }

  // Greedy word wrap; a line break in the text always starts a new line.
  private splitIntoLines(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = [];

    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(/\s+/).filter((w) => w);
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          currentLine = word;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }
    return lines;
  }
}
