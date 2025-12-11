import { Component, Input, Output, EventEmitter, NgZone } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-circular-progress-bar',
  templateUrl: './circular-progress-bar.component.html',
  styleUrls: ['./circular-progress-bar.component.scss'],
})
export class CircularProgressBarComponent {
  @Input() firstLabel!: string;
  @Input() statusMessage: string | null = null; // New input for status messages

  private _secondLabel: string | null = null;

  @Input()
  set secondLabel(value: string | null) {
    this._secondLabel = value;
    this._onSecondLabelChange(value);
  }
  get secondLabel(): string | null {
    return this._secondLabel;
  }
  @Input() icon: string | null = null;
  @Input() progressValue!: number;
  @Input() currentRateUpload!: number;
  @Input() currentRateDownload!: number;
  @Input() error: boolean = false;
  @Input() completed: boolean = false;

  @Output() startTest = new EventEmitter<void>();
  @Output() showError = new EventEmitter<boolean>();

  isSpinnerVisible = false;
  private hideTimeout: any = null;

  constructor(private ngZone: NgZone, private cd: ChangeDetectorRef) {}

  private _onSecondLabelChange(label: string | null) {
    if (label === 'DOWNLOAD' || label === 'UPLOAD') {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      this.ngZone.run(() => {
        this.isSpinnerVisible = true;
        this.cd.markForCheck(); // fuerza Angular a actualizar el template
      });
      return;
    }

    if (label === 'TEST AGAIN' || label === null) {
      if (this.hideTimeout) clearTimeout(this.hideTimeout);
      this.hideTimeout = setTimeout(() => {
        this.ngZone.run(() => {
          this.isSpinnerVisible = false;
          this.hideTimeout = null;
          this.cd.markForCheck();
        });
      }, 200);
    }
  }

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
    if (this._secondLabel) return 'fill-color-tertiary';
    if (this.error) return 'fill-color-text-error';
    return 'fill-white';
  }

  getGreenColorClass(): string {
    return 'fill-green';
  }

  // Method to split status message into lines for better display
  getStatusMessageLines(): string[] {
    if (!this.statusMessage) return [];

    // Split long messages into multiple lines
    const maxCharsPerLine = 12; // Adjust based on circle size
    const words = this.statusMessage.split(' ');
    const lines: string[] = [];
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

    // Limit to maximum 2 lines to fit in circle
    return lines.slice(0, 2);
  }
}
