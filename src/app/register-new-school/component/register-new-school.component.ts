import { Component, OnInit, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonCheckbox, IonInput } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { GeocodeResponse } from 'src/app/services/dto/response.dto';
import { LoadingService } from 'src/app/services/loading.service';
import { LocationService } from 'src/app/services/location.service';
import { SchoolService } from 'src/app/services/school.service';
import { SettingsService } from 'src/app/services/settings.service';
import { SchoolRegistration } from 'src/app/services/dto/school.dto';
import { StorageService } from 'src/app/services/storage.service';
import { SharedService } from 'src/app/services/shared-service.service';
import { CountryService } from 'src/app/services/country.service';
import { Device } from '@capacitor/device';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-register-new-school',
  templateUrl: './register-new-school.component.html',
  styleUrls: ['./register-new-school.component.scss'],
  standalone: false,
})
export class RegisterNewSchoolComponent implements OnInit {
  @ViewChild('termsCheckbox') termsCheckbox!: IonCheckbox;
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
  ipAddress: string = '';
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

        const schoolIdValue = this.schoolForm.get('schoolId')?.value;
        let schoolExists = false;
        if (this.schoolId !== schoolIdValue) {
          this.loading.present();
          schoolExists = await new Promise((resolve) => {
            this.schoolService
              .getBySchoolIdAndCountryCode(schoolIdValue, this.selectedCountry)
              .subscribe({
                next: (data: any) => {
                  resolve(data && data.length > 0);
                },
                error: () => {
                  resolve(false);
                },
              });
          });
          this.loading.dismiss();
        }
        if (schoolExists) {
          const alert = await this.alertController.create({
            header: this.translate.instant(
              'registerNewSchool.schoolExistsTitle',
            ),
            message: this.translate.instant(
              'registerNewSchool.schoolExistsMessage',
              { schoolId: schoolIdValue },
            ),
            buttons: [this.translate.instant('registerNewSchool.ok')],
          });
          await alert.present();
          return;
        }
        this.schoolId = schoolIdValue;
        const response: GeocodeResponse = JSON.parse(
          this.storage.get('locationInfo'),
        );
        if (response) {
          this.latitude = response.latitude;
          this.longitude = response.longitude;
          this.ipAddress = response.ipAddress;
          this.geoCodeResponse = JSON.parse(JSON.stringify(response));
          delete this.geoCodeResponse.latitude;
          delete this.geoCodeResponse.longitude;
          delete this.geoCodeResponse.ipAddress;
        }
      }
      if (this.currentStep === 2) {
        this.settingsService
          .getShell()
          .shell.openExternal('https://www.google.com');
        return;
      }
      if (this.currentStep === 3) {
        this.loading.present();

        const countryInfo: any = await new Promise((resolve) => {
          this.countryService
            .getPcdcCountryByCode(this.selectedCountry)
            .subscribe({
              next: (response: any) => {
                resolve(response?.[0]);
              },
              error: (error) => {
                resolve(null);
              },
            });
        });

        const response = await new Promise((resolve, reject) => {
          const formValues = this.schoolForm.value;
          const payload: SchoolRegistration = {
            school_id: formValues.schoolId,
            school_name: formValues.schoolName,
            latitude: Number(this.latitude),
            longitude: Number(this.longitude),
            country_iso3_code: countryInfo?.code_iso3 || '',
            address: this.geoCodeResponse,
            education_level: formValues.educationLevel,
            contact_name: formValues.contactName,
            contact_email: formValues.officialEmail,
          };
          this.schoolService.registerNewSchool(payload).subscribe({
            next: async (response: any) => {
              // Get device/network info needed for storage
              const deviceInfo = await Device.getInfo();
              const deviceId = await Device.getId();
              // Store data similar to ConfirmschoolPage
              this.storage.set('deviceType', deviceInfo.operatingSystem);
              this.storage.set('macAddress', deviceId.identifier);
              // For new schools, schoolUserId might not exist yet, using giga_id
              this.storage.set('gigaId', response.data.giga_id_school);
              this.storage.set('schoolId', payload.school_id);
              this.storage.set('school_id', payload.school_id);
              this.storage.set('country_code', this.selectedCountry);
              this.storage.set('ip_address', this.ipAddress);
              this.storage.set('version', environment.app_version);

              // Create a school object mock for storage
              const schoolMock = {
                school_id: payload.school_id,
                school_name: payload.school_name,
                name: payload.school_name,
                giga_id_school: response.data.giga_id_school,
                country: this.selectedCountry.trim(),
                latitude: payload.latitude,
                longitude: payload.longitude,
                is_verified: false,
              };
              this.storage.set('schoolInfo', JSON.stringify(schoolMock));

              // Set first-time visit flags
              this.storage.setFirstTimeVisit(true);
              this.storage.setRegistrationCompleted(Date.now());

              this.settingsService.setSetting('scheduledTesting', true);

              resolve(response);
            },
            error: (error) => {
              console.error(error);
              resolve(null);
            },
          });
        });
        this.loading.dismiss();
        if (response) {
          this.router.navigate(['/starttest']).then(() => {
            this.sharedService.broadcast('registration:completed');
          });
        }
        return;
      }
      this.currentStep++;
      this.updateDashOffset();
    }
  }

  prevStep() {
    if (this.currentStep >= 1) {
      if (this.currentStep === 1) {
        //back url
        this.router.navigate(['/home']);
        return;
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
    private router: Router,
    private storage: StorageService,
    private sharedService: SharedService,
    private countryService: CountryService,
    private alertController: AlertController,
    private translate: TranslateService,
  ) {
    this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName;
    });
  }

  ngOnInit() {
    if (navigator.geolocation) {
    } else {
      console.log('Geolocation is not supported by this environment.');
    }

    this.schoolForm = this.fb.group({
      schoolId: [this.schoolId, [Validators.required]],
      schoolName: ['', [Validators.required]],
      educationLevel: ['', Validators.required],
      contactName: [''],
      officialEmail: ['', [Validators.pattern(this.emailPattern)]],
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
    if (this.currentStep >= 1) {
      if (this.currentStep === 1) {
        //back url
        this.router.navigate([
          '/schoolnotfound',
          this.schoolId,
          this.selectedCountry,
          this.detectedCountry,
          this.selectedCountryName,
        ]);
        return;
      }
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
