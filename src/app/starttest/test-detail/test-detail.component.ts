import { Component, OnInit } from '@angular/core';
import { CountryService } from 'src/app/services/country.service';
import { HistoryService } from 'src/app/services/history.service';
import { NetworkService } from 'src/app/services/network.service';
import { StorageService } from 'src/app/services/storage.service';
import { Router, NavigationEnd } from '@angular/router';
import { LocationService } from 'src/app/services/location.service';
import { SettingsService } from 'src/app/services/settings.service';

@Component({
  selector: 'app-test-detail',
  templateUrl: './test-detail.component.html',
  styleUrls: ['./test-detail.component.scss'],
  standalone: false,
})
export class TestDetailComponent implements OnInit {
  schoolId: string;
  school: any;
  historicalData: any;
  measurementsData: [];
  locationDetail: any;
  accessInformation = {
    ip: '',
    city: '',
    region: '',
    country: '',
    label: '',
    metro: '',
    site: '',
    url: '',
    fqdn: '',
    loc: '',
    org: '',
    postal: '',
    timezone: '',
    asn: '',
  };
  measurementnetworkServer: any;
  measurementISP: any;
  selectedCountry: any;
  constructor(
    private storage: StorageService,
    private historyService: HistoryService,
    private countryService: CountryService,
    private router: Router,
    private locationService: LocationService,
    private settingsService: SettingsService
  ) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.loadData();
      }
    });
    this.locationDetail = this.locationService.getSavedGeolocation();

  }

  ngOnInit() {
    if (this.storage.get('schoolId')) {
      this.school = JSON.parse(this.storage.get('schoolInfo'));
      this.countryService.getPcdcCountryByCode(this.school.country).subscribe(
        (response) => {
          this.selectedCountry = response[0].name;
        },
        (err) => {
          console.log('ERROR: ' + err);
        }
      );
    }
    this.loadData();
  }

  loadData() {
    let historicalData = this.historyService.get();
    if (
      historicalData !== null &&
      historicalData !== undefined &&
      historicalData.measurements.length
    ) {
      this.measurementnetworkServer =
        historicalData.measurements[
          historicalData.measurements.length - 1
        ].mlabInformation.city;
      this.measurementISP =
        historicalData.measurements[
          historicalData.measurements.length - 1
        ].accessInformation.org;
    }
    this.schoolId = this.storage.get('schoolId');

    if (this.storage.get('historicalDataAll')) {
      this.historicalData = JSON.parse(this.storage.get('historicalDataAll'));
      const allMeasurements = this.historicalData.measurements;

      // Get the last 10 measurements (sorted by timestamp descending)
      this.measurementsData = allMeasurements
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ) // descending order
        .slice(0, 10); // take last 10
    }
  }

  /**
   * Map Notes values to display text for Test Trigger column
   * @param notes The Notes value from measurement data
   * @returns Mapped display text
   */
  getTestTriggerDisplayText(notes: string): string {
    const triggerMapping = {
      startup: 'Startup',
      daily: 'Daily',
      manual: 'Manual',
      first: 'First',
    };

    return triggerMapping[notes] || notes || '-';
  }

  /**
   * Get sync status text based on synced attribute
   * @param measurement The measurement data
   * @returns Status text
   */
  getSyncStatusText(measurement: any): string {
    if (measurement.synced === undefined || measurement.synced === null) {
      return '-';
    }
    return measurement.synced ? 'Synced' : 'Not Synced';
  }

  /**
   * Get CSS class for sync status
   * @param measurement The measurement data
   * @returns CSS class name
   */
  getSyncStatusClass(measurement: any): string {
    if (measurement.synced === undefined || measurement.synced === null) {
      return '';
    }
    return measurement.synced ? 'green_color' : 'orange_color';
  }

  openExternalUrl() {
    this.settingsService.getShell().shell.openExternal('https://www.google.com/maps?q=' + this.locationDetail?.location?.lat + ',' + this.locationDetail?.location?.lng);
  }
}
