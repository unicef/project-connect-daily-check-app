import { Component, OnInit, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonInput } from '@ionic/angular';
import { GeocodeResponse } from 'src/app/services/dto/response.dto';
import { LoadingService } from 'src/app/services/loading.service';
import { LocationService } from 'src/app/services/location.service';
import { SchoolService } from 'src/app/services/school.service';
import { SettingsService } from 'src/app/services/settings.service';
import { SchoolRegistration } from 'src/app/services/dto/school.dto';

@Component({
  selector: 'app-register-new-school',
  templateUrl: './register-new-school.component.html',
  styleUrls: ['./register-new-school.component.scss'],
  standalone: false,
})
export class RegisterNewSchoolComponent implements OnInit {
  schoolAddressInput!: IonInput;
  isEditingLat = false;
  isEditingLng = false;
  private originalLat = '';
  private originalLng = '';
  isConfirmModalOpen = false;
  confirmType: string = '';
  schoolForm!: FormGroup;
  suggestions: any[] = [];
  latLngVisible = false;
  searchTimeout: any;
  selectedCountry: any;
  detectedCountry: any;
  selectedCountryName: any;
  schoolId: any;
  latitude: number | string = '';
  longitude: number | string = '';
  geoCodeResponse: GeocodeResponse = {} as any;

  emailPattern = '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$';

  // Stepper properties
  currentStep = 1;
  totalSteps = 3;
  radius = 24;
  circumference = 2 * Math.PI * this.radius;
  dashoffset =
    this.circumference -
    (this.currentStep / this.totalSteps) * this.circumference;

  async nextStep() {
    if (this.currentStep <= this.totalSteps) {
      if (this.currentStep === 1) {
        if (this.schoolForm.invalid) {
          console.log('Invalid form', this.schoolForm.value);
          this.schoolForm.markAllAsTouched();
          return;
        }
        this.loading.present();
        const response: GeocodeResponse = await new Promise(
          (resolve, reject) => {
            this.locationService.getCurrentAddress(false).subscribe({
              next: (response: GeocodeResponse) => {
                resolve(response);
              },
              error: (error) => {
                resolve(null);
              },
            });
          },
        );
        if (response) {
          this.latitude = response.latitude;
          this.longitude = response.longitude;
          this.geoCodeResponse = JSON.parse(JSON.stringify(response));
          delete this.geoCodeResponse.latitude;
          delete this.geoCodeResponse.longitude;
        }
        this.loading.dismiss();
      }
      if (this.currentStep === 2) {
        this.settingsService
          .getShell()
          .shell.openExternal('https://www.google.com');
        return;
      }
      if (this.currentStep === 3) {
        this.loading.present();
        const response = await new Promise((resolve, reject) => {
          const formValues = this.schoolForm.value;
          const payload: SchoolRegistration = {
            school_id: formValues.schoolId,
            school_name: formValues.schoolName,
            latitude: Number(this.latitude),
            longitude: Number(this.longitude),
            address: this.geoCodeResponse,
            education_level: formValues.educationLevel,
            contact_name: formValues.contactName,
            contact_email: formValues.officialEmail,
          };
          this.schoolService.registerNewSchool(payload).subscribe({
              next: (response: any) => {
                resolve(response);
                debugger;
              },
              error: (error) => {
                resolve(null);
              },
            });
        });
        this.loading.dismiss();
        if (!response) {
         return;
        }
      }
      this.currentStep++;
      this.updateDashOffset();
    }
  }

  prevStep() {
    if (this.currentStep >= 1) {
      if (this.currentStep === 1) {
        this.isConfirmModalOpen = false;
      }
      this.currentStep--;
      this.updateDashOffset();
    }
  }

  updateDashOffset() {
    this.dashoffset =
      this.circumference -
      (this.currentStep / this.totalSteps) * this.circumference;
  }

  constructor(
    private fb: FormBuilder,
    private activatedroute: ActivatedRoute,
    private settingsService: SettingsService,
    private locationService: LocationService,
    private loading: LoadingService,
    private schoolService: SchoolService,
  ) {
    this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName;
      console.log(this.selectedCountry);
    });
  }

  ngOnInit() {
    if (navigator.geolocation) {
    } else {
      console.log('Geolocation is not supported by this environment.');
    }
    this.schoolForm = this.fb.group({
      schoolId: ['', [Validators.required]],
      schoolName: ['', [Validators.required]],
      contactName: ['', Validators.required],
      educationLevel: ['', Validators.required],
      officialEmail: [
        '',
        [Validators.required, Validators.pattern(this.emailPattern)],
      ],
    });
  }

  // Called on typing in the address input
  async onSearchChange(event: any) {
    const query = (
      await this.schoolAddressInput.getInputElement()
    ).value.trim();
    if (!query) {
      this.suggestions = [];
      return;
    }

    // Debounce (simulate network delay)
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      // Mock API response (replace with your actual API call)
      this.suggestions = [
        { place: 'Meerut, Uttar Pradesh', lat: 28.98, lng: 77.7 },
        { place: 'New Delhi, India', lat: 28.61, lng: 77.23 },
        { place: 'Gurgaon, Haryana', lat: 28.46, lng: 77.03 },
        { place: 'Noida, Uttar Pradesh', lat: 28.54, lng: 77.39 },
      ].filter((item) =>
        item.place.toLowerCase().includes(query.toLowerCase()),
      );
    }, 300);
  }

  selectSuggestion(suggestion: any) {
    this.schoolForm.patchValue({
      schoolAddress: suggestion.place,
      latitude: suggestion.lat,
      longitude: suggestion.lng,
    });

    this.suggestions = [];
    this.latLngVisible = true;
  }

  clearLatLng() {
    this.schoolForm.patchValue({ latitude: '', longitude: '' });
    this.latLngVisible = false;
  }

  onRegister() {
    if (this.schoolForm.invalid) {
      this.schoolForm.markAllAsTouched();
      return;
    }

    const formData = { ...this.schoolForm.value };

    console.log('Final Data:', formData);
  }

  backToSaved(school: any) {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.updateDashOffset();
    }
    console.log('Go back clicked', school);
  }

  enableEdit(type: 'lat' | 'lng' | 'both') {
    this.isEditingLat = true;
    this.isEditingLng = true;
    this.originalLat = this.schoolForm.get('latitude')?.value || '';
    this.originalLng = this.schoolForm.get('longitude')?.value || '';
  }

  cancelEdit(type: 'lat' | 'lng' | 'both') {
    this.schoolForm.patchValue({
      latitude: this.originalLat,
      longitude: this.originalLng,
    });
    this.isEditingLat = false;
    this.isEditingLng = false;
  }

  async saveEdit(type: 'lat' | 'lng' | 'both') {
    this.confirmType = 'location';
    this.isConfirmModalOpen = true;
  }

  closeConfirmModal(confirm: boolean) {
    if (confirm) {
      this.isEditingLat = false;
      this.isEditingLng = false;
      console.log('✅ Saved values:', this.schoolForm.value);
    } else {
      // Revert if cancelled
      this.schoolForm.patchValue({
        latitude: this.originalLat,
        longitude: this.originalLng,
      });
      this.isEditingLat = false;
      this.isEditingLng = false;
    }

    this.isConfirmModalOpen = false;
    this.confirmType = '';
  }

  emailDomainValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;

    return emailPattern.test(value) ? null : { invalidEmail: true };
  }

  nextSkip() {
    this.currentStep++;
    this.updateDashOffset();
  }

  openExternalUrl(url: string) {
    this.settingsService.getShell().shell.openExternal(url);
  }
}
